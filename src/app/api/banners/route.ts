import { getPublicBanners } from "@/lib/services/bannerService";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = performance.now();
  try {
    const banners = await getPublicBanners();
    return Response.json(
      { success: true, count: banners.length, banners },
      { headers: {
        "Cache-Control": "no-store",
        "Server-Timing": `banners;dur=${(performance.now() - start).toFixed(1)}`,
      } }
    );
  } catch (error) {
    console.error("[API /api/banners] Failed to load banners:", error);
    return Response.json(
      { success: false, error: "Promotional banners are temporarily unavailable.", banners: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
