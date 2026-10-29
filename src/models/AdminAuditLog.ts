import mongoose, { Document, Model, Schema } from "mongoose";

export interface IAdminAuditLog extends Document {
  actorUsername: string;
  actorName: string;
  action: string;
  recordType: string;
  recordId: string;
  summary: string;
  createdAt: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    actorUsername: { type: String, required: true, trim: true, maxlength: 120 },
    actorName: { type: String, required: true, trim: true, maxlength: 120 },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    recordType: { type: String, required: true, trim: true, maxlength: 80 },
    recordId: { type: String, required: true, trim: true, maxlength: 160 },
    summary: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AdminAuditLogSchema.index({ createdAt: -1 }, { name: "admin_audit_recent" });
AdminAuditLogSchema.index({ recordType: 1, recordId: 1, createdAt: -1 }, { name: "admin_audit_record" });

export const AdminAuditLog: Model<IAdminAuditLog> =
  mongoose.models.AdminAuditLog || mongoose.model<IAdminAuditLog>("AdminAuditLog", AdminAuditLogSchema);
