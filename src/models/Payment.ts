import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPayment extends Document {
  paymentId: string;
  orderNumber: string;
  gateway: "anajakpay" | "khqr" | "aba" | "wing" | "binance" | "manual";
  transactionId?: string;
  amount: number;
  currency: string;
  status:
    | "pending"
    | "successful"
    | "failed"
    | "expired"
    | "paid"
    | "PENDING"
    | "PAID"
    | "SUCCESSFUL"
    | "FAILED"
    | "EXPIRED";
  payerAccount?: string;
  paidAt?: Date;
  rawResponse?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    paymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    orderNumber: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    gateway: {
      type: String,
      enum: ["anajakpay", "khqr", "aba", "wing", "binance", "manual"],
      required: true,
      index: true,
    },
    transactionId: {
      type: String,
      trim: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "successful",
        "failed",
        "expired",
        "paid",
        "PENDING",
        "PAID",
        "SUCCESSFUL",
        "FAILED",
        "EXPIRED",
      ],
      default: "PENDING",
      index: true,
    },
    payerAccount: {
      type: String,
      trim: true,
    },
    paidAt: {
      type: Date,
    },
    rawResponse: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

PaymentSchema.index({ createdAt: -1 });

export const Payment: Model<IPayment> =
  mongoose.models.Payment || mongoose.model<IPayment>("Payment", PaymentSchema);
