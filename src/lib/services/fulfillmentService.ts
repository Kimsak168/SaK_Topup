import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Order, IOrder } from "@/models/Order";
import {
  createWebBuilderOrder,
  pollWebBuilderOrderUntilFinal,
  getWebBuilderOrder,
  generateWebBuilderIdempotencyKey,
  computeOrderRequestHash,
} from "@/lib/suppliers/webbuilder";

export interface FulfillmentResult {
  success: boolean;
  orderNumber: string;
  fulfillmentStatus: string;
  message: string;
  supplierOrderId?: string;
}

/**
 * Automatically fulfill an order with WebBuilder API.
 * Implements atomic fulfillment claiming to guarantee that duplicate purchases cannot be submitted.
 */
export async function triggerAutomaticFulfillment(
  orderNumber: string
): Promise<FulfillmentResult> {
  await connectDB();

  // ATOMIC CLAIM: Ensure order is PAID and fulfillment is NOT_STARTED / pending.
  // Transition directly to 'processing' atomically.
  const order = (await Order.findOneAndUpdate(
    {
      orderNumber,
      paymentStatus: { $in: ["PAID", "paid"] },
      fulfillmentStatus: { $in: ["NOT_STARTED", "pending"] },
    },
    {
      $set: {
        fulfillmentStatus: "processing",
        updatedAt: new Date(),
      },
    },
    { new: true }
  )) as IOrder | null;

  if (!order) {
    // Check if the order is already in progress or already completed
    const existing = await Order.findOne({ orderNumber }).lean();
    if (!existing) {
      return {
        success: false,
        orderNumber,
        fulfillmentStatus: "NOT_STARTED",
        message: "Order not found in database",
      };
    }

    const payStatus = String(existing.paymentStatus).toUpperCase();
    if (payStatus !== "PAID") {
      return {
        success: false,
        orderNumber,
        fulfillmentStatus: existing.fulfillmentStatus,
        message: `Order payment status is ${existing.paymentStatus}, top-up cannot be fulfilled before payment verification.`,
      };
    }

    return {
      success: true,
      orderNumber,
      fulfillmentStatus: existing.fulfillmentStatus,
      message: `Order is already being processed or completed (Status: ${existing.fulfillmentStatus}). Duplicate fulfillment prevented.`,
      supplierOrderId: existing.supplierOrderId,
    };
  }

  try {
    const idempotencyKey = order.idempotencyKey || generateWebBuilderIdempotencyKey(order.orderNumber);
    const requestHash = computeOrderRequestHash({
      product_id: order.supplierProductCode,
      player_id: order.playerId,
      zone_id: order.serverId,
      reference: order.orderNumber,
    });

    // Submit order using exactly-once rules
    const wbOrder = await createWebBuilderOrder({
      localOrderId: order.orderNumber,
      productId: order.supplierProductCode,
      playerId: order.playerId,
      zoneId: order.serverId,
      reference: order.orderNumber,
    });

    // Persist tracking IDs immediately
    await Order.findByIdAndUpdate(order._id, {
      $set: {
        supplier: "webbuilder",
        supplierOrderId: wbOrder.id,
        idempotencyKey,
        requestHash,
        lastSupplierStatus: wbOrder.status,
        priceSnapshotCents: wbOrder.price_cents ?? order.priceSnapshotCents,
        updatedAt: new Date(),
      },
    });

    // Poll until final status if intermediate
    let finalOrder = wbOrder;
    if (wbOrder.status !== "succeeded" && wbOrder.status !== "failed" && wbOrder.status !== "manual_review") {
      finalOrder = await pollWebBuilderOrderUntilFinal(wbOrder.id);
    }

    if (finalOrder.status === "succeeded") {
      await Order.findByIdAndUpdate(order._id, {
        $set: {
          fulfillmentStatus: "completed",
          fulfilledAt: new Date(),
          lastSupplierStatus: "succeeded",
          adminNotes: "Delivered instantly via WebBuilder official Reseller API",
        },
      });
      return {
        success: true,
        orderNumber: order.orderNumber,
        fulfillmentStatus: "completed",
        supplierOrderId: finalOrder.id,
        message: `${order.gameName || "Game"} delivered successfully via WebBuilder`,
      };
    } else if (finalOrder.status === "failed") {
      await Order.findByIdAndUpdate(order._id, {
        $set: {
          fulfillmentStatus: "failed",
          lastSupplierStatus: "failed",
          errorLog: finalOrder.failure_reason || "WebBuilder order failed",
          adminNotes: "WebBuilder marked failed. Reserved funds released.",
        },
      });
      return {
        success: false,
        orderNumber: order.orderNumber,
        fulfillmentStatus: "failed",
        supplierOrderId: finalOrder.id,
        message: finalOrder.failure_reason || "WebBuilder fulfillment failed",
      };
    } else if (finalOrder.status === "manual_review") {
      // Uncertain: stop automatic retries, keep customer order pending, contact support
      await Order.findByIdAndUpdate(order._id, {
        $set: {
          fulfillmentStatus: "processing",
          lastSupplierStatus: "manual_review",
          adminNotes: "Flagged by WebBuilder for manual review. Automatic retries stopped. Awaiting administrator reconciliation.",
        },
      });
      return {
        success: true,
        orderNumber: order.orderNumber,
        fulfillmentStatus: "processing",
        supplierOrderId: finalOrder.id,
        message: "Order placed and flagged for manual review with WebBuilder.",
      };
    } else {
      // Intermediate status (queued, submitting, pending)
      await Order.findByIdAndUpdate(order._id, {
        $set: {
          fulfillmentStatus: "processing",
          lastSupplierStatus: finalOrder.status,
          adminNotes: `WebBuilder queued order (Status: ${finalOrder.status}). Polling or webhook fallback active.`,
        },
      });
      return {
        success: true,
        orderNumber: order.orderNumber,
        fulfillmentStatus: "processing",
        supplierOrderId: finalOrder.id,
        message: `Fulfillment queued with WebBuilder (${finalOrder.status})`,
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown fulfillment error";
    console.error(`Fulfillment error on ${order.orderNumber}:`, error);

    // Keep fulfillmentStatus as processing or failed, NEVER retry blindly!
    await Order.findByIdAndUpdate(order._id, {
      $set: {
        errorLog: `Fulfillment exception: ${errorMsg}`,
        adminNotes: "Execution failed or timed out. Awaiting manual check before retrying.",
      },
    });

    return {
      success: false,
      orderNumber: order.orderNumber,
      fulfillmentStatus: "processing",
      message: `Fulfillment encountered an error: ${errorMsg}`,
    };
  }
}

/**
 * Reconcile in-flight supplier order with WebBuilder without resubmitting a purchase.
 */
export async function reconcileSupplierFulfillment(
  orderNumber: string
): Promise<FulfillmentResult> {
  await connectDB();
  const order = await Order.findOne({ orderNumber });
  if (!order) {
    return {
      success: false,
      orderNumber,
      fulfillmentStatus: "NOT_STARTED",
      message: "Order not found",
    };
  }

  if (!order.supplierOrderId) {
    return {
      success: false,
      orderNumber,
      fulfillmentStatus: order.fulfillmentStatus,
      message: "No supplier order ID or reference recorded yet.",
    };
  }

  const wbOrder = await getWebBuilderOrder(order.supplierOrderId);
  if (wbOrder) {
    if (wbOrder.status === "succeeded") {
      order.fulfillmentStatus = "completed";
      order.fulfilledAt = new Date();
      order.lastSupplierStatus = "succeeded";
      await order.save();
      return {
        success: true,
        orderNumber,
        fulfillmentStatus: "completed",
        supplierOrderId: order.supplierOrderId,
        message: "WebBuilder order confirmed succeeded",
      };
    } else if (wbOrder.status === "failed") {
      order.fulfillmentStatus = "failed";
      order.lastSupplierStatus = "failed";
      order.errorLog = wbOrder.failure_reason || "WebBuilder order marked failed";
      await order.save();
      return {
        success: false,
        orderNumber,
        fulfillmentStatus: "failed",
        supplierOrderId: order.supplierOrderId,
        message: wbOrder.failure_reason || "WebBuilder order marked failed",
      };
    } else if (wbOrder.status === "manual_review") {
      order.lastSupplierStatus = "manual_review";
      order.adminNotes = "WebBuilder order under manual review.";
      await order.save();
      return {
        success: true,
        orderNumber,
        fulfillmentStatus: order.fulfillmentStatus,
        supplierOrderId: order.supplierOrderId,
        message: "Order is currently under manual review by WebBuilder support.",
      };
    }
  }

  return {
    success: true,
    orderNumber,
    fulfillmentStatus: order.fulfillmentStatus,
    message: `Current status is ${order.fulfillmentStatus}`,
  };
}
