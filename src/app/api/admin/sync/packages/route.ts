import { invalidateCatalogueCache } from "@/lib/services/cacheService";
import { NextRequest, NextResponse } from "next/server";
import { syncPackagesFromSuppliers } from "@/lib/services/syncService";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    let body: { gameCode?: string; supplier?: "vizo" | "g2bulk"; onlyActiveGames?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // Default empty body if no payload provided
    }

    const stats = await syncPackagesFromSuppliers({
      gameCode: body.gameCode,
      supplier: body.supplier,
      onlyActiveGames: body.onlyActiveGames ?? true,
    });

    return NextResponse.json({
      success: true,
      message: "Packages synchronized successfully from real supplier APIs",
      stats,
    });
  } catch (error: unknown) {
    console.error("Package sync API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync packages",
      },
      { status: 500 }
    );
  } finally {
    invalidateCatalogueCache();
  }
}
