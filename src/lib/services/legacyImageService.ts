import { mongo } from "mongoose";

// Lean MongoDB reads return BSON Binary; hydrated Mongoose reads return Buffer.
export function legacyImageBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof mongo.Binary) return value.value();
  return null;
}

export function legacyImageCacheControl(version: string | null, updatedAt: Date | undefined, fallback: string): string {
  // Only a matching revision is immutable. New uploads use a new updatedAt URL;
  // unversioned admin previews retain the existing short-lived cache behavior.
  const revision = updatedAt?.getTime();
  return Number.isFinite(revision) && version === String(revision)
    ? "public, max-age=31536000, s-maxage=31536000, immutable"
    : fallback;
}
