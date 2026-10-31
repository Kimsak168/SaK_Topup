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
  qrString?: string;
  qrImage?: string;
  qrPngUrl?: string;
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
      qrString: typeof order.qrString === "string" ? order.qrString : undefined,
      qrImage: typeof order.qrImage === "string" ? order.qrImage : undefined,
      qrPngUrl: typeof order.qrPngUrl === "string" ? order.qrPngUrl : undefined,
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
  const paymentLabel = PAYMENT_LABELS[paymentKey] || payload.paymentMethod || payload.paymentGateway || "ABA KHQR";
  const supplierLabel = payload.supplier ? SUPPLIER_LABELS[payload.supplier.toLowerCase()] || payload.supplier : "";
  const amount = Number.isFinite(payload.amount) ? payload.amount.toFixed(2) : "0.00";
  const customerName = payload.customerName && payload.customerName !== "Not collected" ? payload.customerName : "Customer";
  const dateTime = formatOccurredAt(payload.occurredAt);

  const divider = "━━━━━━━━━━━━━━━━━━";

  // Header emoji and title
  let titleBadge = `${kind} ${status}`;
  let emoji = "⏳";
  if (status === "PENDING") {
    emoji = "🟡";
  } else if (status === "SUCCESS") {
    emoji = "🟢";
  } else if (status === "FAILED") {
    emoji = "🔴";
  } else if (status === "EXPIRED") {
    emoji = "⌛";
  }

  const lines: string[] = [
    `${emoji} <b>${titleBadge}</b>`,
    divider,
    `🏪 <b>Store:</b> SakSuuu Game Top-Up`,
    `🧾 <b>Order ID:</b> <code>${escapeTelegramHtml(payload.orderNumber)}</code>`,
    `👤 <b>Customer name:</b> ${escapeTelegramHtml(customerName)}`,
    `🎮 <b>Game:</b> ${escapeTelegramHtml(payload.gameName)}`,
  ];

  if (payload.packageName) {
    lines.push(`📦 <b>Package:</b> ${escapeTelegramHtml(payload.packageName)}`);
  }

  if (payload.playerId && payload.playerId !== "Not provided") {
    lines.push(`🆔 <b>Player ID:</b> <code>${escapeTelegramHtml(payload.playerId)}</code>`);
  }

  if (payload.serverId) {
    lines.push(`🌐 <b>Server ID:</b> <code>${escapeTelegramHtml(payload.serverId)}</code>`);
  }

  lines.push(`💰 <b>Amount:</b> ${escapeTelegramHtml(`${amount} ${payload.currency || "USD"}`)}`);
  lines.push(`💳 <b>Payment method:</b> ${escapeTelegramHtml(paymentLabel)}`);

  if (kind === "ORDER" || supplierLabel) {
    lines.push(`🏭 <b>Supplier:</b> ${escapeTelegramHtml(supplierLabel || "WebBuilder")}`);
  }

  if (kind === "ORDER" && status === "SUCCESS" && payload.supplierOrderId) {
    lines.push(`📦 <b>Supplier Order ID:</b> <code>${escapeTelegramHtml(payload.supplierOrderId)}</code>`);
  }

  if (payload.transactionId && payload.transactionId !== "N/A" && (status === "SUCCESS" || kind === "PAYMENT")) {
    lines.push(`🔗 <b>Transaction ID:</b> <code>${escapeTelegramHtml(payload.transactionId)}</code>`);
  }

  if (status === "FAILED" || status === "EXPIRED") {
    lines.push(
      `⚠️ <b>${status === "EXPIRED" ? "Expiry reason" : "Error reason"}:</b> ${escapeTelegramHtml(
        payload.errorReason || (kind === "PAYMENT" ? "Payment rejected or cancelled by provider." : "Supplier delivery failed.")
      )}`
    );
  }

  // Common fields
  let statusDetail = `${kind} ${status}`;
  if (kind === "PAYMENT" && status === "SUCCESS") statusDetail = "PAYMENT CONFIRMED";
  if (kind === "PAYMENT" && status === "PENDING") statusDetail = "PAYMENT PENDING";
  if (kind === "ORDER" && status === "PENDING") statusDetail = "FULFILLMENT IN PROGRESS";
  if (kind === "ORDER" && status === "SUCCESS") statusDetail = "COMPLETED / DELIVERED";
  if (kind === "ORDER" && status === "FAILED") statusDetail = "DELIVERY FAILED";

  lines.push(`📌 <b>Status:</b> ${statusDetail}`);
  lines.push(`🕒 <b>Date and time:</b> ${escapeTelegramHtml(dateTime)} (Asia/Phnom_Penh)`);
  lines.push(divider);

  // Footer messages
  if (kind === "PAYMENT" && status === "PENDING") {
    lines.push(`📱 Customer payment QR is attached below.`);
  } else if (kind === "PAYMENT" && status === "SUCCESS") {
    lines.push(`🚀 Order is queued for automated fulfillment.`);
  } else if (kind === "PAYMENT" && status === "EXPIRED") {
    lines.push(`⚠️ QR code expired without payment confirmation.`);
  } else if (kind === "ORDER" && status === "PENDING") {
    lines.push(`⚡ Delivering to game server...`);
  } else if (kind === "ORDER" && status === "SUCCESS") {
    lines.push(`🎉 Customer top-up has been successfully delivered!`);
  } else if (kind === "ORDER" && status === "FAILED") {
    lines.push(`🚨 Manual admin intervention required!`);
  }

  return lines.join("\n");
}
