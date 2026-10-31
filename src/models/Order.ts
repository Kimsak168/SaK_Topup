import mongoose, { Schema, Document, Model } from "mongoose";
import { after } from "next/server";
import {
  classifyOrderStatus,
  classifyPaymentStatus,
  createTelegramNotificationEvent,
  type TelegramNotificationEvent,
} from "@/lib/notifications/telegramFormat";

export interface IOrder extends Document {
  orderNumber: string;
  gameSlug: string;
  gameName: string;
  supplier: "vizo" | "g2bulk" | "webbuilder" | "vngzz2";
  serviceType?: "game" | "smm" | "digital";
  targetLink?: string;
  quantity?: number;
  packageId?: string;
  packageName: string;
  supplierProductCode: string;
  playerId: string;
  serverId?: string;
  playerName?: string;
  amount: number; // Customer price in USD
  buyingPrice?: number; // Supplier wholesale cost in USD
  profit?: number; // amount - buyingPrice
  currency: string;
  paymentMethod: "khqr" | "aba" | "wing" | "binance" | "manual" | "aba_payway_v2";
  paymentGateway?: "anajakpay" | "aba_payway_v2" | string;
  paymentStatus:
    | "pending"
    | "paid"
    | "failed"
    | "refunded"
    | "cancelled"
    | "expired"
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "CANCELLED"
    | "EXPIRED";
  fulfillmentStatus:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "delivered"
    | "NOT_STARTED"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED"
    | "DELIVERED";
  transactionId?: string;
  checkoutUrl?: string;
  supplierOrderId?: string;
  idempotencyKey?: string;
  requestHash?: string;
  priceSnapshotCents?: number;
  lastSupplierStatus?: string;
  webhookEvents?: string[];
  customerContact?: string;
  customerName?: string;
  adminNotes?: string;
  errorLog?: string;
  paymentErrorReason?: string;
  paymentVerification?: { gateway: string; transactionId: string; status: string; checkedAt: Date };
  telegramNotifications: TelegramNotificationEvent[];
  notificationRevision: number;
  supplierPollAttempts?: number;
  supplierNextPollAt?: Date;
  supplierPollLockedUntil?: Date;
  supplierPollToken?: string;
  paidAt?: Date;
  fulfilledAt?: Date;
  refundVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    gameSlug: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    gameName: {
      type: String,
      required: true,
      trim: true,
    },
    supplier: {
      type: String,
      enum: ["vizo", "g2bulk", "webbuilder", "vngzz2"],
      default: "webbuilder",
      required: true,
      index: true,
    },
    serviceType: {
      type: String,
      enum: ["game", "smm", "digital"],
      default: "game",
      index: true,
    },
    targetLink: {
      type: String,
      trim: true,
    },
    quantity: {
      type: Number,
    },
    packageId: {
      type: String,
    },
    packageName: {
      type: String,
      required: true,
      trim: true,
    },
    supplierProductCode: {
      type: String,
      required: true,
      trim: true,
    },
    playerId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    serverId: {
      type: String,
      trim: true,
    },
    playerName: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    buyingPrice: {
      type: Number,
      default: 0,
    },
    profit: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    paymentMethod: {
      type: String,
      enum: ["khqr", "aba", "wing", "binance", "manual", "aba_payway_v2"],
      default: "khqr",
    },
    paymentGateway: {
      type: String,
      enum: ["anajakpay", "aba_payway_v2", "manual"],
      default: "anajakpay",
    },
    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "cancelled",
        "expired",
        "PENDING",
        "PAID",
        "FAILED",
        "CANCELLED",
        "EXPIRED",
      ],
      default: "PENDING",
      index: true,
    },
    fulfillmentStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "failed",
        "delivered",
        "NOT_STARTED",
        "PROCESSING",
        "COMPLETED",
        "FAILED",
        "DELIVERED",
      ],
      default: "NOT_STARTED",
      index: true,
    },
    transactionId: {
      type: String,
      trim: true,
      index: true,
    },
    checkoutUrl: {
      type: String,
      trim: true,
    },
    supplierOrderId: {
      type: String,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      trim: true,
    },
    requestHash: {
      type: String,
      trim: true,
    },
    priceSnapshotCents: {
      type: Number,
    },
    lastSupplierStatus: {
      type: String,
      trim: true,
    },
    webhookEvents: {
      type: [String],
      default: [],
    },
    customerContact: {
      type: String,
      trim: true,
    },
    customerName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    adminNotes: {
      type: String,
    },
    errorLog: {
      type: String,
    },
    paymentErrorReason: { type: String },
    paymentVerification: { type: Schema.Types.Mixed },
    telegramNotifications: {
      type: [new Schema({
        eventId: { type: String, required: true },
        dedupeKey: { type: String },
        kind: { type: String, enum: ["PAYMENT", "ORDER"], required: true },
        status: { type: String, enum: ["PENDING", "SUCCESS", "FAILED", "EXPIRED"], required: true },
        payload: { type: Schema.Types.Mixed, required: true },
        state: { type: String, enum: ["queued", "sending", "retrying", "sent", "failed"], default: "queued", required: true },
        attemptCount: { type: Number, default: 0 },
        attempts: {
          type: [{
            at: { type: Date, required: true },
            outcome: { type: String, enum: ["sending", "sent", "retrying", "failed"], required: true },
            error: { type: String },
          }],
          default: [],
        },
        createdAt: { type: Date, required: true },
        nextAttemptAt: { type: Date, required: true },
        lockedAt: { type: Date },
        lockToken: { type: String },
        sentAt: { type: Date },
        telegramMessageId: { type: String },
        lastError: { type: String },
      }, { _id: false }),],
      default: [],
    },
    notificationRevision: { type: Number, default: 0 },
    supplierPollAttempts: { type: Number, default: 0 },
    supplierNextPollAt: { type: Date },
    supplierPollLockedUntil: { type: Date },
    supplierPollToken: { type: String },
    paidAt: {
      type: Date,
    },
    fulfilledAt: {
      type: Date,
    },
    refundVersion: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
  }
);

