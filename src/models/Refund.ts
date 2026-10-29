import mongoose, { Document, Model, Schema } from "mongoose";

export type RefundStatus = "requested" | "processing" | "completed" | "failed";

export interface IRefund extends Document {
  refundId: string;
  idempotencyKey: string;
  orderNumber: string;
  paymentId?: string;
  gateway: string;
  amount: mongoose.Types.Decimal128;
  currency: string;
  status: RefundStatus;
  reason: string;
  externalReference?: string;
  failureNote?: string;
  createdBy: string;
  updatedBy?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RefundSchema = new Schema<IRefund>({
  refundId: { type: String, required: true, unique: true, trim: true },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 120 },
  orderNumber: { type: String, required: true, index: true, trim: true },
  paymentId: { type: String, trim: true },
  gateway: { type: String, required: true, trim: true, maxlength: 40 },
  amount: { type: Schema.Types.Decimal128, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
  status: { type: String, enum: ["requested", "processing", "completed", "failed"], default: "requested", index: true },
  reason: { type: String, required: true, trim: true, maxlength: 240 },
  externalReference: { type: String, trim: true, maxlength: 160 },
  failureNote: { type: String, trim: true, maxlength: 240 },
  createdBy: { type: String, required: true, trim: true, maxlength: 120 },
  updatedBy: { type: String, trim: true, maxlength: 120 },
  completedAt: { type: Date },
}, { timestamps: true });

RefundSchema.index({ idempotencyKey: 1 }, { unique: true, name: "uniq_refund_idempotency_key" });
RefundSchema.index({ orderNumber: 1, createdAt: -1 }, { name: "refund_order_history" });
RefundSchema.index({ status: 1, updatedAt: -1 }, { name: "refund_status_history" });

export const Refund: Model<IRefund> = mongoose.models.Refund || mongoose.model<IRefund>("Refund", RefundSchema);
