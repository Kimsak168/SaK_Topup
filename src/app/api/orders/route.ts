import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { Payment } from "@/models/Payment";
import { generateAnajakPayV2Checkout } from "@/lib/services/anajakPayService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      gameSlug = "freefire_global",
      supplier = "vizo",
      supplierProductCode = "",
      playerId = "",
      serverId = "",
      playerName = "",
      paymentMethod = "khqr",
    } = body;

    const cleanPlayerId = String(playerId || "").trim();
    const cleanProductCode = String(supplierProductCode || "").trim();
    const cleanGameSlug = String(gameSlug || "freefire_global").trim();
    const cleanSupplier = (supplier === "g2bulk" ? "g2bulk" : "vizo") as "vizo" | "g2bulk";

    if (!cleanPlayerId) {
      return NextResponse.json(
        { success: false, error: "Player ID is required" },
        { status: 400 }
      );
    }

    if (!cleanProductCode) {
      return NextResponse.json(
        { success: false, error: "Selected package is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // 1. Validate game and server requirement
    const game = await Game.findOne({
      $or: [{ slug: cleanGameSlug }, { supplierGameCode: cleanGameSlug }],
      isActive: true,
    }).lean();

    if (game?.requiresServer && !String(serverId || "").trim()) {
      return NextResponse.json(
        {
          success: false,
          error: `Server / Zone ID is required for ${game.name}`,
        },
        { status: 400 }
      );
    }

    // 2. Retrieve customer selling price from MongoDB.
    // NEVER trust prices submitted by the frontend!
    const pkg = await GamePackage.findOne({
      supplier: cleanSupplier,
      supplierProductCode: cleanProductCode,
      $or: [{ gameSlug: cleanGameSlug }, { gameCode: cleanGameSlug }],
    }).lean();

    if (
      !pkg ||
      typeof pkg.sellingPrice !== "number" ||
      pkg.sellingPrice <= 0 ||
      pkg.isActive === false
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Selected package is unavailable or has not been configured by admin.",
        },
        { status: 400 }
      );
    }

    // 3. Create unique internal transaction ID and order number
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${crypto
      .randomBytes(2)
      .toString("hex")
      .toUpperCase()}`;

    const transactionId = `TXN-${orderNumber}-${crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase()}`;

    // 4. Save order with PENDING paymentStatus and NOT_STARTED fulfillmentStatus
    const newOrderData = {
      orderNumber,
      transactionId,
      gameSlug: cleanGameSlug,
      gameName: game?.name || "Game Top-Up",
      supplier: cleanSupplier,
      packageId: String(pkg._id),
      packageName: pkg.name,
      supplierProductCode: pkg.supplierProductCode,
      playerId: cleanPlayerId,
      serverId: serverId ? String(serverId).trim() : undefined,
      playerName: playerName ? String(playerName).trim() : undefined,
      amount: pkg.sellingPrice, // Authoritative price from MongoDB
      buyingPrice: pkg.buyingPrice || 0,
      profit: pkg.sellingPrice - (pkg.buyingPrice || 0),
      currency: "USD",
      paymentMethod,
      paymentStatus: "PENDING" as const,
      fulfillmentStatus: "NOT_STARTED" as const,
    };

    let checkoutUrl: string | undefined;
    try {
      const checkoutResult = generateAnajakPayV2Checkout({
        transactionId,
        amount: pkg.sellingPrice,
        orderNumber,
        remark: `SakSuuu ${game?.name || "Game"} Top-Up`,
      });
      checkoutUrl = checkoutResult.checkoutUrl;
    } catch (confErr) {
      console.warn("AnajakPay checkout URL generator deferred:", confErr);
    }

    const created = await Order.create({
      ...newOrderData,
      checkoutUrl,
    });

    // Record initial Payment record
    await Payment.findOneAndUpdate(
      { orderNumber: created.orderNumber },
      {
        paymentId: `PAY-${created.orderNumber}`,
        orderNumber: created.orderNumber,
        gateway: "anajakpay",
        transactionId,
        amount: created.amount,
        currency: "USD",
        status: "PENDING",
      },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      orderNumber: created.orderNumber,
      transactionId: created.transactionId,
      checkoutUrl: created.checkoutUrl,
      order: {
        orderNumber: created.orderNumber,
        transactionId: created.transactionId,
        gameName: created.gameName,
        packageName: created.packageName,
        amount: created.amount,
        currency: created.currency,
        playerId: created.playerId,
        serverId: created.serverId,
        paymentStatus: created.paymentStatus,
        fulfillmentStatus: created.fulfillmentStatus,
      },
    });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create order" },
      { status: 500 }
    );
  }
}
