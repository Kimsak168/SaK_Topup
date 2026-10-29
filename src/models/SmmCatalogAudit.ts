import mongoose, { Document, Model, Schema } from "mongoose";

export type SmmCatalogAuditAction = "sync" | "cleanup" | "bulk_activate" | "bulk_deactivate";

export interface ISmmCatalogAudit extends Document {
  action: SmmCatalogAuditAction;
  actor: string;
  planHash?: string;
  summary: Record<string, number | string | boolean>;
  createdAt: Date;
}

const SmmCatalogAuditSchema = new Schema<ISmmCatalogAudit>(
  {
    action: { type: String, enum: ["sync", "cleanup", "bulk_activate", "bulk_deactivate"], required: true, index: true },
    actor: { type: String, required: true, trim: true, maxlength: 128 },
    planHash: { type: String, trim: true, maxlength: 64 },
    summary: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SmmCatalogAuditSchema.index({ createdAt: -1 });

export const SmmCatalogAudit: Model<ISmmCatalogAudit> =
  mongoose.models.SmmCatalogAudit || mongoose.model<ISmmCatalogAudit>("SmmCatalogAudit", SmmCatalogAuditSchema);
