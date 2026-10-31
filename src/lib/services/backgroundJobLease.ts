import "server-only";
import { randomUUID } from "node:crypto";
import { BackgroundJobLease } from "@/models/BackgroundJobLease";

export async function acquireJobLease(name: string, durationMs: number) {
  const token = randomUUID();
  try {
    const lease = await BackgroundJobLease.findOneAndUpdate(
      { _id: name, until: { $lte: new Date() } },
      { $set: { token, until: new Date(Date.now() + durationMs) } },
      { upsert: true, new: true },
    ).lean();
    return lease ? token : null;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return null;
    throw error;
  }
}

export async function releaseJobLease(name: string, token: string) {
  await BackgroundJobLease.updateOne({ _id: name, token }, { $set: { until: new Date(0) } });
}
