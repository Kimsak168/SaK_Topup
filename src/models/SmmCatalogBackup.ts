import mongoose, { Document, Model, Schema } from "mongoose";

export type SmmCatalogBackupAction = "sync" | "cleanup";

export interface ISmmCatalogBackup extends Document {
  operationId: string;
  action: SmmCatalogBackupAction;
  actor: string;
  planHash: string;
  batchNumber: number;
  records: Record<string, unknown>[];
  createdAt: Date;
}

const SmmCatalogBackupSchema = new Schema<ISmmCatalogBackup>(
  {
    operationId: { type: String, required: true, index: true },
    action: { type: String, enum: ["sync", "cleanup"], required: true },
    actor: { type: String, required: true, trim: true, maxlength: 128 },
    planHash: { type: String, required: true, maxlength: 64 },
    batchNumber: { type: Number, required: true },
    records: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SmmCatalogBackupSchema.index({ operationId: 1, batchNumber: 1 }, { unique: true });

export const SmmCatalogBackup: Model<ISmmCatalogBackup> =
  mongoose.models.SmmCatalogBackup || mongoose.model<ISmmCatalogBackup>("SmmCatalogBackup", SmmCatalogBackupSchema);
