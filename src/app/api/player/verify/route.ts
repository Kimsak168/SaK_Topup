import { NextRequest, NextResponse } from "next/server";
import { getVerificationGame } from "@/lib/services/verificationGameService";
import { checkWebBuilderPlayer } from "@/lib/suppliers/webbuilder";
import { GamePackage } from "@/models/GamePackage";
import { connectDB } from "@/lib/mongodb";

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

  const timed = async <T>(name: string, operation: () => Promise<T>): Promise<T> => {
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

  const signal = () => AbortSignal.any([req.signal, AbortSignal.timeout(8000)]);

  try {
    const body = await req.json().catch(() => ({}));
    const { code, slug, userId, serverId } = body;

    const gameIdentifier = String(code || slug || "").trim().toLowerCase();
    const cleanUserId = String(userId || "").trim();
    const cleanServerId = serverId ? String(serverId).trim() : undefined;

    if (!gameIdentifier || !cleanUserId) {
      return respond(
        { success: false, message: "Please enter your Player ID to verify" },
        { status: 400 }
      );
    }

    let game = null;
    try {
      game = await timed("metadata", () => getVerificationGame("webbuilder", gameIdentifier));
    } catch (dbErr) {
      console.warn("[PlayerVerify] DB query fallback:", dbErr instanceof Error ? dbErr.message : String(dbErr));
    }

    if (game?.requiresServer && !cleanServerId) {
      return respond(
        { success: false, message: `Please enter your ${game.serverLabel || "Zone / Server ID"}` },
        { status: 400 }
      );
    }

    // Resolve product ID for WebBuilder player check
    let productId = String(body.productId || body.product_id || body.packageId || "").trim();
    if (!productId || productId.startsWith("sample") || productId.length < 8) {
      productId = DEFAULT_PRODUCT_IDS[gameIdentifier] || "";
      if (!productId) {
        // Look up first available package in DB
        try {
          await connectDB();
          const pkg = await GamePackage.findOne({
            supplier: "webbuilder",
            $or: [{ gameSlug: gameIdentifier }, { gameCode: gameIdentifier }],
            isActive: true,
          }).select("supplierProductCode").lean();
          if (pkg?.supplierProductCode) {
            productId = pkg.supplierProductCode;
          }
        } catch {
          // fallback
        }
      }
    }

    if (!productId) {
      // Default to Free Fire package if unknown
      productId = DEFAULT_PRODUCT_IDS.freefire;
    }

    const wbRes = await timed("webbuilder", () =>
      checkWebBuilderPlayer(productId, cleanUserId, cleanServerId, signal())
    );
    const duration = Date.now() - startTime;

    if (wbRes.success) {
      console.log(
        `[PlayerVerify] ${gameIdentifier} via WebBuilder: SUCCESS (IGN: ${wbRes.username}) in ${duration}ms [UID: ${maskId(cleanUserId)}]`
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
        `[PlayerVerify] ${gameIdentifier} via WebBuilder: INVALID_ID in ${duration}ms [UID: ${maskId(cleanUserId)}]`
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

    return respond({
      success: false,
      isUnavailable: true,
      message: wbRes.message || "Verification service is temporarily busy. You can still proceed.",
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
