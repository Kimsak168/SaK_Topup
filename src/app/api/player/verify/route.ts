import { NextRequest, NextResponse } from "next/server";
import { getVerificationGame } from "@/lib/services/verificationGameService";
import { checkG2BulkPlayer } from "@/lib/suppliers/g2bulk";
import { checkWebBuilderPlayer } from "@/lib/suppliers/webbuilder";
import { checkVngzzPlayer } from "@/lib/suppliers/vngzz2";

export const dynamic = "force-dynamic";

function maskId(id: string): string {
  if (id.length <= 4) return "***";
  return `${id.slice(0, 3)}***${id.slice(-2)}`;
}

// Default fallback product IDs for live WebBuilder player checks
const DEFAULT_PRODUCT_IDS: Record<string, string> = {
  freefire: "web_product_9c49381bdfe8553e36e8e506",
  freefire_khsgmy: "web_product_9c49381bdfe8553e36e8e506",
  "free-fire-khsgmy": "web_product_9c49381bdfe8553e36e8e506",
  mlbb: "web_product_bdd61202860568f9c8c564bc",
  "mobile-legends": "web_product_bdd61202860568f9c8c564bc",
  hok: "web_product_5d5a074e928d4dbff6bebd6f",
  "honor-of-kings": "web_product_5d5a074e928d4dbff6bebd6f",
  pubgm: "web_product_acb34a831eb344936774bbbf",
  "pubg-mobile": "web_product_acb34a831eb344936774bbbf",
  bloodstrike: "web_product_cc2201edb2aba26f0d9e4771",
  "blood-strike": "web_product_cc2201edb2aba26f0d9e4771",
  magic_chess: "web_product_728d7bb2d3093c3b5510d54b",
  "magic-chess-gogo": "web_product_728d7bb2d3093c3b5510d54b",
  "8ballpool": "web_product_7a23e527167b9178535f6eb7",
  "8-ball-pool": "web_product_7a23e527167b9178535f6eb7",
  telegram: "web_product_48141dd62f817a8f0450b293",
  "telegram-stars": "web_product_48141dd62f817a8f0450b293",
};

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const started = performance.now();
  const spans: { name: string; ms: number }[] = [];

  const timed = async <T,>(name: string, operation: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      spans.push({ name, ms: performance.now() - start });
    }
  };

  const respond = (body: unknown, init?: ResponseInit) => {
    const total = performance.now() - started;
    const app = Math.max(0, total - spans.reduce((sum, span) => sum + span.ms, 0));
    const headers = new Headers(init?.headers);
    headers.set("Cache-Control", "no-store");
    headers.set(
      "Server-Timing",
      [...spans, { name: "app", ms: app }, { name: "total", ms: total }]
        .map((span) => `${span.name};dur=${span.ms.toFixed(1)}`)
        .join(", ")
    );
    return NextResponse.json(body, { ...init, headers });
  };

  let supplierSignal: AbortSignal | undefined;
  const signal = () => {
    supplierSignal ??= AbortSignal.any([req.signal, AbortSignal.timeout(8000)]);
    return AbortSignal.any([supplierSignal, AbortSignal.timeout(5000)]);
  };

  const verifyG2Bulk = (game: string, id: string, server?: string) =>
    timed(game === "mlbb_global" ? "g2bulk_global" : "g2bulk", () => checkG2BulkPlayer(game, id, server, signal()));
  const verifyWebBuilder = (productId: string, id: string, server?: string) =>
    timed("webbuilder", () => checkWebBuilderPlayer(productId, id, server, signal()));

  try {
    const body = await req.json().catch(() => ({}));
    const { supplier, code, slug, userId, serverId } = body;

    const gameIdentifier = String(code || slug || "").trim().toLowerCase();
    const cleanUserId = String(userId || "").trim();
    const cleanServerId = serverId ? String(serverId).trim() : undefined;

    // This provider's published game API has no nickname verification contract.
    // Never verify its regional games against an unrelated supplier/product.
    if (supplier === "vngzz2") {
      if (!gameIdentifier || !cleanUserId) return respond({ success: false, message: "Please enter your Player ID." }, { status: 400 });
      const game = await timed("metadata", () => getVerificationGame("vngzz2", gameIdentifier));
      if (!game || game.supplier !== "vngzz2") return respond({ success: false, message: "Game unavailable." }, { status: 404 });
      if (game.requiresServer && !cleanServerId) return respond({ success: false, message: "Please enter your Server / Zone ID." }, { status: 400 });

      const check = await timed("vngzz2", () =>
        checkVngzzPlayer(game.supplierGameCode || gameIdentifier, cleanUserId, cleanServerId, signal())
      );

      if (check.valid) {
        return respond({
          success: true,
          isValid: true,
          playerName: check.username || "Verified Player",
          message: "Player ID verified successfully",
        });
      }

      return respond({
        success: false,
        isValid: false,
        message: check.message || "Player ID could not be verified. Please check your ID and try again.",
      }, { status: 400 });
    }

    if (!gameIdentifier || !cleanUserId) {
      return respond(
        { success: false, message: "Please enter your Player ID to verify" },
        { status: 400 }
      );
    }

    const isFreeFire =
      gameIdentifier.includes("freefire") ||
      gameIdentifier === "ff" ||
      gameIdentifier === "free-fire" ||
      gameIdentifier.includes("khsgmy");

    const isHonorOfKings =
      gameIdentifier === "hok" ||
      gameIdentifier.includes("honor") ||
      supplier === "webbuilder";

    let targetSupplier = supplier
      ? String(supplier).trim().toLowerCase()
      : isFreeFire
      ? "webbuilder"
      : isHonorOfKings
      ? "webbuilder"
      : "g2bulk";

    if (supplier) {
      targetSupplier = String(supplier).trim().toLowerCase();
    }

    let game = null;
    try {
      game = await timed("metadata", () => getVerificationGame(targetSupplier, gameIdentifier));
    } catch (dbErr) {
      console.warn("[PlayerVerify] DB query fallback:", dbErr instanceof Error ? dbErr.message : String(dbErr));
    }

    if (game?.requiresServer && !cleanServerId) {
      return respond(
        { success: false, message: `Please enter your ${game.serverLabel || "Zone / Server ID"}` },
        { status: 400 }
      );
    }

    if (game?.supplier) {
      targetSupplier = game.supplier;
    }

    // Determine normalized supplier game code
    const targetCode = game?.supplierGameCode || (isFreeFire ? "freefire_khsgmy" : isHonorOfKings ? "hok" : gameIdentifier);

    // ==========================================
    // 0. WEBBUILDER API VERIFICATION (HoK, MLBB, Free Fire)
    // ==========================================
    if (targetSupplier === "webbuilder" || isHonorOfKings || isFreeFire) {
      let productId = String(body.productId || body.product_id || body.packageId || "").trim();
      if (
        !productId ||
        productId === "hok" ||
        productId === "mlbb" ||
        productId === "freefire" ||
        productId.startsWith("sample") ||
        productId.length < 8
      ) {
        if (isFreeFire) {
          productId = DEFAULT_PRODUCT_IDS.freefire;
        } else if (gameIdentifier.includes("mlbb") || gameIdentifier.includes("mobile-legends")) {
          productId = DEFAULT_PRODUCT_IDS.mlbb;
        } else {
          productId = DEFAULT_PRODUCT_IDS[gameIdentifier] || DEFAULT_PRODUCT_IDS.hok;
        }
      }

      const wbRes = await verifyWebBuilder(productId, cleanUserId, cleanServerId);
      const duration = Date.now() - startTime;

      if (wbRes.success) {
        console.log(
          `[PlayerVerify] ${game?.supplierGameCode || gameIdentifier} via WebBuilder: SUCCESS (IGN: ${wbRes.username}, Region: ${wbRes.region || "N/A"}) in ${duration}ms [UID: ${maskId(cleanUserId)}]`
        );
        return respond({
          success: true,
          playerName: wbRes.username,
          username: wbRes.username,
          region: wbRes.region,
          zone_name: wbRes.zone_name,
          message: `Verified: ${wbRes.username}${wbRes.region ? ` (${wbRes.region})` : ""}`,
        });
      }

      if (wbRes.isInvalidId) {
        console.log(
          `[PlayerVerify] ${game?.supplierGameCode || gameIdentifier} via WebBuilder: INVALID_ID in ${duration}ms [UID: ${maskId(cleanUserId)}]`
        );
        return respond(
          {
            success: false,
            isInvalidId: true,
            message: wbRes.message || "Player account not found. Please verify your Player ID and Zone ID.",
          },
          { status: 400 }
        );
      }

      if (isFreeFire && wbRes.isUnavailable) {
        console.warn(
          `[PlayerVerify] WebBuilder Free Fire check was unavailable (${wbRes.message}). Attempting G2Bulk fallback...`
        );
      } else {
        return respond({
          success: false,
          isUnavailable: true,
          message: wbRes.message || "Verification service is temporarily busy. You can still proceed.",
        });
      }
    }

    // ==========================================
    // 1. FREE FIRE (G2Bulk fallback)
    // ==========================================
    if (isFreeFire) {
      const g2Res = await verifyG2Bulk("freefire_sgmy", cleanUserId, cleanServerId);
      const totalDuration = Date.now() - startTime;

      if (g2Res.success) {
        console.log(
          `[PlayerVerify] Free Fire via G2Bulk fallback: SUCCESS (IGN: ${g2Res.playerName}) in ${totalDuration}ms [UID: ${maskId(cleanUserId)}]`
        );
        return respond(g2Res);
      }

      if (g2Res.isInvalidId) {
        console.log(
          `[PlayerVerify] Free Fire via G2Bulk fallback: INVALID_ID in ${totalDuration}ms [UID: ${maskId(cleanUserId)}]`
        );
        return respond(g2Res, { status: 400 });
      }

      // Both failed due to network / temporary supplier issue
      return respond({
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
      const g2Res = await verifyG2Bulk("mlbb", cleanUserId, cleanServerId);
      const duration = Date.now() - startTime;

      if (g2Res.success) {
        console.log(
          `[PlayerVerify] MLBB via G2Bulk: SUCCESS (IGN: ${g2Res.playerName}) in ${duration}ms [UID: ${maskId(cleanUserId)}]`
        );
        return respond(g2Res);
      }

      // 2b. If invalid on standard mlbb, also check Indonesian mlbb_global
      if (g2Res.isInvalidId) {
        const g2GlobalRes = await verifyG2Bulk("mlbb_global", cleanUserId, cleanServerId);
        if (g2GlobalRes.success) {
          console.log(
            `[PlayerVerify] MLBB via G2Bulk mlbb_global: SUCCESS (IGN: ${g2GlobalRes.playerName}) [UID: ${maskId(cleanUserId)}]`
          );
          return respond(g2GlobalRes);
        }
      }

      if (g2Res.isInvalidId) {
        return respond(
          {
            success: false,
            isInvalidId: true,
            message: "Player account not found. Please double check your User ID and Zone ID.",
          },
          { status: 400 }
        );
      }

      return respond(g2Res);
    }

    // ==========================================
    // 3. PUBG MOBILE & OTHER G2BULK GAMES
    // ==========================================
    const result = await verifyG2Bulk(targetCode, cleanUserId, cleanServerId);
    const duration = Date.now() - startTime;

    console.log(
      `[PlayerVerify] Game: ${targetCode} via G2Bulk: ${result.success ? "SUCCESS (" + result.playerName + ")" : result.isInvalidId ? "INVALID" : "UNAVAILABLE"} in ${duration}ms [UID: ${maskId(cleanUserId)}]`
    );

    return respond(result, {
      status: result.isInvalidId ? 400 : 200,
    });
  } catch (error) {
    console.error("[PlayerVerify] Error:", error instanceof Error ? error.message : String(error));
    return respond(
      {
        success: false,
        isUnavailable: true,
        message: "Verification service temporarily unavailable. You can still proceed if your Player ID is correct.",
      },
      { status: 200 }
    );
  }
}
