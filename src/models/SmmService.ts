import mongoose, { Document, Model, Schema } from "mongoose";

export type SmmPlatform = "tiktok" | "telegram" | "facebook" | "instagram" | "youtube" | "other";
export type SmmServiceType = "followers" | "likes" | "views" | "comments" | "shares" | "other";

export interface ISmmService extends Document {
  supplier: "vngzz2";
  supplierServiceId: string;
  name: string;
  category: string;
  serviceType: SmmServiceType;
  platform: SmmPlatform;
  description?: string;
  sourceCategory?: string;
  sourceDescription?: string;
  rate: number | null;
  min: number | null;
  max: number | null;
  refill?: boolean | null;
  supplierAvailable: boolean;
  isActive: boolean;
  requiresReview: boolean;
  reviewFlags: string[];
  fingerprint: string;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SmmServiceSchema = new Schema<ISmmService>(
  {
    supplier: { type: String, enum: ["vngzz2"], required: true, default: "vngzz2" },
    // Preserve the provider identifier byte-for-byte. It is used by the order API.
    supplierServiceId: { type: String, required: true, trim: false },
    name: { type: String, default: "", trim: true, maxlength: 240 },
    category: { type: String, default: "Other Services", trim: true, maxlength: 80 },
    serviceType: { type: String, enum: ["followers", "likes", "views", "comments", "shares", "other"], default: "other", index: true },
    platform: { type: String, enum: ["tiktok", "telegram", "facebook", "instagram", "youtube", "other"], default: "other", index: true },
    description: { type: String, default: "", trim: true, maxlength: 240 },
    sourceCategory: { type: String, select: false, maxlength: 160 },
    sourceDescription: { type: String, select: false, maxlength: 2000 },
    // Supplier wholesale rate is private and must be explicitly selected server-side.
    rate: { type: Number, default: null, select: false },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    refill: { type: Boolean, default: null },
    supplierAvailable: { type: Boolean, default: false, index: true },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
      validate: {
        validator(this: object, value: boolean) {
          if (!value) return true;
          const service = this as unknown as ISmmService;
          return Boolean(
            service.supplierServiceId?.trim() && service.supplierServiceId === service.supplierServiceId.trim() && service.name?.trim() && service.category?.trim() &&
            ["tiktok", "telegram", "facebook", "instagram", "youtube", "other"].includes(service.platform) &&
            ["followers", "likes", "views", "comments", "shares", "other"].includes(service.serviceType) && service.fingerprint?.trim() &&
            typeof service.rate === "number" && Number.isFinite(service.rate) && service.rate > 0 && service.rate <= Number.MAX_SAFE_INTEGER &&
            Number.isSafeInteger(service.min) && (service.min || 0) > 0 &&
            Number.isSafeInteger(service.max) && (service.max || 0) >= (service.min || 0) &&
            service.supplierAvailable && !service.requiresReview && (!Array.isArray(service.reviewFlags) || service.reviewFlags.length === 0)
          );
        },
        message: "A service must pass catalog validation and be available before activation.",
      },
    },
    requiresReview: { type: Boolean, default: false, index: true },
    reviewFlags: { type: [String], default: [] },
    fingerprint: { type: String, required: true, index: true },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SmmServiceSchema.index({ supplier: 1, supplierServiceId: 1 }, { unique: true, name: "uniq_smm_supplier_service" });
SmmServiceSchema.index({ isActive: 1, supplierAvailable: 1, platform: 1, serviceType: 1, name: 1 });
SmmServiceSchema.index({ fingerprint: 1, supplier: 1 });

export const SmmService: Model<ISmmService> =
  mongoose.models.SmmService || mongoose.model<ISmmService>("SmmService", SmmServiceSchema);
