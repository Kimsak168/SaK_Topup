import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { checkG2BulkPlayer, getG2BulkCatalogue, getG2BulkFields } from "@/lib/suppliers/g2bulk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Allow authenticated admin
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { userId, serverId } = body;

    const cleanUserId = String(userId || "").trim();
    const cleanServerId = String(serverId || "").trim();

    if (!cleanUserId || !cleanServerId) {
      return NextResponse.json(
        {
          success: false,
          error: "Both User ID and Zone/Server ID are required to test Mobile Legends validation.",
        },
        { status: 400 }
      );
    }

    // Parallel validation against both G2Bulk products WITHOUT creating orders or spending balance
    const [
      mlbbPlayerResult,
      mlbbGlobalPlayerResult,
      mlbbFields,
      mlbbGlobalFields,
      mlbbCatalogue,
      mlbbGlobalCatalogue,
    ] = await Promise.all([
      checkG2BulkPlayer("mlbb", cleanUserId, cleanServerId),
      checkG2BulkPlayer("mlbb_global", cleanUserId, cleanServerId),
      getG2BulkFields("mlbb"),
      getG2BulkFields("mlbb_global"),
      getG2BulkCatalogue("mlbb").catch(() => []),
      getG2BulkCatalogue("mlbb_global").catch(() => []),
    ]);

    const report = {
      mlbb: {
        productCode: "mlbb",
        name: "Mobile Legends (Standard / International)",
        validation: mlbbPlayerResult,
        regionalNotes: mlbbFields?.info?.notes || "Not available for ID/SG/MY/PH/RU/VN. Supports Cambodia (KH) and other international regions.",
        packageCount: mlbbCatalogue.length,
        samplePackages: mlbbCatalogue.slice(0, 10).map((p) => ({
          id: p.id,
          name: p.name,
          wholesaleCost: p.amount,
        })),
        isRecommendedForCambodia: mlbbPlayerResult.success,
      },
      mlbb_global: {
        productCode: "mlbb_global",
        name: "Mobile Legends Global",
        validation: mlbbGlobalPlayerResult,
        regionalNotes: mlbbGlobalFields?.info?.notes || "Only for Indonesian users",
        packageCount: mlbbGlobalCatalogue.length,
        samplePackages: mlbbGlobalCatalogue.slice(0, 10).map((p) => ({
          id: p.id,
          name: p.name,
          wholesaleCost: p.amount,
        })),
        isRecommendedForCambodia: false,
      },
      testedAccount: {
        userId: cleanUserId,
        serverId: cleanServerId,
      },
      conclusion: mlbbPlayerResult.success
        ? "mlbb (Standard / International) successfully validated your Cambodian account! It is confirmed compatible."
        : mlbbGlobalPlayerResult.success
        ? "mlbb_global validated your account."
        : "Validation failed on both products. Please verify your User ID and Zone ID.",
    };

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    console.error("MLBB test validation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Validation test failed",
      },
      { status: 500 }
    );
  }
}
