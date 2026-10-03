import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { checkVizoPlayer } from "@/lib/suppliers/vizo";
import { checkG2BulkPlayer } from "@/lib/suppliers/g2bulk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { supplier, code, slug, userId, serverId } = body;

    const gameIdentifier = (code || slug || "").trim().toLowerCase();

    if (!gameIdentifier || !userId) {
      return NextResponse.json(
        { success: false, message: "Missing required fields (game identifier and userId)" },
        { status: 400 }
      );
    }

    // Free Fire must use Vizo exclusively
    const isFreeFire =
      gameIdentifier.includes("freefire") ||
      gameIdentifier === "ff" ||
      gameIdentifier === "free-fire";

    let targetSupplier = supplier ? supplier.trim().toLowerCase() : (isFreeFire ? "vizo" : "g2bulk");
    if (isFreeFire) {
      targetSupplier = "vizo";
    }

    await connectDB();
    const game = await Game.findOne({
      $or: [
        { supplier: targetSupplier, supplierGameCode: gameIdentifier },
        { supplier: targetSupplier, slug: gameIdentifier },
        { supplierGameCode: gameIdentifier },
        { slug: gameIdentifier },
      ],
    }).lean();

    const targetCode = game?.supplierGameCode || (isFreeFire ? "freefire_global" : gameIdentifier);

    if (game?.requiresServer && !serverId) {
      return NextResponse.json(
        { success: false, message: `Please enter your ${game.serverLabel || "Server ID"}` },
        { status: 400 }
      );
    }

    // Route to appropriate supplier API
    if (targetSupplier === "vizo") {
      // Free Fire via Vizo API
      const result = await checkVizoPlayer(targetCode, userId.trim(), serverId?.trim());
      return NextResponse.json(result);
    } else {
      // PUBG Mobile / MLBB via G2Bulk API
      const result = await checkG2BulkPlayer(targetCode, userId.trim(), serverId?.trim());
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error("Player verify error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Verification service error",
      },
      { status: 500 }
    );
  }
}
