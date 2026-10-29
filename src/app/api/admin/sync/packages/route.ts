import { invalidateCatalogueCache } from "@/lib/services/cacheService";
import { NextRequest, NextResponse } from "next/server";
import { syncPackagesFromSuppliers } from "@/lib/services/syncService";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    let body: { gameCode?: string; supplier?: "webbuilder" | "vngzz2" | "g2bulk"; onlyActiveGames?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // Default empty body if no payload provided
    }

    if (!body || typeof body !== "object" || Array.isArray(body) ||
      (body.supplier !== undefined && !["webbuilder", "vngzz2", "g2bulk"].includes(body.supplier)) ||
      (body.gameCode !== undefined && (typeof body.gameCode !== "string" || body.gameCode.length > 200)) ||
      (body.onlyActiveGames !== undefined && typeof body.onlyActiveGames !== "boolean")) {
      return NextResponse.json({ success: false, error: "Invalid sync options." }, { status: 400 });
    }
    const stats = await syncPackagesFromSuppliers({
      gameCode: body.gameCode,
      supplier: body.supplier,
      onlyActiveGames: body.onlyActiveGames ?? true,
    });

    return NextResponse.json({
      success: stats?.totalFailed === 0,
      error: stats?.totalFailed ? "Some packages failed to synchronize. Review the supplier errors and retry." : undefined,
      message: "Packages synchronized from supplier APIs",
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
