import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { requireAdminAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { AdminAuditLog } from "@/models/AdminAuditLog";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { Refund } from "@/models/Refund";
import { formatMinorUnits, toMinorUnits } from "@/lib/financeMath.mjs";

export const dynamic = "force-dynamic";

function safeRefund(row: any) {
  return {
    refundId: row.refundId,
    idempotencyKey: row.idempotencyKey,
    orderNumber: row.orderNumber,
    paymentId: row.paymentId || null,
    gateway: row.gateway,
    amount: row.amount.toString(),
    currency: row.currency,
    status: row.status,
    reason: row.reason,
    externalReference: row.externalReference || null,
    failureNote: row.failureNote || null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt || null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  try {
    await connectDB();
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("limit")) || 25));
    const status = req.nextUrl.searchParams.get("status") || "all";
    if (status !== "all" && !["requested", "processing", "completed", "failed"].includes(status)) return NextResponse.json({ success: false, error: "Unsupported refund status." }, { status: 400 });
    const filter = (status === "all" ? {} : { status }) as any;
    const [rows, total] = await Promise.all([
      Refund.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Refund.countDocuments(filter),
    ]);
    return NextResponse.json({ success: true, rows: rows.map(safeRefund), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    return NextResponse.json({ success: false, error: "Refund records are unavailable." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, error: "A valid JSON request is required." }, { status: 400 });
  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
  const amountText = typeof body.amount === "string" ? body.amount.trim() : "";
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 240) : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!orderNumber || orderNumber.length > 100 || !/^[A-Z]{3}$/.test(currency) || !/^\d+(?:\.\d{1,4})?$/.test(amountText) || !reason || !idempotencyKey || idempotencyKey.length > 120) {
    return NextResponse.json({ success: false, error: "Order, amount, currency, reason, and idempotencyKey are required." }, { status: 400 });
  }

  await connectDB();
  const session = await mongoose.startSession();
  let output: Record<string, unknown> | null = null;
  let created = false;
  try {
    await session.withTransaction(async () => {
      const existing = await Refund.findOne({ idempotencyKey }).session(session);
      if (existing) {
        if (existing.orderNumber !== orderNumber || existing.currency !== currency || toMinorUnits(existing.amount.toString(), currency) !== toMinorUnits(amountText, currency)) throw new Error("Idempotency key was already used for different refund details.");
        output = safeRefund(existing);
        return;
      }

      // The order write serializes concurrent refund requests for the same order.
      const order = await Order.findOneAndUpdate(
        { orderNumber, paymentStatus: { $in: ["paid", "PAID"] } },
        { $inc: { refundVersion: 1 } },
        { new: true, session }
      );
      if (!order) throw new Error("A paid order with this number was not found.");
      if (currency !== String(order.currency || "USD").toUpperCase()) throw new Error("Refund currency must match the original order.");
      const requestedMinor = toMinorUnits(amountText, currency);
      const orderMinor = toMinorUnits(order.amount, currency);
      if (requestedMinor === null || requestedMinor <= BigInt(0) || orderMinor === null) throw new Error("Refund amount is invalid.");

      const existingRefunds = await Refund.find({ orderNumber, status: { $in: ["requested", "processing", "completed"] } }).session(session).select("amount").lean();
      const reservedMinor = existingRefunds.reduce((sum, row) => sum + (toMinorUnits(row.amount.toString(), currency) || BigInt(0)), BigInt(0));
      if (reservedMinor + requestedMinor > orderMinor) throw new Error("This refund would exceed the original order amount.");

      const payment = await Payment.findOne({ orderNumber }).select("paymentId").session(session).lean();
      const refundId = `RFD-${randomUUID()}`;
      const [refund] = await Refund.create([{
        refundId,
        idempotencyKey,
        orderNumber,
        paymentId: payment?.paymentId,
        gateway: String(order.paymentGateway || order.paymentMethod || "unknown"),
        amount: mongoose.Types.Decimal128.fromString(amountText),
        currency,
        status: "requested",
        reason,
        createdBy: auth.session.username,
      }], { session });
      await AdminAuditLog.create([{
        actorUsername: auth.session.username,
        actorName: auth.session.name,
        action: "refund.requested",
        recordType: "refund",
        recordId: refundId,
        summary: `Requested refund ${formatMinorUnits(requestedMinor, currency)} ${currency} for order ${orderNumber}.`,
      }], { session });
      output = safeRefund(refund);
      created = true;
    });
    return NextResponse.json({ success: true, refund: output }, { status: created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "Refund request failed.";
    const status = message.includes("paid order") || message.includes("exceed") || message.includes("currency") || message.includes("Idempotency key") ? 409 : 503;
    return NextResponse.json({ success: false, error: message }, { status });
  } finally {
    await session.endSession();
  }
}
