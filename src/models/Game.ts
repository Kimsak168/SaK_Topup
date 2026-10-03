import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGame extends Document {
  slug: string;
  name: string;
  supplier: "vizo" | "g2bulk";
  supplierGameCode: string;
  category: string;
  image: string;
  customImage?: string;
  banner?: string;
  publisher: string;
  currencyName: string; // e.g. "Diamonds", "UC", "V-Bucks", "Points"
  description: string;
  type?: "direct" | "voucher";
  requiresServer: boolean;
  serverLabel?: string;
  userIdLabel?: string;
  instruction?: string;
  badge?: string;
  isPopular: boolean;
  isTrending: boolean;
  isActive: boolean;
  defaultMarginPercent: number; // e.g. 10 means 10% markup
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const GameSchema = new Schema<IGame>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    supplier: {
      type: String,
      enum: ["vizo", "g2bulk"],
      required: true,
    },
    supplierGameCode: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "Action",
      index: true,
    },
    image: {
      type: String,
      required: true,
    },
    customImage: {
      type: String,
    },
    type: {
      type: String,
      enum: ["direct", "voucher"],
      default: "direct",
    },
    banner: {
      type: String,
    },
    publisher: {
      type: String,
      default: "Official Publisher",
    },
    currencyName: {
      type: String,
      default: "Diamonds",
    },
    description: {
      type: String,
      default: "Instant automated in-game top-up with 24/7 delivery.",
    },
    requiresServer: {
      type: Boolean,
      default: false,
    },
    serverLabel: {
      type: String,
      default: "Server ID / Zone ID",
    },
    userIdLabel: {
      type: String,
      default: "Player ID",
    },
    instruction: {
      type: String,
      default: "Enter your Player ID accurately. You can find it inside your in-game profile.",
    },
    badge: {
      type: String,
      default: "",
    },
    isPopular: {
      type: Boolean,
      default: false,
      index: true,
    },
    isTrending: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    defaultMarginPercent: {
      type: Number,
      default: 12,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

GameSchema.index({ supplier: 1, supplierGameCode: 1 }, { unique: true });

export const Game: Model<IGame> =
  mongoose.models.Game || mongoose.model<IGame>("Game", GameSchema);
