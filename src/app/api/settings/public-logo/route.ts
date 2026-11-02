import { NextResponse } from "next/server";
import { getPublicLogoUrl } from "@/lib/services/publicSettingsService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const logoUrl = await getPublicLogoUrl();
    return NextResponse.json(
      { logoUrl: logoUrl || "/images/asura-store-logo.png" },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    console.warn(
      "[Public Logo API] Fallback to default logo:",
      error instanceof Error ? error.message : "Database unavailable",
    );
    return NextResponse.json(
      { logoUrl: "/images/asura-store-logo.png" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
