import { randomUUID } from "node:crypto";

export type TelegramNotificationKind = "PAYMENT" | "ORDER";
export type TelegramNotificationStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";
export type TelegramDeliveryState = "queued" | "sending" | "retrying" | "sent" | "failed";

export interface TelegramNotificationPayload {
  orderNumber: string;
  customerName?: string;
  customerContact?: string;
  gameName: string;
  packageName: string;
  playerId: string;
  serverId?: string;
  amount: number;
  currency?: string;
  paymentMethod?: string;
  paymentGateway?: string;
  supplier?: string;
  transactionId?: string;
  errorReason?: string;
  occurredAt: Date | string;
}

export interface TelegramNotificationAttempt {
  at: Date;
  outcome: "sending" | "sent" | "retrying" | "failed";
  error?: string;
}

export interface TelegramNotificationEvent {
  eventId: string;
  dedupeKey?: string;
  kind: TelegramNotificationKind;
  status: TelegramNotificationStatus;
  payload: TelegramNotificationPayload;
  state: TelegramDeliveryState;
  attemptCount: number;
  attempts: TelegramNotificationAttempt[];
  createdAt: Date;
  nextAttemptAt: Date;
  lockedAt?: Date;
  lockToken?: string;
  sentAt?: Date;
  telegramMessageId?: string;
  lastError?: string;
}

export function classifyPaymentStatus(value: unknown): TelegramNotificationStatus | null {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "PENDING") return "PENDING";
  if (status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL") return "SUCCESS";
  if (status === "FAILED") return "FAILED";
  if (status === "EXPIRED") return "EXPIRED";
  return null;
}

export function classifyOrderStatus(value: unknown): TelegramNotificationStatus | null {
  const status = String(value ?? "").trim().toUpperCase();
  if (["NOT_STARTED", "PENDING", "PROCESSING"].includes(status)) return "PENDING";
  if (["COMPLETED", "DELIVERED", "SUCCESS", "SUCCEEDED"].includes(status)) return "SUCCESS";
  if (status === "FAILED") return "FAILED";
  return null;
}

function text(value: unknown, fallback = "Not provided", maxLength = 400): string {
  const normalized = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  return (normalized || fallback).slice(0, maxLength);
}

export function escapeTelegramHtml(value: unknown, fallback = "Not provided", maxLength = 400): string {
  return text(value, fallback, maxLength)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatOccurredAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Phnom_Penh",
  }).format(date);
}

const PAYMENT_LABELS: Record<string, string> = {
  aba_payway_v2: "ABA PayWay V2",
  anajakpay: "AnajakPay KHQR",
  khqr: "KHQR",
  aba: "ABA",
  wing: "Wing",
  binance: "Binance",
  manual: "Manual",
};

const SUPPLIER_LABELS: Record<string, string> = {
  vngzz2: "VNGZZ2",
  webbuilder: "WebBuilder",
  vizo: "Vizo",
  g2bulk: "G2Bulk",
};

function statusEmoji(status: TelegramNotificationStatus): string {
  if (status === "PENDING") return "⏳";
  if (status === "SUCCESS") return "✅";
  if (status === "FAILED") return "❌";
  return "⌛";
}

