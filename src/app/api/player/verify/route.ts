import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { checkVizoPlayer } from "@/lib/suppliers/vizo";
import { checkG2BulkPlayer } from "@/lib/suppliers/g2bulk";

export const dynamic = "force-dynamic";

function maskId(id: string): string {
  if (id.length <= 4) return "***";
  return `${id.slice(0, 3)}***${id.slice(-2)}`;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { supplier, code, slug, userId, serverId } = body;

    const gameIdentifier = String(code || slug || "").trim().toLowerCase();
    const cleanUserId = String(userId || "").trim();
    const cleanServerId = serverId ? String(serverId).trim() : undefined;

    if (!gameIdentifier || !cleanUserId) {
      return NextResponse.json(
        { success: false, message: "Please enter your Player ID to verify" },
        { status: 400 }
      );
    }

    const isFreeFire =
      gameIdentifier.includes("freefire") ||
      gameIdentifier === "ff" ||
      gameIdentifier === "free-fire";

    let targetSupplier = supplier ? String(supplier).trim().toLowerCase() : (isFreeFire ? "vizo" : "g2bulk");
    if (isFreeFire) {
      targetSupplier = "vizo";
    }

    let game = null;
    try {
      await connectDB();
      game = await Game.findOne({
        $or: [
          { supplier: targetSupplier, supplierGameCode: gameIdentifier },
          { supplier: targetSupplier, slug: gameIdentifier },
          { supplierGameCode: gameIdentifier },
          { slug: gameIdentifier },
        ],
      } as any).lean();
    } catch (dbErr) {
      console.warn("[PlayerVerify] DB query fallback:", dbErr instanceof Error ? dbErr.message : String(dbErr));
    }

    if (game?.requiresServer && !cleanServerId) {
      return NextResponse.json(
        { success: false, message: `Please enter your ${game.serverLabel || "Zone / Server ID"}` },
        { status: 400 }
      );
    }

    // Determine normalized supplier game code
    const targetCode = game?.supplierGameCode || (isFreeFire ? "freefire_sgmy" : gameIdentifier);

    // ==========================================
    // 1. FREE FIRE (Primary: Vizo, Fallback: G2Bulk)
    // ==========================================
    if (isFreeFire) {
      // Free Fire on Vizo /player_info/check endpoint requires 'freefire_sgmy'
      const vizoRes = await checkVizoPlayer("freefire_sgmy", cleanUserId, cleanServerId);
      const duration = Date.now() - startTime;

      if (vizoRes.success) {
        console.log(
          `[PlayerVerify] Free Fire via Vizo: SUCCESS (IGN: ${vizoRes.playerName}) in ${duration}ms [UID: ${maskId(cleanUserId)}]`
        );
        return NextResponse.json(vizoRes);
      }

      // If Vizo explicitly confirmed the player ID is invalid, do not false-report
      if (vizoRes.isInvalidId) {
        console.log(
          `[PlayerVerify] Free Fire via Vizo: INVALID_ID in ${duration}ms [UID: ${maskId(cleanUserId)}]`
        );
        return NextResponse.json(vizoRes, { status: 400 });
      }

      // If Vizo encountered an auth/network/timeout issue, try resilient fallback to G2Bulk freefire_sgmy
      console.warn(
        `[PlayerVerify] Free Fire Vizo check was not conclusive (${vizoRes.message}). Attempting G2Bulk fallback...`
      );
      const g2Res = await checkG2BulkPlayer("freefire_sgmy", cleanUserId, cleanServerId);
      const totalDuration = Date.now() - startTime;

      if (g2Res.success) {
        console.log(
          `[PlayerVerify] Free Fire via G2Bulk fallback: SUCCESS (IGN: ${g2Res.playerName}) in ${totalDuration}ms [UID: ${maskId(cleanUserId)}]`
        );
        return NextResponse.json(g2Res);
      }

      if (g2Res.isInvalidId) {
        console.log(
          `[PlayerVerify] Free Fire via G2Bulk fallback: INVALID_ID in ${totalDuration}ms [UID: ${maskId(cleanUserId)}]`
        );
        return NextResponse.json(g2Res, { status: 400 });
      }

      // Both failed due to network / temporary supplier issue
      return NextResponse.json({
        success: false,
        isUnavailable: true,
        message: "Live verification server is temporarily busy. You can still proceed with your Top Up.",
      });
    }

    // ==========================================
    // 2. MOBILE LEGENDS: BANG BANG (MLBB)
    // ==========================================
    if (targetCode === "mlbb" || targetCode === "mobile-legends" || gameIdentifier.includes("mlbb")) {
      // 2a. First try G2Bulk mlbb
      const g2Res = await checkG2BulkPlayer("mlbb", cleanUserId, cleanServerId);
      const duration = Date.now() - startTime;

      if (g2Res.success) {
        console.log(
          `[PlayerVerify] MLBB via G2Bulk: SUCCESS (IGN: ${g2Res.playerName}) in ${duration}ms [UID: ${maskId(cleanUserId)}]`
        );
        return NextResponse.json(g2Res);
      }

      // 2b. If invalid on standard mlbb, also check Indonesian mlbb_global
      if (g2Res.isInvalidId) {
        const g2GlobalRes = await checkG2BulkPlayer("mlbb_global", cleanUserId, cleanServerId);
        if (g2GlobalRes.success) {
          console.log(
            `[PlayerVerify] MLBB via G2Bulk mlbb_global: SUCCESS (IGN: ${g2GlobalRes.playerName}) [UID: ${maskId(cleanUserId)}]`
          );
          return NextResponse.json(g2GlobalRes);
        }
      }

      // 2c. Also try Vizo mlbb as secondary validation
      const vizoRes = await checkVizoPlayer("mlbb", cleanUserId, cleanServerId);
      if (vizoRes.success) {
        console.log(
          `[PlayerVerify] MLBB via Vizo fallback: SUCCESS (IGN: ${vizoRes.playerName}) [UID: ${maskId(cleanUserId)}]`
        );
        return NextResponse.json(vizoRes);
      }

      if (g2Res.isInvalidId) {
        return NextResponse.json(
          {
            success: false,
            isInvalidId: true,
            message: "Player account not found. Please double check your User ID and Zone ID.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json(g2Res);
    }

    // ==========================================
    // 3. PUBG MOBILE & OTHER G2BULK GAMES
    // ==========================================
    const result = await checkG2BulkPlayer(targetCode, cleanUserId, cleanServerId);
    const duration = Date.now() - startTime;

    console.log(
      `[PlayerVerify] Game: ${targetCode} via G2Bulk: ${result.success ? "SUCCESS (" + result.playerName + ")" : result.isInvalidId ? "INVALID" : "UNAVAILABLE"} in ${duration}ms [UID: ${maskId(cleanUserId)}]`
    );

    return NextResponse.json(result, {
      status: result.isInvalidId ? 400 : 200,
    });
  } catch (error) {
    console.error("[PlayerVerify] Error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      {
        success: false,
        isUnavailable: true,
        message: "Verification service temporarily unavailable. You can still proceed if your Player ID is correct.",
      },
      { status: 200 }
    );
  }
}
