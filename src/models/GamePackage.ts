import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGamePackage extends Document {
  gameSlug: string;
  gameCode?: string;
  supplier: "vizo" | "g2bulk";
  supplierProductCode: string; // Vizo product_code or G2Bulk catalogue id
  name: string;
  diamondsOrPoints?: string;
  bonus?: string;
  customImage?: string;
  imageData?: Buffer;
  imageContentType?: string;
  packageType?: "direct" | "voucher";
  buyingPrice?: number | null; // Server-only supplier cost. NEVER EXPOSE TO CLIENT.
  sellingPrice: number | null; // Admin-configured selling price. Null if not configured.
  originalPrice?: number | null;
  currency: string;
  badge?: string;
  isActive: boolean;
  isFeatured: boolean;
  adminConfigured: boolean; // True when price has been set by an admin
  sortOrder: number;
  syncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GamePackageSchema = new Schema<IGamePackage>(
  {
    gameSlug: {
      type: String,
      required: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    gameCode: {
      type: String,
      index: true,
      trim: true,
    },
    supplier: {
      type: String,
      enum: ["vizo", "g2bulk"],
      required: true,
      index: true,
    },
    supplierProductCode: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    diamondsOrPoints: {
      type: String,
      default: "",
    },
    bonus: {
      type: String,
      default: "",
    },
    customImage: {
      type: String,
    },
    imageData: {
      type: Buffer,
      select: false,
    },
    imageContentType: {
      type: String,
      select: false,
    },
    packageType: {
      type: String,
      enum: ["direct", "voucher"],
      default: "direct",
    },
    buyingPrice: {
      type: Number,
      default: null,
      // supplier cost in USD (kept private)
    },
    sellingPrice: {
      type: Number,
      default: null,
      // customer selling price in USD. Null if not configured by admin.
    },
    originalPrice: {
      type: Number,
      default: null,
    },
    currency: {
      type: String,
      default: "USD",
    },
    badge: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    adminConfigured: {
      type: Boolean,
      default: false,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
GamePackageSchema.index({ gameSlug: 1, supplierProductCode: 1 }, { unique: true });
GamePackageSchema.index({ supplier: 1, supplierProductCode: 1 });
GamePackageSchema.index({ supplier: 1, gameCode: 1, sortOrder: 1, sellingPrice: 1 });
GamePackageSchema.index({ supplier: 1, gameSlug: 1, sortOrder: 1, sellingPrice: 1 });

export const GamePackage: Model<IGamePackage> =
  mongoose.models.GamePackage ||
  mongoose.model<IGamePackage>("GamePackage", GamePackageSchema);
