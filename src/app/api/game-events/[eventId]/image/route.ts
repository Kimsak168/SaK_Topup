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
  const cached = getCachedLegacyImage(cacheKey, version);
  if (cached) {
    return new Response(new Uint8Array(cached.bytes), {
      headers: {
        "Content-Type": cached.contentType,
        "Content-Length": String(cached.bytes.length),
        "Cache-Control": legacyImageCacheControl(version, cached.updatedAt, "public, max-age=60, s-maxage=60, must-revalidate", cached.imageUrl),
        "X-Content-Type-Options": "nosniff",
        "X-Image-Cache": "HIT",
      },
    });
  }

  try {
    const data = await fetchWithDeduplication(`${cacheKey}:${version || ""}`, async () => {
      const event = await catalogueQuery("game-event-image", async () =>
        GameEvent.findById(eventId)
          .select({ imageData: 1, imageContentType: 1, imageUrl: 1, updatedAt: 1, _id: 0 })
          .maxTimeMS(4000)
          .lean()
      );
      const bytes = legacyImageBytes(event?.imageData);
      if (!bytes || !event?.imageContentType) return null;
      return { bytes, contentType: event.imageContentType, updatedAt: event.updatedAt, imageUrl: event.imageUrl };
    });

    if (!data) return new Response("Image not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    setCachedLegacyImage(cacheKey, data, version);
    return new Response(new Uint8Array(data.bytes), {
      headers: {
        "Content-Type": data.contentType,
        "Content-Length": String(data.bytes.length),
        "Cache-Control": legacyImageCacheControl(version, data.updatedAt, "public, max-age=60, s-maxage=60, must-revalidate", data.imageUrl),
        "X-Content-Type-Options": "nosniff",
        "X-Image-Cache": "MISS",
      },
    });
  } catch {
    invalidateLegacyImage(cacheKey);
    return new Response("Image temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
