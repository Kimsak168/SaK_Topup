import { NextRequest, NextResponse } from "next/server";
import { getNormalizedPackages } from "@/lib/services/gameService";

export const dynamic = "force-dynamic";

export interface NormalizedPackageResponse {
  id: string;
  supplierProductCode: string;
  name: string;
  diamondsOrPoints?: string;
  sellingPrice: number | null;
  isAvailable: boolean;
  currency: string;
  originalPrice: number | null;
  badge: string | null;
  category: "diamonds" | "special" | string;
  group: "diamonds" | "special" | string;
  customImage?: string | null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ supplier: string; code: string }> }
) {
  const start = performance.now();
  try {
    const { supplier, code } = await context.params;

    // 1. Normalize supplier with multi-supplier fallback
    const normalizedSupplier = supplier.trim().toLowerCase();
    if (!["webbuilder", "vizo", "g2bulk", "vngzz2"].includes(normalizedSupplier)) {
      return NextResponse.json({ success: false, error: "Unknown game supplier.", packages: [] }, { status: 404 });
    }

    // 2. Validate game code parameter
    const rawCode = code?.trim();
    if (!rawCode) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing game code parameter.",
        },
        { status: 400 }
      );
    }

    // 4. Fetch packages directly from MongoDB / cache
    // Only uses local database / cache; synchronization is strictly via admin controls
    const packages = await getNormalizedPackages(normalizedSupplier, rawCode);

    return NextResponse.json(
      {
        success: true,
        gameCode: rawCode,
        supplier: normalizedSupplier,
        count: packages.length,
        totalPackages: packages.length,
        availablePackages: packages.filter(p => p.isAvailable).length,
        groups: {
          diamonds: packages.filter(p => p.group === "diamonds"),
          special: packages.filter(p => p.group === "special"),
        },
        packages,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": `catalogue;dur=${(performance.now() - start).toFixed(1)}`,
        },
      }
    );
  } catch (error) {
    console.error("[Packages Route Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Packages temporarily unavailable. Please try again.",
        packages: [],
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
