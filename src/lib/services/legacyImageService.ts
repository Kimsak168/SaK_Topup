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

export interface CachedLegacyImage {
  bytes: Uint8Array;
  contentType: string;
  updatedAt?: Date;
  cachedAt: number;
}

const MAX_CACHE_ENTRIES = 200;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const imageMemoryCache = new Map<string, CachedLegacyImage>();
const pendingFetches = new Map<string, Promise<unknown>>();

export function getCachedLegacyImage(key: string): CachedLegacyImage | null {
  const item = imageMemoryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.cachedAt > CACHE_TTL_MS) {
    imageMemoryCache.delete(key);
    return null;
  }
  return item;
}

export function setCachedLegacyImage(key: string, data: { bytes: Uint8Array; contentType: string; updatedAt?: Date }) {
  if (imageMemoryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = imageMemoryCache.keys().next().value;
    if (oldestKey) imageMemoryCache.delete(oldestKey);
  }
  imageMemoryCache.set(key, { ...data, cachedAt: Date.now() });
}

export function invalidateLegacyImage(key: string) {
  imageMemoryCache.delete(key);
}

export async function fetchWithDeduplication<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const existing = pendingFetches.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      return await fetcher();
    } finally {
      pendingFetches.delete(key);
    }
  })();

  pendingFetches.set(key, promise);
  return promise;
}
