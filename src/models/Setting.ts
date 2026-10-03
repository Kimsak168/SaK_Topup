import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISetting extends Document {
  key: string;
  siteName: string;
  siteTagline: string;
  logoUrl?: string;
  telegramSupport: string;
  whatsappSupport?: string;
  defaultMarginPercent: number; // default markup margin on supplier price
  currencyRateKHR: number; // e.g. 4100
  maintenanceMode: boolean;
  announcement?: string;
  enabledGateways: string[]; // ["khqr", "aba", "wing", "binance"]
  updatedAt: Date;
}

const SettingSchema = new Schema<ISetting>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "general",
    },
    siteName: {
      type: String,
      default: "SakSuuu Game Top-Up",
    },
    siteTagline: {
      type: String,
      default: "Official Direct Game Recharge & 24/7 Fast Delivery",
    },
    logoUrl: {
      type: String,
    },
    telegramSupport: {
      type: String,
      default: "https://t.me/saksuuu_support",
    },
    whatsappSupport: {
      type: String,
      default: "",
    },
    defaultMarginPercent: {
      type: Number,
      default: 10,
    },
    currencyRateKHR: {
      type: Number,
      default: 4100,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    announcement: {
      type: String,
      default: "Welcome to SakSuuu Top-Up! Direct supplier pricing for Free Fire, PUBG Mobile & Mobile Legends.",
    },
    enabledGateways: {
      type: [String],
      default: ["khqr", "aba", "wing", "binance"],
    },
  },
  {
    timestamps: true,
  }
);

export const Setting: Model<ISetting> =
  mongoose.models.Setting || mongoose.model<ISetting>("Setting", SettingSchema);