function createOrderStatusEvents(current: Record<string, unknown>, next: Record<string, unknown>) {
  const events: TelegramNotificationEvent[] = [];
  const previousPayment = classifyPaymentStatus(current.paymentStatus);
  const nextPayment = classifyPaymentStatus(next.paymentStatus);
  if (nextPayment && nextPayment !== previousPayment) {
    events.push(createTelegramNotificationEvent({
      order: next,
      kind: "PAYMENT",
      status: nextPayment,
      dedupeKey: `payment-transition:${Number(current.notificationRevision || 0) + 1}`,
      errorReason: typeof next.paymentErrorReason === "string" ? next.paymentErrorReason : undefined,
    }));
  }

  const previousOrder = classifyOrderStatus(current.fulfillmentStatus);
  const nextOrder = classifyOrderStatus(next.fulfillmentStatus);
  if (nextOrder && nextOrder !== previousOrder) {
    events.push(createTelegramNotificationEvent({
      order: next,
      kind: "ORDER",
      status: nextOrder,
      dedupeKey: `order-transition:${Number(current.notificationRevision || 0) + 1}`,
      errorReason: typeof next.errorLog === "string" ? next.errorLog : undefined,
    }));
  }
  return events;
}

function dispatchTelegramEvents() {
  try {
    after(async () => {
      try {
        const { dispatchPendingTelegramNotifications } = await import("@/lib/services/telegramNotificationService");
        await dispatchPendingTelegramNotifications(8);
      } catch {
        console.error("[Telegram] Dispatch deferred to the durable worker.");
      }
    });
  } catch {
    // Maintenance scripts have no request context. Cron drains the durable outbox.
  }
}

OrderSchema.post("init", function (doc) {
  doc.$locals.notificationSnapshot = {
    paymentStatus: doc.paymentStatus,
    fulfillmentStatus: doc.fulfillmentStatus,
    notificationRevision: doc.notificationRevision,
  };
});

