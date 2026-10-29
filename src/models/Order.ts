import mongoose, { Schema, Document, Model } from "mongoose";

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
  adminNotes?: string;
  errorLog?: string;
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
    adminNotes: {
      type: String,
    },
    errorLog: {
      type: String,
    },
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

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ paymentStatus: 1, createdAt: -1 });
OrderSchema.index({ fulfillmentStatus: 1, createdAt: -1 });
OrderSchema.index({ paymentStatus: 1, paidAt: -1 });
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
