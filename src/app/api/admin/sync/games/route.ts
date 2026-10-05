import { invalidateCatalogueCache } from "@/lib/services/cacheService";
import { NextRequest, NextResponse } from "next/server";
import { syncGamesFromSuppliers } from "@/lib/services/syncService";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const stats = await syncGamesFromSuppliers();
    return NextResponse.json({
      success: true,
      message: "Games synchronized successfully from real supplier APIs",
      stats,
    });
  } catch (error: unknown) {
    console.error("Game sync API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync games",
      },
      { status: 500 }
    );
  } finally {
    invalidateCatalogueCache();
  }
}
