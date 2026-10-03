import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import {
  generateAnajakPayV2Checkout,
  AnajakPayConfigError,
} from "@/lib/services/anajakPayService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const {
      orderNumber,
      gameSlug,
      supplier,
      supplierProductCode,
      playerId,
      serverId,
      playerName,
    } = body;

    let targetOrder = null;

    if (orderNumber) {
      // Validate existing local order
      targetOrder = await Order.findOne({ orderNumber: String(orderNumber).trim() });
      if (!targetOrder) {
        return NextResponse.json(
          { success: false, error: "Order not found" },
          { status: 404 }
        );
      }

      // Check payment status - prevent duplicate payment creation for paid orders
      const currentPayStatus = String(targetOrder.paymentStatus).toUpperCase();
      if (currentPayStatus === "PAID") {
        return NextResponse.json(
          { success: false, error: "This order has already been paid" },
          { status: 400 }
        );
      }

      // Authoritative Price Verification from MongoDB GamePackage
      const pkg = await GamePackage.findOne({
        supplier: targetOrder.supplier,
        supplierProductCode: targetOrder.supplierProductCode,
        $or: [{ gameSlug: targetOrder.gameSlug }, { gameCode: targetOrder.gameSlug }],
      }).lean();

      if (pkg && typeof pkg.sellingPrice === "number" && pkg.sellingPrice > 0) {
        // Enforce authoritative price from database
        if (targetOrder.amount !== pkg.sellingPrice) {
          targetOrder.amount = pkg.sellingPrice;
          targetOrder.buyingPrice = pkg.buyingPrice || 0;
          targetOrder.profit = pkg.sellingPrice - (pkg.buyingPrice || 0);
          await targetOrder.save();
        }
      }
    } else {
      // Create pending order flow directly
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
          { success: false, error: "Game package selection is required" },
          { status: 400 }
        );
      }

      // Validate game and required server ID
      const game = await Game.findOne({
        $or: [
          { slug: cleanGameSlug },
          { supplierGameCode: cleanGameSlug },
        ],
        isActive: true,
      }).lean();

      if (game?.requiresServer && !String(serverId || "").trim()) {
        return NextResponse.json(
          {
            success: false,
            error: `Server ID is required for ${game.name}`,
          },
          { status: 400 }
        );
      }

      // Authoritative Price Retrieval from MongoDB GamePackage
      // NEVER trust frontend prices!
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
            error: "The selected package is unavailable or pending price configuration.",
          },
          { status: 400 }
        );
      }

      const generatedOrderNumber = `ORD-${Date.now().toString().slice(-6)}-${crypto
        .randomBytes(2)
        .toString("hex")
        .toUpperCase()}`;

      const generatedTxnId = `TXN-${generatedOrderNumber}-${crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase()}`;

      targetOrder = await Order.create({
        orderNumber: generatedOrderNumber,
        transactionId: generatedTxnId,
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
        paymentMethod: "khqr",
        paymentStatus: "PENDING",
        fulfillmentStatus: "NOT_STARTED",
      });
    }

    // Ensure unique transaction ID
    if (!targetOrder.transactionId) {
      targetOrder.transactionId = `TXN-${targetOrder.orderNumber}-${crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase()}`;
    }

    // Generate AnajakPay V2 Signed Checkout URL
    const checkoutResult = generateAnajakPayV2Checkout({
      transactionId: targetOrder.transactionId,
      amount: targetOrder.amount,
      orderNumber: targetOrder.orderNumber,
      remark: `SakSuuu ${targetOrder.gameName} Top-Up`,
    });

    targetOrder.checkoutUrl = checkoutResult.checkoutUrl;
    targetOrder.paymentStatus = "PENDING";
    await targetOrder.save();

    // Record / Update Payment model
    await Payment.findOneAndUpdate(
      { orderNumber: targetOrder.orderNumber },
      {
        paymentId: `PAY-${targetOrder.orderNumber}`,
        orderNumber: targetOrder.orderNumber,
        gateway: "anajakpay",
        transactionId: targetOrder.transactionId,
        amount: targetOrder.amount,
        currency: "USD",
        status: "PENDING",
      },
      { upsert: true, new: true }
    );

    // Return ONLY necessary checkout information to frontend
    // Never expose Secret Key or sensitive credentials
    return NextResponse.json({
      success: true,
      orderNumber: targetOrder.orderNumber,
      transactionId: targetOrder.transactionId,
      checkoutUrl: checkoutResult.checkoutUrl,
      amount: targetOrder.amount,
      currency: targetOrder.currency || "USD",
    });
  } catch (error: unknown) {
    if (error instanceof AnajakPayConfigError) {
      console.error("AnajakPay configuration error:", error.message);
      return NextResponse.json(
        {
          success: false,
          error: "Payment service configuration error. Please contact support.",
        },
        { status: 503 }
      );
    }

    console.error("AnajakPay checkout creation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Unable to initialize secure checkout. Please try again.",
      },
      { status: 500 }
    );
  }
}
