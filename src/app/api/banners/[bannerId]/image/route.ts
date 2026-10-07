import { NextRequest } from "next/server";
import { Banner } from "@/models/Banner";
import { catalogueQuery } from "@/lib/services/catalogueTiming";
import { legacyImageBytes, legacyImageCacheControl } from "@/lib/services/legacyImageService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> }
) {
  const { bannerId } = await params;
  if (!/^[a-f\d]{24}$/i.test(bannerId)) {
    return new Response("Image not found", { status: 404 });
  }

  try {
    const banner = await catalogueQuery("banner-image", async () => Banner.findById(bannerId)
      .select({ imageData: 1, imageContentType: 1, updatedAt: 1, _id: 0 }).maxTimeMS(4000).lean());
    const bytes = legacyImageBytes(banner?.imageData);
    if (!bytes || !banner?.imageContentType) {
      return new Response("Image not found", { status: 404 });
    }

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": banner.imageContentType,
        "Content-Length": String(bytes.length),
        "Cache-Control": legacyImageCacheControl(req.nextUrl.searchParams.get("v"), banner.updatedAt,
          "public, max-age=60, stale-while-revalidate=300"),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to load banner image:", error);
    return new Response("Image temporarily unavailable", { status: 503 });
  }
}
