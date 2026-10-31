import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { dispatchPendingTelegramNotifications } from "@/lib/services/telegramOutboxService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  const orderNumber = new URL(req.url).searchParams.get("orderNumber")?.trim();
  if (!orderNumber || orderNumber.length > 256) return NextResponse.json({ success: false, error: "Order number is required" }, { status: 400 });
  await connectDB();
  const order = await Order.findOne({ orderNumber }).select("orderNumber telegramNotifications").lean();
  return NextResponse.json({ success: true, configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID), notifications: order?.telegramNotifications || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  await connectDB();
  return NextResponse.json({ success: true, ...await dispatchPendingTelegramNotifications() });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.orderNumber !== "string" || typeof body.eventId !== "string" || body.orderNumber.length > 256 || body.eventId.length > 80) return NextResponse.json({ success: false, error: "Order number and event ID are required" }, { status: 400 });
  await connectDB();
  const changed = await Order.updateOne({ orderNumber: body.orderNumber, telegramNotifications: { $elemMatch: { eventId: body.eventId, state: "failed" } } }, {
    $set: { "telegramNotifications.$.state": "retrying", "telegramNotifications.$.nextAttemptAt": new Date() },
  });
  return NextResponse.json({ success: true, requeued: changed.modifiedCount === 1 });
}
