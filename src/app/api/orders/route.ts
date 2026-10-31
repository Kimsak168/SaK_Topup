import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { Payment } from "@/models/Payment";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      ["gameSlug", "supplier", "supplierProductCode", "playerId", "serverId", "playerName", "paymentMethod", "orderNumber"].some(
        key => body[key] !== undefined && (typeof body[key] !== "string" || body[key].length > 256)
      ) || (body.supplier !== undefined && !["webbuilder", "g2bulk", "vngzz2"].includes(body.supplier))) {
      return NextResponse.json({ success: false, error: "Invalid order details" }, { status: 400 });
    }
    const {
      gameSlug = "freefire_khsgmy",
      supplierProductCode = "",
      playerId = "",
      serverId = "",
      playerName = "",
      paymentMethod = "aba_payway_v2",
    } = body;

    const cleanPlayerId = String(playerId || "").trim();
    const cleanProductCode = String(supplierProductCode || "").trim();
    const cleanGameSlug = String(gameSlug || "freefire_khsgmy").trim();
    const cleanSupplier = (body.supplier || "webbuilder") as "webbuilder" | "g2bulk" | "vngzz2";

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
      !Number.isFinite(pkg.sellingPrice) ||
      pkg.sellingPrice <= 0 ||
      pkg.isActive === false || pkg.supplierAvailable === false
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
    const orderNumber = `ASURA-${Date.now().toString().slice(-6)}-${crypto
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
      priceSnapshotCents: typeof pkg.priceCents === "number" ? pkg.priceCents : Math.round((pkg.buyingPrice || 0) * 100),
      profit: pkg.sellingPrice - (pkg.buyingPrice || 0),
      currency: "USD",
      paymentMethod,
      paymentStatus: "PENDING" as const,
      fulfillmentStatus: "NOT_STARTED" as const,
    };

    const created = await Order.create(newOrderData);

    // Record initial Payment record
    await Payment.findOneAndUpdate(
      { orderNumber: created.orderNumber },
      {
        paymentId: `PAY-${created.orderNumber}`,
        orderNumber: created.orderNumber,
        gateway: "aba_payway_v2",
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
