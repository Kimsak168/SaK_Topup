import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { dispatchPendingTelegramNotifications } from "@/lib/services/telegramOutboxService";
import {
  maskTelegramChatId,
  testTelegramConnection,
  sendTelegramTestMessage,
} from "@/lib/services/telegramNotificationService";
import type { TelegramNotificationEvent } from "@/lib/notifications/telegramFormat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  const url = new URL(req.url);
  const orderNumber = url.searchParams.get("orderNumber")?.trim();

  await connectDB();

  const isConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_ADMIN_CHAT_ID?.trim()
  );
  const chatIdMasked = maskTelegramChatId(process.env.TELEGRAM_ADMIN_CHAT_ID);
  const topics = {
    pending: process.env.TELEGRAM_TOPIC_PENDING?.trim() || "",
    success: process.env.TELEGRAM_TOPIC_SUCCESS?.trim() || "",
    failed: process.env.TELEGRAM_TOPIC_FAILED?.trim() || "",
  };

  // If querying specific order
  if (orderNumber) {
    if (orderNumber.length > 256) {
      return NextResponse.json({ success: false, error: "Invalid order number" }, { status: 400 });
    }
    const order = await Order.findOne({ orderNumber }).select("orderNumber telegramNotifications").lean();
    return NextResponse.json({
      success: true,
      configured: isConfigured,
      chatIdMasked,
      topics,
      notifications: order?.telegramNotifications || [],
    });
  }

  // Dashboard overview query
  try {
    const recentOrders = await Order.find({ "telegramNotifications.0": { $exists: true } })
      .select("orderNumber telegramNotifications updatedAt")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    let sent = 0;
    let failed = 0;
    let retrying = 0;
    let queued = 0;

    const flattenedHistory: Array<{
      orderNumber: string;
      eventId: string;
      kind: string;
      status: string;
      state: string;
      attemptCount: number;
      createdAt: Date;
      sentAt?: Date;
      telegramMessageId?: string;
      lastError?: string;
    }> = [];

    for (const order of recentOrders) {
      const events = (order.telegramNotifications as TelegramNotificationEvent[]) || [];
      for (const ev of events) {
        if (ev.state === "sent") sent++;
        else if (ev.state === "failed") failed++;
        else if (ev.state === "retrying") retrying++;
        else if (ev.state === "queued") queued++;

        flattenedHistory.push({
          orderNumber: order.orderNumber,
          eventId: ev.eventId,
          kind: ev.kind,
          status: ev.status,
          state: ev.state,
          attemptCount: ev.attemptCount,
          createdAt: ev.createdAt,
          sentAt: ev.sentAt,
          telegramMessageId: ev.telegramMessageId,
          lastError: ev.lastError,
        });
      }
    }

    flattenedHistory.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const history = flattenedHistory.slice(0, 50);

    return NextResponse.json({
      success: true,
      configured: isConfigured,
      chatIdMasked,
      topics,
      stats: {
        sent,
        failed,
        retrying,
        queued,
        total: sent + failed + retrying + queued,
      },
      history,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Failed to load notification statistics";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "").trim().toLowerCase();

  if (action === "test_connection") {
    const result = await testTelegramConnection();
    return NextResponse.json({
      success: result.ok,
      ...result,
    }, { status: result.ok ? 200 : 400 });
  }

  if (action === "send_test") {
    const topicThreadId = typeof body.topicThreadId === "number" ? body.topicThreadId : undefined;
    const result = await sendTelegramTestMessage(topicThreadId);
    return NextResponse.json({
      success: result.ok,
      messageId: result.ok ? result.messageId : undefined,
      error: !result.ok ? result.error : undefined,
    }, { status: result.ok ? 200 : 400 });
  }

  // Default: dispatch pending outbox notifications
  await connectDB();
  const summary = await dispatchPendingTelegramNotifications();
  return NextResponse.json({ success: true, ...summary });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request payload" }, { status: 400 });
  }

  await connectDB();

  // Retry all failed notifications
  if (body.action === "retry_all_failed") {
    const result = await Order.updateMany(
      { "telegramNotifications.state": "failed" },
      {
        $set: {
          "telegramNotifications.$[elem].state": "retrying",
          "telegramNotifications.$[elem].nextAttemptAt": new Date(),
        },
      },
      {
        arrayFilters: [{ "elem.state": "failed" }],
      }
    );

    void dispatchPendingTelegramNotifications().catch(() => {});

    return NextResponse.json({
      success: true,
      requeuedCount: result.modifiedCount,
      message: `Requeued ${result.modifiedCount} order(s) with failed notifications.`,
    });
  }

  // Retry a single notification event
  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";

  if (!orderNumber || !eventId || orderNumber.length > 256 || eventId.length > 80) {
    return NextResponse.json(
      { success: false, error: "Order number and event ID are required" },
      { status: 400 }
    );
  }

  const changed = await Order.updateOne(
    {
      orderNumber,
      telegramNotifications: { $elemMatch: { eventId, state: "failed" } },
    },
    {
      $set: {
        "telegramNotifications.$.state": "retrying",
        "telegramNotifications.$.nextAttemptAt": new Date(),
      },
    }
  );

  if (changed.modifiedCount === 1) {
    void dispatchPendingTelegramNotifications().catch(() => {});
  }

  return NextResponse.json({
    success: true,
    requeued: changed.modifiedCount === 1,
  });
}
