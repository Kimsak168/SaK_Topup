import { NextRequest } from "next/server";
import { GameEvent } from "@/models/GameEvent";
import { catalogueQuery } from "@/lib/services/catalogueTiming";
import {
  fetchWithDeduplication,
  getCachedLegacyImage,
  invalidateLegacyImage,
  legacyImageBytes,
  legacyImageCacheControl,
  setCachedLegacyImage,
} from "@/lib/services/legacyImageService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  if (!/^[a-f\d]{24}$/i.test(eventId)) return new Response("Image not found", { status: 404 });

  const version = req.nextUrl.searchParams.get("v");
  const cacheKey = `game-event:${eventId}`;
  const cached = getCachedLegacyImage(cacheKey);
  if (cached) {
    return new Response(new Uint8Array(cached.bytes), {
      headers: {
        "Content-Type": cached.contentType,
        "Content-Length": String(cached.bytes.length),
        "Cache-Control": legacyImageCacheControl(version, cached.updatedAt, "public, max-age=86400, stale-while-revalidate=604800"),
        "X-Content-Type-Options": "nosniff",
        "X-Image-Cache": "HIT",
      },
    });
  }

  try {
    const data = await fetchWithDeduplication(cacheKey, async () => {
      const event = await catalogueQuery("game-event-image", async () =>
        GameEvent.findById(eventId)
          .select({ imageData: 1, imageContentType: 1, updatedAt: 1, _id: 0 })
          .maxTimeMS(4000)
          .lean()
      );
      const bytes = legacyImageBytes(event?.imageData);
      if (!bytes || !event?.imageContentType) return null;
      return { bytes, contentType: event.imageContentType, updatedAt: event.updatedAt };
    });

    if (!data) return new Response("Image not found", { status: 404 });
    setCachedLegacyImage(cacheKey, data);
    return new Response(new Uint8Array(data.bytes), {
      headers: {
        "Content-Type": data.contentType,
        "Content-Length": String(data.bytes.length),
        "Cache-Control": legacyImageCacheControl(version, data.updatedAt, "public, max-age=86400, stale-while-revalidate=604800"),
        "X-Content-Type-Options": "nosniff",
        "X-Image-Cache": "MISS",
      },
    });
  } catch {
    invalidateLegacyImage(cacheKey);
    return new Response("Image temporarily unavailable", { status: 503 });
  }
}
