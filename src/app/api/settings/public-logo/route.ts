import { NextResponse } from "next/server";
import { getPublicLogoUrl } from "@/lib/services/publicSettingsService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const logoUrl = await getPublicLogoUrl();
    return NextResponse.json(
      { logoUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[Public Logo API] Failed to load the saved logo setting:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      { success: false, error: "Public branding is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
