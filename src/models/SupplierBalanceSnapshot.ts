import mongoose, { Document, Model, Schema } from "mongoose";
import type { SupplierId } from "@/models/SupplierConfiguration";

export type SupplierWalletId = "game" | "smm" | "available" | "reserved";

export interface ISupplierBalanceSnapshot extends Document {
  supplierId: SupplierId;
  walletId: SupplierWalletId;
  amount: mongoose.Types.Decimal128;
  currency: string;
  source: "live" | "manual";
  checkedAt: Date;
  checkedBy?: string;
  createdAt: Date;
}

const SupplierBalanceSnapshotSchema = new Schema<ISupplierBalanceSnapshot>(
  {
    supplierId: { type: String, enum: ["vngzz2", "g2bulk", "webbuilder"], required: true, index: true },
    walletId: { type: String, enum: ["game", "smm", "available", "reserved"], required: true },
    amount: { type: Schema.Types.Decimal128, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
    source: { type: String, enum: ["live", "manual"], required: true },
    checkedAt: { type: Date, required: true, default: Date.now, index: true },
    checkedBy: { type: String, trim: true, maxlength: 120 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SupplierBalanceSnapshotSchema.index(
  { supplierId: 1, walletId: 1, checkedAt: -1 },
  { name: "supplier_balance_history" }
);

export const SupplierBalanceSnapshot: Model<ISupplierBalanceSnapshot> =
  mongoose.models.SupplierBalanceSnapshot || mongoose.model<ISupplierBalanceSnapshot>("SupplierBalanceSnapshot", SupplierBalanceSnapshotSchema);
