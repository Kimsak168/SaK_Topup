import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { GamePackage } from "@/models/GamePackage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const { packageId } = await params;
  if (!/^[a-f\d]{24}$/i.test(packageId)) {
    return new Response("Image not found", { status: 404 });
  }

  try {
    await connectDB();
    const pkg = await GamePackage.findById(packageId).select("+imageData +imageContentType");
    if (!pkg?.imageData || !pkg.imageContentType) {
      return new Response("Image not found", { status: 404 });
    }

    return new Response(new Uint8Array(pkg.imageData), {
      headers: {
        "Content-Type": pkg.imageContentType,
        "Content-Length": String(pkg.imageData.length),
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to load package image:", error);
    return new Response("Image temporarily unavailable", { status: 503 });
  }
}
