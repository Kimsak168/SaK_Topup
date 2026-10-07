import { NextRequest } from "next/server";
import { GamePackage } from "@/models/GamePackage";
import { catalogueQuery } from "@/lib/services/catalogueTiming";
import { legacyImageBytes, legacyImageCacheControl } from "@/lib/services/legacyImageService";

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

  try {
    const pkg = await catalogueQuery("package-image", async () => GamePackage.findById(packageId)
      .select({ imageData: 1, imageContentType: 1, updatedAt: 1, _id: 0 }).maxTimeMS(4000).lean());
    const bytes = legacyImageBytes(pkg?.imageData);
    if (!bytes || !pkg?.imageContentType) {
      return new Response("Image not found", { status: 404 });
    }

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": pkg.imageContentType,
        "Content-Length": String(bytes.length),
        "Cache-Control": legacyImageCacheControl(req.nextUrl.searchParams.get("v"), pkg.updatedAt,
          "public, max-age=3600, stale-while-revalidate=86400"),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to load package image:", error);
    return new Response("Image temporarily unavailable", { status: 503 });
  }
}
