import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOrder extends Document {
  orderNumber: string;
  gameSlug: string;
  gameName: string;
  supplier: "vizo" | "g2bulk";
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
  paymentMethod: "khqr" | "aba" | "wing" | "binance" | "manual";
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
  customerContact?: string;
  adminNotes?: string;
  errorLog?: string;
  paidAt?: Date;
  fulfilledAt?: Date;
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
      enum: ["vizo", "g2bulk"],
      required: true,
      index: true,
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
      enum: ["khqr", "aba", "wing", "binance", "manual"],
      default: "khqr",
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
  },
  {
    timestamps: true,
  }
);

OrderSchema.index({ createdAt: -1 });

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);
