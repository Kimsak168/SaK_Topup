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
  profit?: number;
  storeName?: string;
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
      customerName: text(order.playerName || order.customerName, "N/A", 120),
      customerContact: text(order.customerContact, "", 180),
      gameName: text(order.gameName, "Unknown game", 180),
      packageName: text(order.packageName, "Unknown package", 180),
      playerId: text(order.playerId, "Not provided", 240),
      serverId: text(order.serverId, "", 120),
      amount: typeof order.amount === "number" && Number.isFinite(order.amount) ? order.amount : 0,
      currency: text(order.currency, "USD", 8),
      profit: typeof order.profit === "number" && Number.isFinite(order.profit)
        ? order.profit
        : (typeof order.amount === "number" && typeof order.buyingPrice === "number"
          ? Math.max(0, Number((order.amount - order.buyingPrice).toFixed(2)))
          : undefined),
      storeName: text(order.storeName, "SakSuuu Game Top-Up", 120),
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
  const ign = payload.customerName && payload.customerName !== "Not collected" ? payload.customerName : "N/A";
  const dateTime = formatOccurredAt(payload.occurredAt);

  const divider = "━━━━━━━━━━━━━━━━━━";

  // Calculate profit
  const profitNum = typeof payload.profit === "number" && Number.isFinite(payload.profit)
    ? payload.profit
    : 0;
  const profitStr = profitNum.toFixed(2);

  // Clean title without emoji
  let titleBadge = `${kind} ${status}`;
  if (kind === "ORDER" && status === "PENDING") titleBadge = "ORDER PENDING";
  else if (kind === "ORDER" && status === "SUCCESS") titleBadge = "ORDER SUCCESS";
  else if (kind === "ORDER" && status === "FAILED") titleBadge = "ORDER FAILED";
  else if (kind === "PAYMENT" && status === "PENDING") titleBadge = "PAYMENT PENDING";
  else if (kind === "PAYMENT" && status === "SUCCESS") titleBadge = "PAYMENT SUCCESS";
  else if (kind === "PAYMENT" && status === "FAILED") titleBadge = "PAYMENT FAILED";
  else if (kind === "PAYMENT" && status === "EXPIRED") titleBadge = "PAYMENT EXPIRED";

  // Status description
  let statusDetail = `${kind} ${status}`;
  if (kind === "ORDER" && status === "PENDING") statusDetail = "FULFILLMENT IN PROGRESS";
  else if (kind === "ORDER" && status === "SUCCESS") statusDetail = "COMPLETED / DELIVERED";
  else if (kind === "ORDER" && status === "FAILED") statusDetail = "DELIVERY FAILED";
  else if (kind === "PAYMENT" && status === "PENDING") statusDetail = "PAYMENT PENDING";
  else if (kind === "PAYMENT" && status === "SUCCESS") statusDetail = "VERIFIED / PAID";
  else if (kind === "PAYMENT" && status === "FAILED") statusDetail = "PAYMENT FAILED";
  else if (kind === "PAYMENT" && status === "EXPIRED") statusDetail = "PAYMENT EXPIRED";

  const storeName = payload.storeName || "SakSuuu Game Top-Up";

  const lines: string[] = [
    titleBadge,
    divider,
    `Store: ${escapeTelegramHtml(storeName)}`,
    `Order ID: <code>${escapeTelegramHtml(payload.orderNumber)}</code>`,
    `IGN: <code>${escapeTelegramHtml(ign)}</code>`,
    `Game: ${escapeTelegramHtml(payload.gameName)}`,
    `Package: ${escapeTelegramHtml(payload.packageName)}`,
  ];

  if (payload.playerId && payload.playerId !== "Not provided") {
    lines.push(`Player ID: <code>${escapeTelegramHtml(payload.playerId)}</code>`);
  }

  if (payload.serverId) {
    lines.push(`Server ID: <code>${escapeTelegramHtml(payload.serverId)}</code>`);
  }

  lines.push(`Amount: ${escapeTelegramHtml(`${amount} ${payload.currency || "USD"}`)}`);
  lines.push(`Profit: ${escapeTelegramHtml(`${profitStr} ${payload.currency || "USD"}`)}`);
  lines.push(`Payment method: ${escapeTelegramHtml(paymentLabel)}`);

  if (kind === "ORDER" || supplierLabel) {
    lines.push(`Supplier: ${escapeTelegramHtml(supplierLabel || "WebBuilder")}`);
  }

  if (kind === "ORDER" && status === "SUCCESS" && payload.supplierOrderId) {
    lines.push(`Supplier Order ID: <code>${escapeTelegramHtml(payload.supplierOrderId)}</code>`);
  }

  if (payload.transactionId && payload.transactionId !== "N/A" && (status === "SUCCESS" || kind === "PAYMENT")) {
    lines.push(`Transaction ID: <code>${escapeTelegramHtml(payload.transactionId)}</code>`);
  }

  if (status === "FAILED" || status === "EXPIRED") {
    lines.push(
      `${status === "EXPIRED" ? "Expiry reason" : "Error reason"}: ${escapeTelegramHtml(
        payload.errorReason || (kind === "PAYMENT" ? "Payment expired or cancelled by provider." : "Supplier delivery failed.")
      )}`
    );
  }

  lines.push(`Status: ${statusDetail}`);
  lines.push(`Date and time: ${escapeTelegramHtml(dateTime)} (Asia/Phnom_Penh)`);
  lines.push(divider);

  return lines.join("\n");
}
