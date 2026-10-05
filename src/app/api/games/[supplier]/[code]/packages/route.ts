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

    // 1. Validate supplier parameter
    const normalizedSupplier = supplier?.trim().toLowerCase();
    if (!normalizedSupplier || (normalizedSupplier !== "vizo" && normalizedSupplier !== "g2bulk")) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid supplier. Supported suppliers are 'vizo' and 'g2bulk'.",
        },
        { status: 400 }
      );
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

    // 3. Prohibit Free Fire via G2Bulk
    if (
      normalizedSupplier === "g2bulk" &&
      (rawCode.toLowerCase().includes("freefire") || rawCode.toLowerCase() === "ff")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Free Fire is only supported via the Vizo supplier. Please request '/api/games/vizo/freefire_global/packages'.",
        },
        { status: 400 }
      );
    }

    // 4. Fetch packages directly from MongoDB / cache
    // Never synchronizes with Vizo or G2Bulk during public customer requests
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
