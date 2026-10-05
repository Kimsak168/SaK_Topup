import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBanner extends Document {
  title: string;
  subtitle: string;
  badge?: string;
  imageUrl: string;
  imageData?: Buffer;
  imageContentType?: string;
  targetUrl: string;
  ctaText: string;
  accentColor?: string; // e.g. "pink", "purple", "cyan", "gold"
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema = new Schema<IBanner>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subtitle: {
      type: String,
      default: "",
      trim: true,
    },
    badge: {
      type: String,
      default: "",
      trim: true,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    imageData: {
      type: Buffer,
      select: false,
    },
    imageContentType: {
      type: String,
      select: false,
    },
    targetUrl: {
      type: String,
      default: "/",
      trim: true,
    },
    ctaText: {
      type: String,
      default: "",
      trim: true,
    },
    accentColor: {
      type: String,
      default: "pink",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

BannerSchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });

export const Banner: Model<IBanner> =
  mongoose.models.Banner || mongoose.model<IBanner>("Banner", BannerSchema);
