import mongoose, { Document, Model, Schema } from "mongoose";

export type SupplierId = "vngzz2" | "g2bulk" | "webbuilder";
export type SupplierConnectionStatus = "configured" | "connected" | "failed" | "unavailable" | "disabled";

export interface ISupplierConfiguration extends Document {
  supplierId: SupplierId;
  displayName: string;
  enabled: boolean;
  lastConnectionStatus: SupplierConnectionStatus;
  lastConnectionTestAt?: Date;
  lastBalanceSyncAt?: Date;
  lastError?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierConfigurationSchema = new Schema<ISupplierConfiguration>(
  {
    supplierId: { type: String, enum: ["vngzz2", "g2bulk", "webbuilder"], required: true },
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    enabled: { type: Boolean, default: true, index: true },
    lastConnectionStatus: {
      type: String,
      enum: ["configured", "connected", "failed", "unavailable", "disabled"],
      default: "configured",
    },
    lastConnectionTestAt: { type: Date },
    lastBalanceSyncAt: { type: Date },
    lastError: { type: String, maxlength: 300, select: false },
    updatedBy: { type: String, trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

SupplierConfigurationSchema.index({ supplierId: 1 }, { unique: true, name: "uniq_supplier_configuration" });

export const SupplierConfiguration: Model<ISupplierConfiguration> =
  mongoose.models.SupplierConfiguration || mongoose.model<ISupplierConfiguration>("SupplierConfiguration", SupplierConfigurationSchema);
