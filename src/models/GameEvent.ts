import mongoose, { Document, Model, Schema } from "mongoose";
import {
  GAME_EVENT_GAMES,
  GAME_EVENT_STATUSES,
  GameEventGame,
  GameEventStatus,
} from "@/lib/gameEventTypes";

export interface IGameEvent extends Document {
  game: GameEventGame;
  title: string;
  description: string;
  details: string;
  startDate: Date;
  endDate: Date;
  status: GameEventStatus;
  imageUrl: string;
  imageData?: Buffer;
  imageContentType?: string;
  targetUrl: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const GameEventSchema = new Schema<IGameEvent>(
  {
    game: { type: String, enum: [...GAME_EVENT_GAMES], required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 320 },
    details: { type: String, default: "", trim: true, maxlength: 2000 },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    status: { type: String, enum: [...GAME_EVENT_STATUSES], default: "upcoming", index: true },
    imageUrl: { type: String, required: true, trim: true },
    imageData: { type: Buffer, select: false },
    imageContentType: { type: String, select: false },
    targetUrl: { type: String, default: "", trim: true, maxlength: 2048 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

GameEventSchema.index({ isActive: 1, sortOrder: 1, startDate: 1 });

export const GameEvent: Model<IGameEvent> =
  mongoose.models.GameEvent || mongoose.model<IGameEvent>("GameEvent", GameEventSchema);
