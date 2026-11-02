import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRewardTransaction {
  type: "EARN_ORDER" | "EARN_LUCKY_DRAW" | "REDEEM" | "BONUS";
  points: number;
  orderNumber?: string;
  description: string;
  createdAt: Date;
}

export interface IRewardVoucher {
  code: string;
  title: string;
  type: "discount" | "diamonds" | "views";
  value: number; // e.g. 0.10, 0.25, 10
  minSpend?: number;
  isUsed: boolean;
  usedAt?: Date;
  orderNumber?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface IRewardWallet extends Document {
  identifier: string; // phone, email, or orderNumber
  points: number;
  totalPointsEarned: number;
  transactions: IRewardTransaction[];
  vouchers: IRewardVoucher[];
  createdAt: Date;
  updatedAt: Date;
}

const RewardTransactionSchema = new Schema<IRewardTransaction>(
  {
    type: { type: String, enum: ["EARN_ORDER", "EARN_LUCKY_DRAW", "REDEEM", "BONUS"], required: true },
    points: { type: Number, required: true },
    orderNumber: { type: String, trim: true },
    description: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RewardVoucherSchema = new Schema<IRewardVoucher>(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    title: { type: String, required: true },
    type: { type: String, enum: ["discount", "diamonds", "views"], required: true },
    value: { type: Number, required: true },
    minSpend: { type: Number, default: 0 },
    isUsed: { type: Boolean, default: false },
    usedAt: { type: Date },
    orderNumber: { type: String, trim: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RewardWalletSchema = new Schema<IRewardWallet>(
  {
    identifier: { type: String, required: true, unique: true, trim: true, index: true },
    points: { type: Number, default: 0, min: 0 },
    totalPointsEarned: { type: Number, default: 0 },
    transactions: { type: [RewardTransactionSchema], default: [] },
    vouchers: { type: [RewardVoucherSchema], default: [] },
  },
  { timestamps: true }
);

export const RewardWallet: Model<IRewardWallet> =
  mongoose.models.RewardWallet || mongoose.model<IRewardWallet>("RewardWallet", RewardWalletSchema);

