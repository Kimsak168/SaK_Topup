import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Order, IOrder } from "@/models/Order";
import {
  placeVizoOrder,
  checkVizoOrderStatus,
} from "@/lib/suppliers/vizo";
import {
  placeG2BulkOrder,
  checkG2BulkOrderStatus,
} from "@/lib/suppliers/g2bulk";
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
 * Automatically fulfill an order with the correct supplier (Vizo for Free Fire, G2Bulk for others).
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

  // Generate unique merchant supplier reference
  const clientSupplierRef = `SUP-${order.orderNumber}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;

  const isWebBuilder =
    order.supplier === "webbuilder" ||
    order.gameSlug.includes("honor") ||
    order.gameSlug === "hok";

  const isFreeFire =
    !isWebBuilder &&
    (order.gameSlug.includes("freefire") ||
      order.gameName.toLowerCase().includes("free fire") ||
      order.supplier === "vizo");

  try {
    if (isWebBuilder) {
      // Honor of Kings uses WebBuilder Reseller API
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
            adminNotes: "Flagged by WebBuilder for manual review. Automatic retries stopped. Awaiting administrator or support reconciliation.",
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
    } else if (isFreeFire) {
      // Free Fire uses Vizo
      const vizoRes = await placeVizoOrder({
        productCode: order.supplierProductCode,
        userId: order.playerId,
        serverId: order.serverId,
        refOrder: clientSupplierRef,
      });

      if (vizoRes.status === "completed") {
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            fulfillmentStatus: "completed",
            fulfilledAt: new Date(),
            supplierOrderId: vizoRes.supplierOrderId || clientSupplierRef,
            adminNotes: "Delivered instantly via Vizo official API",
          },
        });
        return {
          success: true,
          orderNumber: order.orderNumber,
          fulfillmentStatus: "completed",
          supplierOrderId: vizoRes.supplierOrderId || clientSupplierRef,
          message: "Free Fire diamonds delivered successfully",
        };
      } else if (vizoRes.status === "processing") {
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            fulfillmentStatus: "processing",
            supplierOrderId: vizoRes.supplierOrderId || clientSupplierRef,
            adminNotes: "Supplier order processing in background. Do not re-submit.",
          },
        });
        return {
          success: true,
          orderNumber: order.orderNumber,
          fulfillmentStatus: "processing",
          supplierOrderId: vizoRes.supplierOrderId || clientSupplierRef,
          message: vizoRes.message || "Fulfillment request in progress with Vizo",
        };
      } else {
        // Supplier rejected order
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            fulfillmentStatus: "failed",
            supplierOrderId: vizoRes.supplierOrderId || clientSupplierRef,
            errorLog: vizoRes.message || "Vizo order rejected",
            adminNotes: "Flagged for reconciliation or manual refund review.",
          },
        });
        return {
          success: false,
          orderNumber: order.orderNumber,
          fulfillmentStatus: "failed",
          message: vizoRes.message || "Vizo fulfillment failed",
        };
      }
    } else {
      // Other supported games use G2Bulk
      const g2Res = await placeG2BulkOrder({
        catalogueId: order.supplierProductCode,
        userId: order.playerId,
        serverId: order.serverId,
        refOrder: clientSupplierRef,
      });

      if (g2Res.status === "completed") {
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            fulfillmentStatus: "completed",
            fulfilledAt: new Date(),
            supplierOrderId: g2Res.supplierOrderId || clientSupplierRef,
            adminNotes: "Delivered via G2Bulk official API",
          },
        });
        return {
          success: true,
          orderNumber: order.orderNumber,
          fulfillmentStatus: "completed",
          supplierOrderId: g2Res.supplierOrderId || clientSupplierRef,
          message: "Top-up delivered successfully via G2Bulk",
        };
      } else if (g2Res.status === "processing") {
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            fulfillmentStatus: "processing",
            supplierOrderId: g2Res.supplierOrderId || clientSupplierRef,
            adminNotes: "G2Bulk queued order. Polling status.",
          },
        });
        return {
          success: true,
          orderNumber: order.orderNumber,
          fulfillmentStatus: "processing",
          supplierOrderId: g2Res.supplierOrderId || clientSupplierRef,
          message: "Fulfillment queued with G2Bulk",
        };
      } else {
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            fulfillmentStatus: "failed",
            supplierOrderId: g2Res.supplierOrderId || clientSupplierRef,
            errorLog: g2Res.message || "G2Bulk order rejected",
            adminNotes: "Flagged for reconciliation or manual refund review.",
          },
        });
        return {
          success: false,
          orderNumber: order.orderNumber,
          fulfillmentStatus: "failed",
          message: g2Res.message || "G2Bulk fulfillment failed",
        };
      }
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
 * Reconcile in-flight supplier order without resubmitting a purchase.
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

  const isWebBuilder =
    order.supplier === "webbuilder" ||
    order.gameSlug.includes("honor") ||
    order.gameSlug === "hok";

  const isFreeFire =
    !isWebBuilder &&
    (order.gameSlug.includes("freefire") ||
      order.gameName.toLowerCase().includes("free fire") ||
      order.supplier === "vizo");

  if (isWebBuilder) {
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
  } else if (isFreeFire) {
    const status = await checkVizoOrderStatus(order.supplierOrderId);
    if (status) {
      if (status.status === "completed") {
        order.fulfillmentStatus = "completed";
        order.fulfilledAt = new Date();
        await order.save();
        return {
          success: true,
          orderNumber,
          fulfillmentStatus: "completed",
          supplierOrderId: order.supplierOrderId,
          message: "Vizo order confirmed completed",
        };
      } else if (status.status === "failed") {
        order.fulfillmentStatus = "failed";
        order.errorLog = status.message || "Vizo order marked failed";
        await order.save();
        return {
          success: false,
          orderNumber,
          fulfillmentStatus: "failed",
          message: status.message || "Vizo order marked failed",
        };
      }
    }
  } else {
    const status = await checkG2BulkOrderStatus(order.supplierOrderId);
    if (status) {
      if (status.status === "completed") {
        order.fulfillmentStatus = "completed";
        order.fulfilledAt = new Date();
        await order.save();
        return {
          success: true,
          orderNumber,
          fulfillmentStatus: "completed",
          supplierOrderId: order.supplierOrderId,
          message: "G2Bulk order confirmed completed",
        };
      } else if (status.status === "failed") {
        order.fulfillmentStatus = "failed";
        order.errorLog = status.message || "G2Bulk order marked failed";
        await order.save();
        return {
          success: false,
          orderNumber,
          fulfillmentStatus: "failed",
          message: status.message || "G2Bulk order marked failed",
        };
      }
    }
  }

  return {
    success: true,
    orderNumber,
    fulfillmentStatus: order.fulfillmentStatus,
    message: `Current status is ${order.fulfillmentStatus}`,
  };
}
