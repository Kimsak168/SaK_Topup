import "server-only";
import { Order, type IOrder } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { checkVngZz2Transaction } from "@/lib/services/vngzzPayWayService";
import { checkAnajakPayTransactionV2 } from "@/lib/services/anajakPayService";
import { triggerAutomaticFulfillment } from "@/lib/services/fulfillmentService";

export function paymentGatewayForOrder(order: Pick<IOrder, "paymentGateway" | "paymentMethod">) {
  return order.paymentGateway || (order.paymentMethod === "aba_payway_v2" ? "aba_payway_v2" : "anajakpay");
}

export async function reconcileOrderPayment(orderNumber: string, fulfill = true) {
  let order = await Order.findOne({ orderNumber });
  if (!order) throw new Error("Order not found");
  const gateway = paymentGatewayForOrder(order);
  const previousStatus = String(order.paymentStatus).toUpperCase();
  if (!["PAID", "PENDING", "EXPIRED"].includes(previousStatus) || !order.transactionId) return order;
  if (previousStatus !== "PAID") {
    const transactionId = order.transactionId;
    let status: string;
    let amount: number | undefined;
    let currency: string | undefined;
    let reference: string | undefined;
    let reason: string | undefined;
    let raw: unknown;
    if (gateway === "aba_payway_v2" || gateway === "vngzz2") {
      const result = await checkVngZz2Transaction(transactionId);
      if (!result.success) return order;
      status = result.state;
      amount = result.amount;
      currency = result.currency;
      reference = result.transactionId;
      reason = result.message;
      raw = result;
    } else if (gateway === "anajakpay") {
      const result = await checkAnajakPayTransactionV2(transactionId);
      if (!result.success) return order;
      status = result.status;
      amount = result.amount;
      reference = result.transactionId;
      currency = "USD"; // The existing AnajakPay checkout rail settles in USD.
      reason = result.responseMessage;
      raw = result.raw;
    } else {
      throw new Error("This gateway has no configured payment verification.");
    }
    if (reference !== transactionId) throw new Error("Verified transaction does not match this order.");
    if (!["PAID", "FAILED", "EXPIRED"].includes(status)) return order;
    const nextStatus = status as "PAID" | "FAILED" | "EXPIRED";
    if (status === "PAID" && (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 ||
      Math.round(amount * 100) !== Math.round(order.amount * 100) ||
      currency !== String(order.currency || "USD").toUpperCase())) {
      throw new Error("Verified payment amount or currency does not match the order.");
    }
    // The documented grace sweep can settle expired QR payments late.
    const allowed: IOrder["paymentStatus"][] = status === "PAID" ? ["PENDING", "pending", "EXPIRED", "expired"] : ["PENDING", "pending"];
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, transactionId, paymentStatus: { $in: allowed } },
      { $set: {
        paymentStatus: nextStatus,
        ...(status === "PAID" ? { paidAt: new Date(), paymentErrorReason: "" } : {
          paymentErrorReason: reason || (status === "EXPIRED" ? "Provider confirmed payment expiry." : "Provider confirmed payment failure."),
        }),
        paymentVerification: { gateway, transactionId, status, checkedAt: new Date() },
      } }, { new: true, runValidators: true },
    );
    order = updated || await Order.findOne({ orderNumber });
    if (!order) throw new Error("Order no longer exists");
    // Order is authoritative; repair the payment projection on callback replay.
    await Payment.findOneAndUpdate(
      { orderNumber, transactionId },
      {
        $setOnInsert: { paymentId: `PAY-${orderNumber}`, orderNumber, transactionId, gateway, amount: order.amount, currency: order.currency },
        $set: { status: order.paymentStatus, ...(order.paidAt ? { paidAt: order.paidAt } : {}), rawResponse: raw },
      }, { upsert: true },
    );
  } else {
    await Payment.updateOne({ orderNumber, transactionId: order.transactionId }, { $set: { status: "PAID", paidAt: order.paidAt } });
  }
  if (fulfill && String(order.paymentStatus).toUpperCase() === "PAID") {
    await triggerAutomaticFulfillment(orderNumber);
    order = await Order.findOne({ orderNumber }) || order;
  }
  return order;
}
