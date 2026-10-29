import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import {
  generateVngZz2Qr,
  generateVngZz2SandboxQr,
  isVngZz2Configured,
  VngZz2ConfigError,
} from "@/lib/services/vngzzPayWayService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      ["orderNumber", "gameSlug", "supplier", "supplierProductCode", "playerId", "serverId", "playerName"].some(
        (key) => body[key] !== undefined && (typeof body[key] !== "string" || body[key].length > 256)
      ) || (body.supplier !== undefined && !["webbuilder", "vizo", "g2bulk", "vngzz2"].includes(body.supplier))
    ) {
      return NextResponse.json({ success: false, error: "Invalid checkout details" }, { status: 400 });
    }

    const {
      orderNumber,
      gameSlug,
      supplier,
      supplierProductCode,
      expectedPrice,
      playerId,
      serverId,
      playerName,
    } = body;

    if (!orderNumber && (!String(playerId || "").trim() || !String(supplierProductCode || "").trim())) {
      return NextResponse.json(
        { success: false, error: "Player ID and package selection are required" },
        { status: 400 }
      );
    }

    await connectDB();

    let targetOrder = null;

    if (orderNumber) {
      targetOrder = await Order.findOne({ orderNumber: String(orderNumber).trim() });
      if (!targetOrder) {
        return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
      }

      const currentPayStatus = String(targetOrder.paymentStatus).toUpperCase();
      if (currentPayStatus === "PAID") {
        return NextResponse.json({ success: false, error: "This order has already been paid" }, { status: 400 });
      }

      if (targetOrder.supplier === "vngzz2") {
        const savedGame = await Game.findOne({ supplier: "vngzz2", isActive: true, $or: [{ slug: targetOrder.gameSlug }, { supplierGameCode: targetOrder.gameSlug }] }).lean();
        if (!savedGame || savedGame.checkoutSupported === false) return NextResponse.json({ success: false, error: "This game is unavailable for checkout." }, { status: 400 });
      }

      // Authoritative Price Verification from MongoDB GamePackage
      const pkg = await GamePackage.findOne({
        supplier: targetOrder.supplier || "webbuilder",
        supplierProductCode: targetOrder.supplierProductCode,
        $or: [{ gameSlug: targetOrder.gameSlug }, { gameCode: targetOrder.gameSlug }],
      }).lean();

      if (
        !pkg ||
        pkg.isActive === false || pkg.supplierAvailable === false ||
        typeof pkg.sellingPrice !== "number" ||
        !Number.isFinite(pkg.sellingPrice) ||
        pkg.sellingPrice <= 0
      ) {
        return NextResponse.json(
          { success: false, error: "The selected package is unavailable or pending price configuration." },
          { status: 400 }
        );
      }

      if (targetOrder.amount !== pkg.sellingPrice) {
        targetOrder.amount = pkg.sellingPrice;
        targetOrder.buyingPrice = pkg.buyingPrice || 0;
        targetOrder.profit = pkg.sellingPrice - (pkg.buyingPrice || 0);
        await targetOrder.save();
      }
    } else {
      const cleanPlayerId = String(playerId || "").trim();
      const cleanProductCode = String(supplierProductCode || "").trim();
      const cleanGameSlug = String(gameSlug || "freefire_khsgmy").trim();
      const cleanSupplier = (supplier || "webbuilder") as "webbuilder" | "vizo" | "g2bulk" | "vngzz2";

      if (!cleanPlayerId) {
        return NextResponse.json({ success: false, error: "Player ID is required" }, { status: 400 });
      }

      if (!cleanProductCode) {
        return NextResponse.json({ success: false, error: "Game package selection is required" }, { status: 400 });
      }

      const game = await Game.findOne({
        supplier: cleanSupplier,
        $or: [{ slug: cleanGameSlug }, { supplierGameCode: cleanGameSlug }],
        isActive: true,
      }).lean();

      if (!game) {
        return NextResponse.json({ success: false, error: "The selected game is unavailable." }, { status: 400 });
      }

      if (game.checkoutSupported === false) return NextResponse.json({ success: false, error: "This game requires additional account details. Please contact support." }, { status: 400 });

      if (game?.requiresServer && !String(serverId || "").trim()) {
        return NextResponse.json(
          { success: false, error: `Server ID is required for ${game.name}` },
          { status: 400 }
        );
      }

      // Authoritative Price Retrieval from MongoDB GamePackage
      const pkg = await GamePackage.findOne({
        supplier: cleanSupplier,
        supplierProductCode: cleanProductCode,
        $or: [{ gameSlug: cleanGameSlug }, { gameCode: cleanGameSlug }],
      }).lean();

      if (
        !pkg ||
        typeof pkg.sellingPrice !== "number" ||
        !Number.isFinite(pkg.sellingPrice) ||
        pkg.sellingPrice <= 0 ||
        pkg.isActive === false || pkg.supplierAvailable === false
      ) {
        return NextResponse.json(
          { success: false, error: "The selected package is unavailable or pending price configuration." },
          { status: 400 }
        );
      }

      if (
        expectedPrice !== undefined &&
        (typeof expectedPrice !== "number" ||
          !Number.isFinite(expectedPrice) ||
          Math.round(expectedPrice * 100) !== Math.round(pkg.sellingPrice * 100))
      ) {
        return NextResponse.json(
          { success: false, error: "The package price has changed. Please refresh and select it again." },
          { status: 409 }
        );
      }

      const generatedOrderNumber = `ORD-${Date.now().toString().slice(-6)}-${crypto
        .randomBytes(2)
        .toString("hex")
        .toUpperCase()}`;

      targetOrder = await Order.create({
        orderNumber: generatedOrderNumber,
        gameSlug: cleanGameSlug,
        gameName: game?.name || "Game Top-Up",
        supplier: cleanSupplier,
        packageId: String(pkg._id),
        packageName: pkg.name,
        supplierProductCode: pkg.supplierProductCode,
        playerId: cleanPlayerId,
        serverId: serverId ? String(serverId).trim() : undefined,
        playerName: playerName ? String(playerName).trim() : undefined,
        amount: pkg.sellingPrice,
        buyingPrice: pkg.buyingPrice || 0,
        profit: pkg.sellingPrice - (pkg.buyingPrice || 0),
        currency: "USD",
        paymentMethod: "aba_payway_v2",
        paymentGateway: "aba_payway_v2",
        paymentStatus: "PENDING",
        fulfillmentStatus: "NOT_STARTED",
      });
    }

    // Call VngZz2 Payment API: live if configured, otherwise sandbox simulation
    const isLive = isVngZz2Configured();
    const qrResult = isLive
      ? await generateVngZz2Qr({
          amount: targetOrder.amount,
          currency: "USD",
          orderNumber: targetOrder.orderNumber,
          metadata: {
            gameName: targetOrder.gameName,
            packageName: targetOrder.packageName,
            playerId: targetOrder.playerId,
          },
        })
      : generateVngZz2SandboxQr({
          amount: targetOrder.amount,
          currency: "USD",
          orderNumber: targetOrder.orderNumber,
          metadata: {
            gameName: targetOrder.gameName,
            packageName: targetOrder.packageName,
            playerId: targetOrder.playerId,
          },
        });

    targetOrder.transactionId = qrResult.transactionId;
    targetOrder.paymentMethod = "aba_payway_v2";
    targetOrder.paymentGateway = "aba_payway_v2";
    targetOrder.checkoutUrl = qrResult.payUrl || targetOrder.checkoutUrl;
    targetOrder.paymentStatus = "PENDING";
    await targetOrder.save();

    // Upsert Payment model record
    await Payment.findOneAndUpdate(
      { orderNumber: targetOrder.orderNumber },
      {
        paymentId: `PAY-${targetOrder.orderNumber}`,
        orderNumber: targetOrder.orderNumber,
        gateway: "aba_payway_v2",
        transactionId: qrResult.transactionId,
        amount: targetOrder.amount,
        currency: "USD",
        status: "PENDING",
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      orderNumber: targetOrder.orderNumber,
      transactionId: qrResult.transactionId,
      amount: targetOrder.amount,
      currency: qrResult.currency || "USD",
      state: qrResult.state,
      qrString: qrResult.qrString,
      qrImage: qrResult.qrImage,
      qrPngUrl: qrResult.qrPngUrl,
      payUrl: qrResult.payUrl,
      deepLink: qrResult.deepLink,
      expireInSec: qrResult.expireInSec,
      gateway: "aba_payway_v2",
      isSandbox: !isLive,
    });
  } catch (error: unknown) {
    if (error instanceof VngZz2ConfigError) {
      console.warn("[VngZz2 Create] Configuration note:", error.message);
      return NextResponse.json(
        { success: false, error: "ABA PayWay V2 is unconfigured. Please select AnajakPay or contact support." },
        { status: 400 }
      );
    }

    console.error("[VngZz2 Create] Error generating payment:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to initialize ABA PayWay V2 checkout. Please try again.",
      },
      { status: 500 }
    );
  }
}
