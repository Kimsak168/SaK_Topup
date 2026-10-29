import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdminAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { AdminAuditLog } from "@/models/AdminAuditLog";
import { Order } from "@/models/Order";
import { Refund } from "@/models/Refund";
import { toMinorUnits } from "@/lib/financeMath.mjs";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: Promise<{ refundId: string }> }) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  const { refundId } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || !["processing", "completed", "failed"].includes(String(body.status))) {
    return NextResponse.json({ success: false, error: "Choose a supported refund status." }, { status: 400 });
  }
  const nextStatus = String(body.status);
  const externalReference = typeof body.externalReference === "string" ? body.externalReference.trim().slice(0, 160) : "";
  const failureNote = typeof body.failureNote === "string" ? body.failureNote.trim().slice(0, 240) : "";
  if (nextStatus === "completed" && (body.confirmation !== "CONFIRM REFUND PROCESSED" || externalReference.length < 3)) {
    return NextResponse.json({ success: false, error: "A refund reference and the exact completion confirmation are required." }, { status: 400 });
  }
  if (nextStatus === "failed" && !failureNote) return NextResponse.json({ success: false, error: "Add a short reason for the failed refund." }, { status: 400 });

  await connectDB();
  const session = await mongoose.startSession();
  let result: Record<string, unknown> | null = null;
  try {
    await session.withTransaction(async () => {
      const refund = await Refund.findOne({ refundId }).session(session);
      if (!refund) throw new Error("Refund record not found.");
      if (refund.status === nextStatus) { result = { refundId, status: refund.status, orderNumber: refund.orderNumber, amount: refund.amount.toString(), currency: refund.currency }; return; }
      const allowed: Record<string, string[]> = { requested: ["processing", "failed"], processing: ["completed", "failed"], failed: ["processing"], completed: [] };
      if (!allowed[refund.status]?.includes(nextStatus)) throw new Error(`Cannot move refund from ${refund.status} to ${nextStatus}.`);

      // Serialize transitions with new refund requests for the same order.
      const order = await Order.findOneAndUpdate({ orderNumber: refund.orderNumber }, { $inc: { refundVersion: 1 } }, { new: true, session });
      if (!order) throw new Error("Original order is unavailable.");
      const update: Record<string, unknown> = { status: nextStatus, updatedBy: auth.session.username };
      if (nextStatus === "completed") { update.externalReference = externalReference; update.completedAt = new Date(); }
      if (nextStatus === "failed") update.failureNote = failureNote;
      const changed = await Refund.findOneAndUpdate({ _id: refund._id, status: refund.status }, { $set: update }, { new: true, session });
      if (!changed) throw new Error("Refund status changed in another request. Reload and retry.");

      if (nextStatus === "completed") {
        const completed = await Refund.find({ orderNumber: refund.orderNumber, status: "completed" }).session(session).select("amount currency").lean();
        const completedMinor = completed.reduce((sum, row) => sum + (row.currency === refund.currency ? toMinorUnits(row.amount.toString(), refund.currency) || BigInt(0) : BigInt(0)), BigInt(0));
        const originalMinor = toMinorUnits(order.amount, refund.currency);
        if (originalMinor !== null && completedMinor >= originalMinor) {
          await Order.updateOne({ orderNumber: refund.orderNumber, paymentStatus: { $in: ["paid", "PAID"] } }, { $set: { paymentStatus: "refunded" } }, { session });
        }
      }

      await AdminAuditLog.create([{
        actorUsername: auth.session.username,
        actorName: auth.session.name,
        action: `refund.${nextStatus}`,
        recordType: "refund",
        recordId: refund.refundId,
        summary: `Refund ${refund.refundId} marked ${nextStatus} for order ${refund.orderNumber}.`,
      }], { session });
      result = { refundId: changed.refundId, orderNumber: changed.orderNumber, amount: changed.amount.toString(), currency: changed.currency, status: changed.status, updatedAt: changed.updatedAt, completedAt: changed.completedAt || null, externalReference: changed.externalReference || null };
    });
    return NextResponse.json({ success: true, refund: result });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "Refund status update failed.";
    const status = message.includes("not found") ? 404 : message.startsWith("Cannot move") || message.includes("another request") ? 409 : 503;
    return NextResponse.json({ success: false, error: message }, { status });
  } finally {
    await session.endSession();
  }
}