OrderSchema.pre("save", async function () {
  const orderDoc = this as typeof this & { $where?: Record<string, unknown>; $locals: Record<string, unknown> };
  if (orderDoc.isNew) {
    orderDoc.telegramNotifications.push(...createOrderStatusEvents({}, orderDoc.toObject() as unknown as Record<string, unknown>));
    return;
  }

  if (!orderDoc.isModified("paymentStatus") && !orderDoc.isModified("fulfillmentStatus")) return;

  const OrderModel = orderDoc.constructor as Model<IOrder>;
  const previous = await OrderModel.findById(orderDoc._id)
    .select("paymentStatus fulfillmentStatus notificationRevision")
    .lean();
  if (!previous) return;
  const snapshot = orderDoc.$locals.notificationSnapshot as Record<string, unknown> | undefined;
  if (snapshot && (Number(snapshot.notificationRevision || 0) !== Number(previous.notificationRevision || 0) ||
    snapshot.paymentStatus !== previous.paymentStatus || snapshot.fulfillmentStatus !== previous.fulfillmentStatus)) {
    throw new Error("Order status changed concurrently. Reload before updating.");
  }

  const next = orderDoc.toObject() as unknown as Record<string, unknown>;
  const events = createOrderStatusEvents(previous as unknown as Record<string, unknown>, next);
  orderDoc.telegramNotifications.push(...events);
  orderDoc.notificationRevision = Number(previous.notificationRevision || 0) + 1;
  orderDoc.$where = {
    ...(orderDoc.$where || {}),
    paymentStatus: previous.paymentStatus,
    fulfillmentStatus: previous.fulfillmentStatus,
    notificationRevision: previous.notificationRevision ?? { $exists: false },
  };
  orderDoc.$locals.telegramNotificationsChanged = true;
});

OrderSchema.pre(["findOneAndUpdate", "updateOne"], async function () {
  const query = this as typeof this & { getUpdate(): unknown; setUpdate(update: unknown): void; setQuery(filter: Record<string, unknown>): void };
  const update = query.getUpdate();
  if (!update || Array.isArray(update)) return;

  const updateRecord = update as Record<string, unknown>;
  const setFields = {
    ...(typeof updateRecord.$set === "object" && updateRecord.$set !== null ? updateRecord.$set as Record<string, unknown> : {}),
    ...Object.fromEntries(Object.entries(updateRecord).filter(([key]) => !key.startsWith("$"))),
  };
  if (!("paymentStatus" in setFields) && !("fulfillmentStatus" in setFields)) return;

  const current = await this.model.findOne(this.getQuery()).lean();
  if (!current) return;

  const next = { ...current, ...setFields } as Record<string, unknown>;
  const events = createOrderStatusEvents(current as Record<string, unknown>, next);
  query.setQuery({
    $and: [this.getQuery(), {
      _id: current._id,
      paymentStatus: current.paymentStatus,
      fulfillmentStatus: current.fulfillmentStatus,
      notificationRevision: current.notificationRevision ?? { $exists: false },
    }],
  });
  const push = typeof updateRecord.$push === "object" && updateRecord.$push !== null
    ? updateRecord.$push as Record<string, unknown>
    : {};
  if (events.length) {
    push.telegramNotifications = { $each: events };
    updateRecord.$push = push;
  }
  updateRecord.$inc = { ...(updateRecord.$inc as object || {}), notificationRevision: 1 };
  query.setUpdate(updateRecord);
});

OrderSchema.post("save", async function (order) {
  order.$where = {};
  order.$locals.notificationSnapshot = {
    paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus,
    notificationRevision: order.notificationRevision,
  };
  if (order?.orderNumber && order.telegramNotifications?.some((event: TelegramNotificationEvent) => event.state === "queued" || event.state === "retrying")) {
    dispatchTelegramEvents();
  }
});

OrderSchema.post("findOneAndUpdate", async function (order) {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (order?.orderNumber && update?.$inc && "notificationRevision" in (update.$inc as object)) {
    dispatchTelegramEvents();
  }
});

OrderSchema.post("updateOne", function () {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (update?.$inc && "notificationRevision" in (update.$inc as object)) dispatchTelegramEvents();
});

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ paymentStatus: 1, createdAt: -1 });
OrderSchema.index({ fulfillmentStatus: 1, createdAt: -1 });
OrderSchema.index({ paymentStatus: 1, paidAt: -1 });
OrderSchema.index(
  { "telegramNotifications.state": 1, "telegramNotifications.nextAttemptAt": 1 },
  { name: "telegram_notification_outbox_due" }
);
OrderSchema.index({ "telegramNotifications.state": 1, "telegramNotifications.lockedAt": 1 }, { name: "telegram_notification_stale" });
OrderSchema.index({ supplierNextPollAt: 1, createdAt: 1 }, { name: "supplier_status_poll_due" });
OrderSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } }, name: "uniq_order_idempotency_key" }
);
OrderSchema.index(
  { supplier: 1, supplierOrderId: 1 },
  { unique: true, partialFilterExpression: { supplierOrderId: { $type: "string", $gt: "" } }, name: "uniq_supplier_order_id" }
);
if (process.env.NODE_ENV !== "production" && mongoose.models.Order) {
  delete (mongoose.models as Record<string, unknown>).Order;
}

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);
