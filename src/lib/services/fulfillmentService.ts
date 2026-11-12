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
import { placeG2BulkOrder, checkG2BulkOrderStatus } from "@/lib/suppliers/g2bulk";
import { createVngzzOrder, checkVngzzOrder, createVngzzSmmOrder, checkVngzzSmmOrder } from "@/lib/suppliers/vngzz2";

export interface FulfillmentResult {
  success: boolean;
  orderNumber: string;
  fulfillmentStatus: string;
  message: string;
  supplierOrderId?: string;
}

/**
 * Automatically fulfill an order with the appropriate supplier (WebBuilder, G2Bulk, or VngZz2).
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
    if (order.serviceType === "smm") {
      await Order.findByIdAndUpdate(order._id, { $set: { supplierOrderId: order.orderNumber } });

      if (order.packageId === "smm-khmer") {
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            fulfillmentStatus: "failed",
            lastSupplierStatus: "DISCONTINUED",
            errorLog: "TikTok Khmer catalog has been removed.",
            updatedAt: new Date(),
          },
        });
        return {
          success: false,
          orderNumber: order.orderNumber,
          fulfillmentStatus: "failed",
          message: "TikTok Khmer catalog has been removed.",
        };
      }

      const smmRes = await createVngzzSmmOrder({
        serviceId: order.supplierProductCode,
        link: order.targetLink || order.playerId,
        quantity: order.quantity || 100,
        reference: order.orderNumber,
      });

      const isCompleted = smmRes.status === "completed";
      const isFailed = smmRes.status === "failed";
      const newStatus = isCompleted ? "completed" : isFailed ? "failed" : "processing";

      await Order.findByIdAndUpdate(order._id, {
        $set: {
          supplierOrderId: smmRes.orderId || order.orderNumber,
          fulfillmentStatus: newStatus,
          lastSupplierStatus: smmRes.supplierStatus,
          fulfilledAt: isCompleted ? new Date() : undefined,
          errorLog: isFailed ? smmRes.message : undefined,
          updatedAt: new Date(),
        },
      });

      return {
        success: !isFailed,
        orderNumber: order.orderNumber,
        fulfillmentStatus: newStatus,
        supplierOrderId: smmRes.orderId || order.orderNumber,
        message: smmRes.message,
      };
    }

    if (order.serviceType === "digital" || order.supplier === "pe_supply") {
      await Order.findByIdAndUpdate(order._id, {
        $set: {
          fulfillmentStatus: "failed",
          lastSupplierStatus: "DISCONTINUED",
          errorLog: "Digital product catalog has been removed.",
          updatedAt: new Date(),
        },
      });
      return {
        success: false,
        orderNumber: order.orderNumber,
        fulfillmentStatus: "failed",
        message: "Digital product catalog has been removed.",
      };
    }

    if (order.supplier === "vngzz2") {
      // Persist the stable reference before submitting. A timeout is reconciled
      // through check_order; it must never trigger a second purchase.
      await Order.findByIdAndUpdate(order._id, { $set: { supplierOrderId: order.orderNumber } });
      const result = await createVngzzOrder({ productCode: order.supplierProductCode, playerId: order.playerId, serverId: order.serverId, reference: order.orderNumber });
      await Order.findByIdAndUpdate(order._id, { $set: {
        supplierOrderId: result.id, fulfillmentStatus: "processing", lastSupplierStatus: result.supplierStatus,
        supplierNextPollAt: new Date(Date.now() + 60_000),
      } });
      return { success: true, orderNumber, fulfillmentStatus: "processing", supplierOrderId: result.id, message: "Supplier submission recorded; delivery awaits a status check." };
    }

    // G2Bulk Fulfillment (Roblox product purchase & SMM protocol)
    if (order.supplier === "g2bulk") {
      const g2Res = await placeG2BulkOrder({
        catalogueId: order.supplierProductCode,
        userId: order.playerId,
        serverId: order.serverId,
        refOrder: order.orderNumber,
        gameSlug: order.gameSlug,
      });

      const isCompleted = g2Res.status === "completed";
      const isFailed = g2Res.status === "failed";
      const newStatus = isCompleted ? "completed" : isFailed ? "failed" : "processing";

      const deliveryNote = g2Res.deliveryItems && g2Res.deliveryItems.length > 0
        ? ` | Codes: ${g2Res.deliveryItems.join(", ")}`
        : "";

      await Order.findByIdAndUpdate(order._id, {
        $set: {
          supplierOrderId: g2Res.supplierOrderId,
          fulfillmentStatus: newStatus,
          lastSupplierStatus: g2Res.status,
          fulfilledAt: isCompleted ? new Date() : undefined,
          errorLog: isFailed ? g2Res.message : undefined,
          adminNotes: `G2Bulk order ${g2Res.status}: ${g2Res.message || ""}${deliveryNote}`,
          updatedAt: new Date(),
        },
      });

      return {
        success: isCompleted || g2Res.status === "processing",
        orderNumber: order.orderNumber,
        fulfillmentStatus: newStatus,
        supplierOrderId: g2Res.supplierOrderId,
        message: (g2Res.message || `G2Bulk order status: ${g2Res.status}`) + deliveryNote,
      };
    }

    if (order.supplier !== "webbuilder") throw new Error("Unsupported fulfillment supplier.");
    // 3. WebBuilder Fulfillment (Primary / Official Reseller API)
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

  if (String(order.paymentStatus).toUpperCase() !== "PAID" || ["completed", "delivered", "failed"].includes(String(order.fulfillmentStatus).toLowerCase())) {
    return { success: String(order.fulfillmentStatus).toLowerCase() !== "failed", orderNumber, fulfillmentStatus: order.fulfillmentStatus, supplierOrderId: order.supplierOrderId, message: "No in-flight paid delivery to reconcile." };
  }

  if (order.serviceType === "digital" || order.supplier === "pe_supply") {
    return {
      success: false,
      orderNumber,
      fulfillmentStatus: order.fulfillmentStatus,
      supplierOrderId: order.supplierOrderId,
      message: "Digital product catalog has been removed.",
    };
  }

  if (order.serviceType === "smm" && order.packageId === "smm-khmer") {
    return {
      success: false,
      orderNumber,
      fulfillmentStatus: order.fulfillmentStatus,
      supplierOrderId: order.supplierOrderId,
      message: "TikTok Khmer catalog has been removed.",
    };
  }

  if (order.serviceType === "smm") {
    const smmResult = await checkVngzzSmmOrder(order.supplierOrderId || order.orderNumber, order.orderNumber);
    const currentStatus = String(order.fulfillmentStatus).toLowerCase();
    if (!["completed", "delivered"].includes(currentStatus) && smmResult.status !== "unknown") {
      order.fulfillmentStatus = smmResult.status;
      order.lastSupplierStatus = smmResult.supplierStatus;
      if (smmResult.orderId) order.supplierOrderId = smmResult.orderId;
      if (smmResult.status === "completed") order.fulfilledAt = new Date();
      if (smmResult.status === "failed") order.errorLog = smmResult.message;
      await order.save();
    }
    return {
      success: String(order.fulfillmentStatus).toLowerCase() !== "failed",
      orderNumber,
      fulfillmentStatus: order.fulfillmentStatus,
      supplierOrderId: order.supplierOrderId,
      message: smmResult.message,
    };
  }

  if (order.supplier === "vngzz2") {
    if (String(order.paymentStatus).toUpperCase() !== "PAID") return { success: false, orderNumber, fulfillmentStatus: order.fulfillmentStatus, message: "Payment is not verified." };
    const result = await checkVngzzOrder(order.orderNumber);
    // Never downgrade a completed delivery after a stale provider response.
    if (!["completed", "COMPLETED", "delivered", "DELIVERED"].includes(order.fulfillmentStatus)) {
      order.fulfillmentStatus = result.status;
      order.lastSupplierStatus = result.supplierStatus;
      order.supplierOrderId = result.id;
      if (result.status === "completed") order.fulfilledAt = new Date();
      if (result.status === "failed") order.errorLog = result.message;
      await order.save();
    }
    return { success: order.fulfillmentStatus !== "failed", orderNumber, fulfillmentStatus: order.fulfillmentStatus, supplierOrderId: order.supplierOrderId, message: result.message };
  }

  if (!order.supplierOrderId) {
    return {
      success: false,
      orderNumber,
      fulfillmentStatus: order.fulfillmentStatus,
      message: "No supplier order ID or reference recorded yet.",
    };
  }

  // G2Bulk Reconciliation
  if (order.supplier === "g2bulk") {
    const g2Status = await checkG2BulkOrderStatus(order.supplierOrderId);
    if (g2Status) {
      if (g2Status.status === "completed") {
        order.fulfillmentStatus = "completed";
        order.fulfilledAt = new Date();
        order.lastSupplierStatus = "completed";
        await order.save();
        return {
          success: true,
          orderNumber,
          fulfillmentStatus: "completed",
          supplierOrderId: order.supplierOrderId,
          message: "G2Bulk order confirmed completed",
        };
      } else if (g2Status.status === "failed") {
        order.fulfillmentStatus = "failed";
        order.lastSupplierStatus = "failed";
        order.errorLog = g2Status.message || "G2Bulk order failed";
        await order.save();
        return {
          success: false,
          orderNumber,
          fulfillmentStatus: "failed",
          supplierOrderId: order.supplierOrderId,
          message: g2Status.message || "G2Bulk order failed",
        };
      }
    }
    return {
      success: true,
      orderNumber,
      fulfillmentStatus: order.fulfillmentStatus,
      message: `G2Bulk order status: ${order.fulfillmentStatus}`,
    };
  }

  // WebBuilder Reconciliation
  if (order.supplier !== "webbuilder") return { success: true, orderNumber, fulfillmentStatus: order.fulfillmentStatus, message: "This supplier requires an admin delivery check." };
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
