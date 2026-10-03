import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Banner } from "@/models/Banner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> }
) {
  const { bannerId } = await params;
  if (!/^[a-f\d]{24}$/i.test(bannerId)) {
    return new Response("Image not found", { status: 404 });
  }

  try {
    await connectDB();
    const banner = await Banner.findById(bannerId).select("+imageData +imageContentType");
    if (!banner?.imageData || !banner.imageContentType) {
      return new Response("Image not found", { status: 404 });
    }

    return new Response(new Uint8Array(banner.imageData), {
      headers: {
        "Content-Type": banner.imageContentType,
        "Content-Length": String(banner.imageData.length),
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to load banner image:", error);
    return new Response("Image temporarily unavailable", { status: 503 });
  }
}
