import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import {
  DIGITAL_SHOP_FULFILLMENT_AVAILABLE,
  DIGITAL_SHOP_UNAVAILABLE_MESSAGE,
  getDigitalProduct,
} from "@/lib/services/digitalShopService";
import {
  generateVngZz2Qr,
  generateVngZz2SandboxQr,
  isVngZz2Configured,
} from "@/lib/services/vngzzPayWayService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!DIGITAL_SHOP_FULFILLMENT_AVAILABLE) {
      return NextResponse.json(
        { success: false, error: DIGITAL_SHOP_UNAVAILABLE_MESSAGE },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid order request" }, { status: 400 });
    }

    const { productCode, contact } = body;
    const paymentMethod = body.paymentMethod ?? "aba_payway_v2";

    const cleanProductCode = String(productCode || "").trim();
    const cleanContact = String(contact || "").trim();

    if (!cleanProductCode) {
      return NextResponse.json({ success: false, error: "Please select a product" }, { status: 400 });
    }

    if (!cleanContact || cleanContact.length < 3) {
      return NextResponse.json(
        { success: false, error: "Please provide your Telegram username, email, or phone number" },
        { status: 400 }
      );
    }

    if (cleanContact.length > 256) {
      return NextResponse.json(
        { success: false, error: "Contact info must be under 256 characters" },
        { status: 400 }
      );
    }

    const product = await getDigitalProduct(cleanProductCode);
    if (!product || product.price <= 0) {
      return NextResponse.json(
        { success: false, error: "Selected product is currently unavailable" },
        { status: 404 }
      );
    }

    await connectDB();

    const orderNumber = `DS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    const transactionId = `TXN-${orderNumber}`;
    const amountUsd = Number(product.price.toFixed(2));
    const buyingPriceUsd = product.cost_price ? Number(product.cost_price.toFixed(2)) : undefined;

    const newOrder = await Order.create({
      orderNumber,
      transactionId,
      gameSlug: `digital-${product.groupCode}`,
      gameName: product.groupName || "Digital Shop",
      supplier: "vngzz2",
      serviceType: "digital",
      targetLink: cleanContact,
      quantity: 1,
      packageName: product.name,
      supplierProductCode: product.product_code,
      playerId: cleanContact,
      playerName: cleanContact,
      amount: amountUsd,
      buyingPrice: buyingPriceUsd,
      profit: buyingPriceUsd ? Number((amountUsd - buyingPriceUsd).toFixed(2)) : undefined,
      currency: "USD",
      paymentMethod: "aba_payway_v2",
      paymentGateway: "aba_payway_v2",
      paymentStatus: "PENDING",
      fulfillmentStatus: "NOT_STARTED",
      customerContact: cleanContact,
      adminNotes: `Digital Shop delivery to: ${cleanContact}. Stock: ${product.stock || "Digital"}`,
    });

    try {
      const isLive = isVngZz2Configured();
      const qrResult = isLive
        ? await generateVngZz2Qr({
            amount: amountUsd,
            currency: "USD",
            orderNumber,
            metadata: {
              productName: product.name,
              contact: cleanContact,
            },
          })
        : generateVngZz2SandboxQr({
            amount: amountUsd,
            currency: "USD",
            orderNumber,
            metadata: {
              productName: product.name,
              contact: cleanContact,
            },
          });

      newOrder.transactionId = qrResult.transactionId;
      newOrder.checkoutUrl = qrResult.payUrl;
      await newOrder.save();

      await Payment.findOneAndUpdate(
        { orderNumber },
        {
          paymentId: `PAY-${orderNumber}`,
          orderNumber,
          gateway: "aba_payway_v2",
          transactionId: qrResult.transactionId,
          amount: amountUsd,
          currency: "USD",
          status: "PENDING",
        },
        { upsert: true }
      );

      return NextResponse.json({
        success: true,
        orderNumber,
        transactionId: qrResult.transactionId,
        amount: amountUsd,
        currency: "USD",
        paymentStatus: "PENDING",
        qrData: {
          transactionId: qrResult.transactionId,
          qrString: qrResult.qrString,
          qrImage: qrResult.qrImage,
          qrPngUrl: qrResult.qrPngUrl,
          deepLink: qrResult.deepLink,
          payUrl: qrResult.payUrl,
          expireInSec: qrResult.expireInSec,
          isSandbox: !isLive,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate ABA PayWay QR";
      console.error("[DigitalShopOrder] ABA PayWay generation error:", err);
      newOrder.paymentStatus = "FAILED";
      newOrder.errorLog = msg;
      await newOrder.save();
      return NextResponse.json({ success: false, error: msg }, { status: 502 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DigitalShopOrder] Unexpected error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