export function createTelegramNotificationEvent(params: {
  order: Record<string, unknown>;
  kind: TelegramNotificationKind;
  status: TelegramNotificationStatus;
  errorReason?: string;
  dedupeKey?: string;
  occurredAt?: Date;
}): TelegramNotificationEvent {
  const occurredAt = params.occurredAt || new Date();
  const order = params.order;
  const errorReason = params.errorReason || order.errorLog || order.adminNotes;
  return {
    eventId: randomUUID(),
    ...(params.dedupeKey ? { dedupeKey: params.dedupeKey } : {}),
    kind: params.kind,
    status: params.status,
    payload: {
      orderNumber: text(order.orderNumber, "Unknown order", 160),
      customerName: text(order.customerName || order.playerName, "Not collected", 120),
      customerContact: text(order.customerContact, "", 180),
      gameName: text(order.gameName, "Unknown game", 180),
      packageName: text(order.packageName, "Unknown package", 180),
      playerId: text(order.playerId, "Not provided", 240),
      serverId: text(order.serverId, "", 120),
      amount: typeof order.amount === "number" && Number.isFinite(order.amount) ? order.amount : 0,
      currency: text(order.currency, "USD", 8),
      paymentMethod: text(order.paymentMethod, "Unknown", 80),
      paymentGateway: text(order.paymentGateway, "", 80),
      supplier: text(order.supplier, "", 80),
      transactionId: text(order.transactionId, "", 180),
      ...(params.status === "FAILED" || params.status === "EXPIRED"
        ? { errorReason: text(errorReason, params.status === "EXPIRED" ? "Payment expired." : "Failure confirmed by provider or administrator.", 500) }
        : {}),
      occurredAt,
    },
    state: "queued",
    attemptCount: 0,
    attempts: [],
    createdAt: occurredAt,
    nextAttemptAt: occurredAt,
  };
}

export function formatTelegramNotificationMessage(event: Pick<TelegramNotificationEvent, "kind" | "status" | "payload">): string {
  const { kind, status, payload } = event;
  const title = `${kind} ${status}`;
  const paymentKey = (payload.paymentGateway || payload.paymentMethod || "").toLowerCase();
  const paymentLabel = PAYMENT_LABELS[paymentKey] || payload.paymentMethod || payload.paymentGateway || "Unknown";
  const supplierLabel = payload.supplier ? SUPPLIER_LABELS[payload.supplier.toLowerCase()] || payload.supplier : "";
  const amount = Number.isFinite(payload.amount) ? payload.amount.toFixed(2) : "0.00";
  const lines = [
    `${statusEmoji(status)} <b>${title}</b>`,
    `🧾 <b>Order ID:</b> <code>${escapeTelegramHtml(payload.orderNumber, "Unknown order", 160)}</code>`,
    `👤 <b>Customer name:</b> ${escapeTelegramHtml(payload.customerName, "Not collected", 120)}`,
    `🎮 <b>Game:</b> ${escapeTelegramHtml(payload.gameName, "Unknown game", 180)}`,
    `📦 <b>Package:</b> ${escapeTelegramHtml(payload.packageName, "Unknown package", 180)}`,
    `🆔 <b>Player ID:</b> <code>${escapeTelegramHtml(payload.playerId, "Not provided", 240)}</code>`,
    ...(payload.serverId ? [`🌐 <b>Server ID:</b> <code>${escapeTelegramHtml(payload.serverId, "", 120)}</code>`] : []),
    `💵 <b>Amount:</b> ${escapeTelegramHtml(`${amount} ${payload.currency || "USD"}`, "0.00 USD", 30)}`,
    `💳 <b>Payment method:</b> ${escapeTelegramHtml(paymentLabel, "Unknown", 80)}`,
    ...(supplierLabel ? [`🏭 <b>Supplier:</b> ${escapeTelegramHtml(supplierLabel, "", 80)}`] : []),
    ...(payload.transactionId ? [`🔗 <b>Transaction ID:</b> <code>${escapeTelegramHtml(payload.transactionId, "", 180)}</code>`] : []),
    ...(payload.customerContact ? [`📞 <b>Customer contact:</b> ${escapeTelegramHtml(payload.customerContact, "", 180)}`] : []),
    ...(status === "FAILED" || status === "EXPIRED"
      ? [`⚠️ <b>${status === "EXPIRED" ? "Expiry reason" : "Error reason"}:</b> ${escapeTelegramHtml(payload.errorReason, status === "EXPIRED" ? "Payment expired." : "Failure confirmed by provider or administrator.", 500)}`]
      : []),
    `🕒 <b>Date and time:</b> ${escapeTelegramHtml(formatOccurredAt(payload.occurredAt), "Not available", 80)} (Asia/Phnom_Penh)`,
  ];
  return lines.join("\n");
}
