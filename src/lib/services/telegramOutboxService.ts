import "server-only";
import { randomUUID } from "node:crypto";
import { Order } from "@/models/Order";
import { acquireJobLease, releaseJobLease } from "@/lib/services/backgroundJobLease";
import { sendTelegramNotification } from "@/lib/services/telegramNotificationService";
import type { TelegramNotificationEvent } from "@/lib/notifications/telegramFormat";
import { logCronEvent } from "@/lib/cronLogger";

const STALE_MS = 120_000;
const MAX_ATTEMPTS = 10;

function due(now: Date) {
  return { $or: [
    { state: { $in: ["queued", "retrying"] }, nextAttemptAt: { $lte: now } },
    { state: "sending", lockedAt: { $lte: new Date(now.getTime() - STALE_MS) } },
  ] };
}

// Compare-and-set the embedded event; token fencing prevents a stale worker
// from overwriting bookkeeping committed by a newer lease owner.
export async function dispatchTelegramNotificationEvent(orderNumber: string, eventId: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !process.env.TELEGRAM_ADMIN_CHAT_ID?.trim()) return "skipped";
  const now = new Date();
  const token = randomUUID();
  const claimed = await Order.findOneAndUpdate(
    { orderNumber, telegramNotifications: { $elemMatch: { eventId, ...due(now) } } },
    {
      $set: { "telegramNotifications.$.state": "sending", "telegramNotifications.$.lockedAt": now, "telegramNotifications.$.lockToken": token },
      $inc: { "telegramNotifications.$.attemptCount": 1 },
      $push: { "telegramNotifications.$.attempts": { at: now, outcome: "sending" } },
    }, { new: true },
  ).select("orderNumber telegramNotifications").lean();
  if (!claimed) return "skipped";
  const event = (claimed.telegramNotifications as TelegramNotificationEvent[]).find(e => e.eventId === eventId)!;
  const result = await sendTelegramNotification(event);
  const finishedAt = new Date();
  const state = result.ok ? "sent" : result.retryable && event.attemptCount < MAX_ATTEMPTS ? "retrying" : "failed";
  const fields: Record<string, unknown> = {
    "telegramNotifications.$.state": state,
    [`telegramNotifications.$.attempts.${event.attempts.length - 1}.outcome`]: state,
  };
  if (result.ok) {
    fields["telegramNotifications.$.sentAt"] = finishedAt;
    fields["telegramNotifications.$.telegramMessageId"] = result.messageId;
  } else {
    fields["telegramNotifications.$.lastError"] = result.error;
    fields[`telegramNotifications.$.attempts.${event.attempts.length - 1}.error`] = result.error;
    fields["telegramNotifications.$.nextAttemptAt"] = new Date(finishedAt.getTime() + 1000 *
      (result.retryAfterSeconds ?? Math.min(3600, 30 * 2 ** Math.max(0, event.attemptCount - 1))));
  }
  await Order.updateOne(
    { orderNumber, telegramNotifications: { $elemMatch: { eventId, state: "sending", lockToken: token } } },
    { $set: fields, $unset: { "telegramNotifications.$.lockedAt": "", "telegramNotifications.$.lockToken": "", ...(result.ok ? { "telegramNotifications.$.lastError": "" } : {}) } },
  );
  return state;
}

export async function dispatchPendingTelegramNotifications(limit = 20) {
  const summary = { scannedOrders: 0, attempted: 0, sent: 0 };
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !process.env.TELEGRAM_ADMIN_CHAT_ID?.trim()) return { ...summary, configured: false };
  const token = await acquireJobLease("telegram-outbox", 60_000);
  if (!token) {
    logCronEvent({ tag: "CRON_TELEGRAM", event: "busy", details: { message: "Another telegram outbox worker is active." } });
    return { ...summary, busy: true };
  }
  const started = Date.now();
  logCronEvent({ tag: "CRON_TELEGRAM", event: "start", details: { limit } });
  try {
    const orders = await Order.find({ telegramNotifications: { $elemMatch: due(new Date()) } })
      .select("orderNumber telegramNotifications").sort({ updatedAt: 1 }).limit(50).lean();
    summary.scannedOrders = orders.length;
    for (const order of orders) {
      // Preserve transition order within an order. A retried predecessor blocks
      // its successors until delivered, or explicitly dead-lettered.
      const events = (order.telegramNotifications as TelegramNotificationEvent[]).filter(e => e.state !== "sent" && e.state !== "failed");
      for (const event of events) {
        if (summary.attempted >= Math.min(30, Math.max(1, limit)) || Date.now() - started > 40_000) return summary;
        if (event.state === "sending" && new Date(event.lockedAt!).getTime() > Date.now() - STALE_MS) break;
        if (event.state !== "sending" && new Date(event.nextAttemptAt).getTime() > Date.now()) break;
        const state = await dispatchTelegramNotificationEvent(order.orderNumber, event.eventId);
        if (state === "skipped") break;
        summary.attempted++;
        if (state === "sent") summary.sent++;
        if (state === "retrying") break;
        // All notifications share one admin destination: avoid a burst of sends.
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
    }
    return summary;
  } finally {
    await releaseJobLease("telegram-outbox", token);
  }
}
