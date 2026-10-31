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
  playerId?: string;
  serverId?: string;
  amount: number;
  currency?: string;
  paymentMethod?: string;
  paymentGateway?: string;
  supplier?: string;
  supplierOrderId?: string;
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

function text(value: unknown, fallback = "", maxLength = 240): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

export function escapeTelegramHtml(value: unknown, fallback = "", maxLength = 400): string {
  const raw = text(value, fallback, maxLength);
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
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
  aba_payway: "ABA PayWay V2",
  khqr: "KHQR",
  aba: "ABA Bank",
  wing: "Wing Bank",
  binance: "Binance Pay",
  manual: "Manual Payment",
};

const SUPPLIER_LABELS: Record<string, string> = {
  vngzz2: "VngZz",
  webbuilder: "WebBuilder",
  g2bulk: "G2Bulk",
};

function statusEmoji(status: TelegramNotificationStatus): string {
  if (status === "PENDING") return "⏳";
  if (status === "SUCCESS") return "✅";
  if (status === "FAILED") return "❌";
  return "⏳";
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
      customerName: text(order.customerName || order.playerName, "Customer", 120),
      customerContact: text(order.customerContact, "", 180),
      gameName: text(order.gameName, "Unknown game", 180),
      packageName: text(order.packageName, "Unknown package", 180),
      playerId: text(order.playerId, "Not provided", 240),
      serverId: text(order.serverId, "", 120),
      amount: typeof order.amount === "number" && Number.isFinite(order.amount) ? order.amount : 0,
      currency: text(order.currency, "USD", 8),
      paymentMethod: text(order.paymentMethod, "ABA PayWay V2", 80),
      paymentGateway: text(order.paymentGateway, "", 80),
      supplier: text(order.supplier, "", 80),
      supplierOrderId: text(order.supplierOrderId, "", 180),
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
  const paymentKey = (payload.paymentGateway || payload.paymentMethod || "").toLowerCase();
  const paymentLabel = PAYMENT_LABELS[paymentKey] || payload.paymentMethod || payload.paymentGateway || "ABA PayWay V2";
  const supplierLabel = payload.supplier ? SUPPLIER_LABELS[payload.supplier.toLowerCase()] || payload.supplier : "";
  const amount = Number.isFinite(payload.amount) ? payload.amount.toFixed(2) : "0.00";
  const customerName = payload.customerName && payload.customerName !== "Not collected" ? payload.customerName : "Customer";
  const dateTime = formatOccurredAt(payload.occurredAt);

  const emoji = statusEmoji(status);
  const header = `${emoji} <b>${kind} ${status}</b>`;

  const lines: string[] = [header];

  // 1. Order ID
  lines.push(`🧾 <b>Order ID:</b> <code>${escapeTelegramHtml(payload.orderNumber)}</code>`);

  // 2. Customer name
  lines.push(`👤 <b>Customer name:</b> ${escapeTelegramHtml(customerName)}`);

  // 3. Game
  lines.push(`🎮 <b>Game:</b> ${escapeTelegramHtml(payload.gameName)}`);

  // 4. Package
  if (payload.packageName) {
    lines.push(`📦 <b>Package:</b> ${escapeTelegramHtml(payload.packageName)}`);
  }

  // 5. Player ID (if provided)
  if (payload.playerId && payload.playerId !== "Not provided") {
    lines.push(`🆔 <b>Player ID:</b> <code>${escapeTelegramHtml(payload.playerId)}</code>`);
  }
  if (payload.serverId) {
    lines.push(`🌐 <b>Server ID:</b> <code>${escapeTelegramHtml(payload.serverId)}</code>`);
  }

  // 6. Amount
  lines.push(`💵 <b>Amount:</b> ${escapeTelegramHtml(`${amount} ${payload.currency || "USD"}`)}`);

  // 7. Payment method
  lines.push(`💳 <b>Payment method:</b> ${escapeTelegramHtml(paymentLabel)}`);

  // 8. Supplier (for orders or when available)
  if (kind === "ORDER" || supplierLabel) {
    lines.push(`🏭 <b>Supplier:</b> ${escapeTelegramHtml(supplierLabel || "WebBuilder")}`);
  }

  // 9. Supplier Order ID (if success on order)
  if (kind === "ORDER" && status === "SUCCESS" && payload.supplierOrderId) {
    lines.push(`📦 <b>Supplier Order ID:</b> <code>${escapeTelegramHtml(payload.supplierOrderId)}</code>`);
  }

  // 10. Transaction ID (if payment success or present)
  if (payload.transactionId && payload.transactionId !== "N/A") {
    lines.push(`🔗 <b>Transaction ID:</b> <code>${escapeTelegramHtml(payload.transactionId)}</code>`);
  }

  // 11. Error / Failure reason (if failed/expired)
  if (status === "FAILED" || status === "EXPIRED") {
    lines.push(`⚠️ <b>${status === "EXPIRED" ? "Expiry reason" : "Error reason"}:</b> ${escapeTelegramHtml(payload.errorReason || (kind === "PAYMENT" ? "Payment rejected or cancelled by provider." : "Supplier delivery failed."))}`);
  }

  // 12. Date and time
  lines.push(`🕒 <b>Date and time:</b> ${escapeTelegramHtml(dateTime)} (Asia/Phnom_Penh)`);

  return lines.join("\n");
}
