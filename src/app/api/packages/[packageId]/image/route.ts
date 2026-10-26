import { NextRequest } from "next/server";
import { GamePackage } from "@/models/GamePackage";
import { catalogueQuery } from "@/lib/services/catalogueTiming";
import {
  legacyImageBytes,
  legacyImageCacheControl,
  getCachedLegacyImage,
  setCachedLegacyImage,
  fetchWithDeduplication,
} from "@/lib/services/legacyImageService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const { packageId } = await params;
  if (!/^[a-f\d]{24}$/i.test(packageId)) {
    return new Response("Image not found", { status: 404 });
  }

  const version = req.nextUrl.searchParams.get("v");
  const cacheKey = `package:${packageId}`;

  // 1. Check in-memory server cache for instant < 1ms response
  const cached = getCachedLegacyImage(cacheKey);
  if (cached) {
    return new Response(new Uint8Array(cached.bytes), {
      headers: {
        "Content-Type": cached.contentType,
        "Content-Length": String(cached.bytes.length),
        "Cache-Control": legacyImageCacheControl(
          version,
          cached.updatedAt,
          "public, max-age=86400, stale-while-revalidate=604800"
        ),
        "X-Content-Type-Options": "nosniff",
        "X-Image-Cache": "HIT",
      },
    });
  }

  try {
    // 2. Deduplicate concurrent requests so only 1 query hits MongoDB per packageId
    const data = await fetchWithDeduplication(cacheKey, async () => {
      const pkg = await catalogueQuery("package-image", async () =>
        GamePackage.findById(packageId)
          .select({ imageData: 1, imageContentType: 1, updatedAt: 1, _id: 0 })
          .maxTimeMS(4000)
          .lean()
      );
      const bytes = legacyImageBytes(pkg?.imageData);
      if (!bytes || !pkg?.imageContentType) return null;
      return {
        bytes,
        contentType: pkg.imageContentType,
        updatedAt: pkg.updatedAt,
      };
    });

    if (!data) {
      return new Response("Image not found", { status: 404 });
    }

    setCachedLegacyImage(cacheKey, data);

    return new Response(new Uint8Array(data.bytes), {
      headers: {
        "Content-Type": data.contentType,
        "Content-Length": String(data.bytes.length),
        "Cache-Control": legacyImageCacheControl(
          version,
          data.updatedAt,
          "public, max-age=86400, stale-while-revalidate=604800"
        ),
        "X-Content-Type-Options": "nosniff",
        "X-Image-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("Unable to load package image:", error);
    return new Response("Image temporarily unavailable", { status: 503 });
  }
}
