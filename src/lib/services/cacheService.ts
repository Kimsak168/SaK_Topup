import "server-only";
import { unstable_cache, revalidatePath, revalidateTag } from "next/cache";

export const CATALOGUE_TAG = "catalogue";
export const BANNERS_TAG = "banners";
export const SETTINGS_TAG = "public-settings";

// This app uses the documented non-Cache-Components model. The Data Cache is
// shared across Vercel instances; a process-local TTL Map cannot be invalidated
// reliably by an admin request served by a different instance.
export function cachePublicQuery<Args extends unknown[], Result>(
  key: string,
  tag: string,
  query: (...args: Args) => Promise<Result>
): (...args: Args) => Promise<Result> {
  const pending = new Map<string, Promise<Result>>();
  return unstable_cache(
    async (...args: Args) => {
      const argumentKey = JSON.stringify(args);
      const existing = pending.get(argumentKey);
      if (existing) return existing;
      const request = query(...args);
      pending.set(argumentKey, request);
      try {
        return await request;
      } finally {
        pending.delete(argumentKey);
      }
    },
    ["public-v2", key, query.toString()],
    { tags: [tag], revalidate: 300 }
  );
}

export function invalidateCatalogueCache(): void {
  // Route Handlers support immediate expiry; do not serve old prices after edits.
  revalidateTag(CATALOGUE_TAG, { expire: 0 });
  revalidatePath("/");
  revalidatePath("/games");
  revalidatePath("/games/[supplier]/[code]", "page");
}

export function invalidateBannerCache(): void {
  revalidateTag(BANNERS_TAG, { expire: 0 });
  revalidatePath("/");
}

export function invalidatePublicSettingsCache(): void {
  revalidateTag(SETTINGS_TAG, { expire: 0 });
  revalidatePath("/", "layout");
}
