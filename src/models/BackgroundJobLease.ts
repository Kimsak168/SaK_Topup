import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  _id: { type: String, required: true },
  token: { type: String, required: true },
  until: { type: Date, required: true },
});

export const BackgroundJobLease = mongoose.models.BackgroundJobLease || mongoose.model("BackgroundJobLease", schema);
