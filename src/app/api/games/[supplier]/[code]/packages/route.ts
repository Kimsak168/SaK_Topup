import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { GamePackage } from "@/models/GamePackage";
import { getVizoPackages, VizoError } from "@/lib/suppliers/vizo";
import { getG2BulkCatalogue, G2BulkError } from "@/lib/suppliers/g2bulk";

export const dynamic = "force-dynamic";

export interface NormalizedPackageResponse {
  id: string; // Original supplier identifier
  supplierProductCode: string; // Original supplier product code / catalogue ID
  name: string;
  diamondsOrPoints?: string;
  sellingPrice: number | null; // Customer selling price from MongoDB, null if not configured
  isAvailable: boolean; // Available only when an admin has configured a customer price
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

    // 4. Load admin-configured selling prices from MongoDB (scoped to this specific game)
    const priceMap = new Map<
      string,
      {
        sellingPrice: number | null;
        isActive: boolean;
        originalPrice: number | null;
        badge: string | null;
        customImage: string | null;
      }
    >();

    try {
      await connectDB();
      const existingConfigs = await GamePackage.find({
        supplier: normalizedSupplier,
        $or: [{ gameCode: rawCode }, { gameSlug: rawCode }],
      }).lean();

      for (const cfg of existingConfigs) {
        // Only consider price configured if it is a positive number
        const hasConfiguredPrice =
          typeof cfg.sellingPrice === "number" && cfg.sellingPrice > 0;

        priceMap.set(cfg.supplierProductCode, {
          sellingPrice: hasConfiguredPrice ? cfg.sellingPrice : null,
          isActive: cfg.isActive !== false,
          originalPrice:
            typeof cfg.originalPrice === "number" && cfg.originalPrice > 0
              ? cfg.originalPrice
              : null,
          badge: cfg.badge || null,
          customImage: cfg.customImage || null,
        });
      }
    } catch (dbError) {
      console.warn("MongoDB connection warning in packages route:", dbError);
      // Proceed gracefully: if DB fails, selling prices will default to null
    }

    // 5. Fetch packages from the respective supplier API
    let normalizedPackages: NormalizedPackageResponse[] = [];

    if (normalizedSupplier === "vizo") {
      // Free Fire via Vizo API
      // Fetch packages using GET /api/v1/catalogue/products/{game_code}
      const vizoProducts = await getVizoPackages(rawCode);

      normalizedPackages = vizoProducts.map((prod) => {
        const configured = priceMap.get(prod.product_code);
        const sellingPrice = configured?.sellingPrice ?? null;
        // Package is available ONLY if customer price is configured and not disabled
        const isAvailable = sellingPrice !== null && (configured?.isActive ?? true);

        return {
          id: prod.product_code,
          supplierProductCode: prod.product_code, // Preserved for future order creation
          name: prod.name.includes("Diamond") ? prod.name : `${prod.name} Diamonds`,
          diamondsOrPoints: prod.name,
          sellingPrice, // Loaded from MongoDB only, null when unconfigured
          isAvailable,
          currency: "USD",
          originalPrice: configured?.originalPrice ?? null,
          badge: configured?.badge ?? null,
          category: "diamonds",
          group: "diamonds",
          customImage: configured?.customImage || null,
        };
      });
    } else {
      // Other games via G2Bulk API (including canonical 'mlbb')
      // Fetch packages using GET /v1/games/{code}/catalogue
      const g2Items = await getG2BulkCatalogue(rawCode);

      normalizedPackages = g2Items.map((item) => {
        const codeId = String(item.id);
        const configured = priceMap.get(codeId);
        const sellingPrice = configured?.sellingPrice ?? null;
        // Package is available ONLY if customer price is configured and not disabled
        const isAvailable = sellingPrice !== null && (configured?.isActive ?? true);

        // Group diamonds vs special passes/bundles when real catalogue provides distinction
        const isNumeric = /^\d+$/.test(item.name.trim());
        const isSpecial = !isNumeric || /pass|pack|weekly|monthly|twilight|starlight|member/i.test(item.name);
        const group: "diamonds" | "special" = isSpecial ? "special" : "diamonds";

        let diamondsOrPoints = item.name;
        if (rawCode === "mlbb") {
          diamondsOrPoints = isNumeric ? `${item.name} Diamonds` : item.name;
        }

        return {
          id: codeId,
          supplierProductCode: codeId, // Real G2Bulk catalogue ID preserved for future orders
          name: item.name,
          diamondsOrPoints,
          sellingPrice, // Loaded from MongoDB only, null when unconfigured
          isAvailable,
          currency: "USD",
          originalPrice: configured?.originalPrice ?? null,
          badge: configured?.badge ?? null,
          category: group,
          group,
          customImage: configured?.customImage || null,
        };
      });
    }

    const availableCount = normalizedPackages.filter((p) => p.isAvailable).length;

    return NextResponse.json({
      success: true,
      supplier: normalizedSupplier,
      gameCode: rawCode,
      totalPackages: normalizedPackages.length,
      availablePackages: availableCount,
      groups: {
        diamonds: normalizedPackages.filter((p) => p.group === "diamonds"),
        special: normalizedPackages.filter((p) => p.group === "special"),
      },
      packages: normalizedPackages,
    });
  } catch (error: unknown) {
    // 6. Comprehensive error handling without exposing secret keys
    if (error instanceof VizoError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: error.statusCode }
      );
    }

    if (error instanceof G2BulkError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: error.statusCode }
      );
    }

    console.error("Packages API route error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error fetching packages",
      },
      { status: 500 }
    );
  }
}
