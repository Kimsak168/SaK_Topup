import { mongo } from "mongoose";

// Lean MongoDB reads return BSON Binary; hydrated Mongoose reads return Buffer.
export function legacyImageBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof mongo.Binary) return value.value();
  return null;
}

export function legacyImageCacheControl(version: string | null, updatedAt: Date | undefined, fallback: string, imageUrl?: string): string {
  // Upload URLs carry a unique revision, independent of price or text edits.
  const storedRevision = imageUrl?.split("?")[1];
  const uploadMatches = Boolean(version && storedRevision && new URLSearchParams(storedRevision).get("v") === version);
  const revision = updatedAt?.getTime();
  return uploadMatches || (Number.isFinite(revision) && version === String(revision))
    ? "public, max-age=31536000, s-maxage=31536000, immutable"
    : fallback;
}

export interface CachedLegacyImage {
  bytes: Uint8Array;
  contentType: string;
  updatedAt?: Date;
  imageUrl?: string;
  version: string | null;
  cachedAt: number;
}

const MAX_CACHE_ENTRIES = 200;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const UNVERSIONED_CACHE_TTL_MS = 60_000;
const imageMemoryCache = new Map<string, CachedLegacyImage>();
const pendingFetches = new Map<string, Promise<unknown>>();
let cachedBytes = 0;

export function getCachedLegacyImage(key: string, version: string | null = null): CachedLegacyImage | null {
  const item = imageMemoryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.cachedAt > (item.version ? CACHE_TTL_MS : UNVERSIONED_CACHE_TTL_MS)) {
    invalidateLegacyImage(key);
    return null;
  }
  // Another server instance may have handled the upload and its invalidation.
  if (item.version !== version) return null;
  imageMemoryCache.delete(key);
  imageMemoryCache.set(key, item);
  return item;
}

export function setCachedLegacyImage(key: string, data: { bytes: Uint8Array; contentType: string; updatedAt?: Date; imageUrl?: string }, version: string | null = null) {
  invalidateLegacyImage(key);
  if (data.bytes.byteLength > MAX_CACHE_BYTES) return;
  while (imageMemoryCache.size >= MAX_CACHE_ENTRIES || cachedBytes + data.bytes.byteLength > MAX_CACHE_BYTES) {
    const oldestKey = imageMemoryCache.keys().next().value;
    if (!oldestKey) break;
    invalidateLegacyImage(oldestKey);
  }
  imageMemoryCache.set(key, { ...data, version, cachedAt: Date.now() });
  cachedBytes += data.bytes.byteLength;
}

export function invalidateLegacyImage(key: string) {
  const existing = imageMemoryCache.get(key);
  if (existing) cachedBytes -= existing.bytes.byteLength;
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
