import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { SmmService } from "@/models/SmmService";
import {
  generateVngZz2Qr,
  generateVngZz2SandboxQr,
  isVngZz2Configured,
} from "@/lib/services/vngzzPayWayService";
import { calculateSmmCustomerRate, calculateSmmOrderAmount } from "@/lib/services/smmPricing";
import { getKhmerSmmCatalog, VngzzKhmerSmmError } from "@/lib/suppliers/vngzz2SmmKhmer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid order request" }, { status: 400 });
    }

    const { serviceId, link, quantity } = body;
    const catalog = body.catalog === undefined ? "standard" : body.catalog;
    if (catalog !== "standard" && catalog !== "khmer") {
      return NextResponse.json({ success: false, error: "Unsupported SMM catalog" }, { status: 400 });
    }
    const isKhmerCatalog = catalog === "khmer";
    const paymentMethod = body.paymentMethod ?? "aba_payway_v2";

    const cleanServiceId = typeof serviceId === "string" || typeof serviceId === "number"
      ? String(serviceId).trim()
      : "";
    const cleanLink = String(link || "").trim();
    const qtyText = typeof quantity === "string" ? quantity.trim() : "";
    const qty = typeof quantity === "number"
      ? quantity
      : /^\d+$/.test(qtyText)
        ? Number(qtyText)
        : Number.NaN;

    if (!cleanServiceId) {
      return NextResponse.json({ success: false, error: "Please select a service" }, { status: 400 });
    }

    let targetUrl: URL | null = null;
    try {
      targetUrl = new URL(cleanLink);
    } catch {
      // The link field is checked below so callers receive one clear validation error.
    }
    if (!targetUrl || !["http:", "https:"].includes(targetUrl.protocol) || !targetUrl.hostname || cleanLink.length > 2048) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid URL link (e.g. https://...)" },
        { status: 400 }
      );
    }
    if (isKhmerCatalog && targetUrl.hostname.toLowerCase() !== "tiktok.com" && !targetUrl.hostname.toLowerCase().endsWith(".tiktok.com")) {
      return NextResponse.json({ success: false, error: "Please use a public TikTok link for TikTok Khmer packages." }, { status: 400 });
    }

    if (!Number.isSafeInteger(qty) || qty <= 0) {
      return NextResponse.json({ success: false, error: "Please enter a whole number quantity" }, { status: 400 });
    }

    if (cleanServiceId.length > 128) {
      return NextResponse.json({ success: false, error: "Selected service is invalid" }, { status: 400 });
    }

    await connectDB();

    let service: { service: string; name: string; category: string; rate: number; min: number; max: number } | null = null;

    if (isKhmerCatalog) {
      const khmerCatalog = await getKhmerSmmCatalog();
      const product = khmerCatalog.products.find((candidate) => candidate.id === cleanServiceId);
      if (!product) {
        return NextResponse.json({ success: false, error: "Selected TikTok Khmer package is unavailable" }, { status: 400 });
      }
      if (qty !== product.quantity) {
        return NextResponse.json({ success: false, error: "Selected TikTok Khmer package quantity has changed. Refresh and try again." }, { status: 409 });
      }
      service = {
        service: product.id,
        name: product.name,
        category: "TikTok Khmer",
        rate: product.price,
        min: product.quantity,
        max: product.quantity,
      };
    } else {
      // The active, reviewed MongoDB catalogue is authoritative for standard SMM.
      // Supplier IDs remain separate from Mongo IDs.
      const matchingServices = await SmmService.find({
        supplier: "vngzz2",
        supplierServiceId: cleanServiceId,
        isActive: true,
        supplierAvailable: true,
        requiresReview: false,
        reviewFlags: { $size: 0 },
      }).select("+rate").limit(2).lean();
      const supplierIdMatches = await SmmService.countDocuments({ supplier: "vngzz2", supplierServiceId: cleanServiceId });
      const storedService = matchingServices.length === 1 && supplierIdMatches === 1 ? matchingServices[0] : null;
      const duplicateNameCount = storedService
        ? await SmmService.countDocuments({ supplier: "vngzz2", fingerprint: storedService.fingerprint })
        : 0;
      service = storedService && storedService.fingerprint && duplicateNameCount === 1 &&
        ["tiktok", "telegram", "facebook", "instagram", "youtube", "other"].includes(storedService.platform) &&
        ["followers", "likes", "views", "comments", "shares", "other"].includes(storedService.serviceType) &&
        storedService.category && storedService.category.trim() && storedService.name && storedService.name.trim() &&
        typeof storedService.rate === "number" && storedService.rate > 0 && storedService.rate <= Number.MAX_SAFE_INTEGER &&
        typeof storedService.min === "number" && Number.isSafeInteger(storedService.min) &&
        typeof storedService.max === "number" && Number.isSafeInteger(storedService.max) && storedService.min > 0 && storedService.max >= storedService.min
        ? {
            service: storedService.supplierServiceId,
            name: storedService.name,
            category: storedService.category,
            rate: storedService.rate,
            min: storedService.min || 0,
            max: storedService.max || 0,
          }
        : null;
    }

    if (!service) {
      return NextResponse.json({ success: false, error: "Selected service is unavailable" }, { status: 400 });
    }

    if (qty < service.min) {
      return NextResponse.json(
        { success: false, error: `Minimum order quantity is ${service.min.toLocaleString()}` },
        { status: 400 }
      );
    }

    if (qty > service.max) {
      return NextResponse.json(
        { success: false, error: `Maximum order quantity is ${service.max.toLocaleString()}` },
        { status: 400 }
      );
    }

    // Match the public catalog's customer rate and ignore any browser-supplied price.
    const finalAmount = isKhmerCatalog
      ? calculateSmmCustomerRate(service.rate)
      : calculateSmmOrderAmount(calculateSmmCustomerRate(service.rate), qty);
    const buyingCost = isKhmerCatalog
      ? service.rate
      : Math.round(((service.rate * qty) / 1000) * 100) / 100;

    const orderNumber = `ORD-SMM${isKhmerCatalog ? "-KHMER" : ""}-${Date.now().toString().slice(-6)}-${crypto
      .randomBytes(2)
      .toString("hex")
      .toUpperCase()}`;

    const transactionId = `TXN-${orderNumber}-${crypto
      .randomBytes(2)
      .toString("hex")
      .toUpperCase()}`;

    // 2. Create Order in MongoDB
    const newOrder = await Order.create({
      orderNumber,
      transactionId,
      gameSlug: "smm-service",
      gameName: service.category || "Social Media Service",
      supplier: "vngzz2",
      serviceType: "smm",
      packageId: isKhmerCatalog ? "smm-khmer" : cleanServiceId,
      packageName: isKhmerCatalog ? service.name : `${service.name} (${qty.toLocaleString()} units)`,
      supplierProductCode: cleanServiceId,
      playerId: cleanLink,
      targetLink: cleanLink,
      quantity: qty,
      amount: finalAmount,
      buyingPrice: buyingCost,
      profit: finalAmount - buyingCost,
      currency: "USD",
      paymentMethod: "aba_payway_v2",
      paymentGateway: "aba_payway_v2",
      paymentStatus: "PENDING",
      fulfillmentStatus: "NOT_STARTED",
    });

    // 3. Generate Payment (ABA PayWay V2)
    const isLive = isVngZz2Configured();
    const qrResult = isLive
      ? await generateVngZz2Qr({
          amount: finalAmount,
          currency: "USD",
          orderNumber,
          metadata: {
            serviceName: service.name,
            category: service.category,
            quantity: qty,
            targetLink: cleanLink,
          },
        })
      : generateVngZz2SandboxQr({
          amount: finalAmount,
          currency: "USD",
          orderNumber,
          metadata: {
            serviceName: service.name,
            category: service.category,
            quantity: qty,
            targetLink: cleanLink,
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
        amount: finalAmount,
        currency: "USD",
        status: "PENDING",
      },
      { upsert: true }
    );

    const qrData = {
      transactionId: qrResult.transactionId,
      qrString: qrResult.qrString,
      qrImage: qrResult.qrImage,
      qrPngUrl: qrResult.qrPngUrl,
      payUrl: qrResult.payUrl,
      deepLink: qrResult.deepLink,
      expireInSec: qrResult.expireInSec,
      isSandbox: !isLive,
    };

    return NextResponse.json({
      success: true,
      orderNumber,
      transactionId: newOrder.transactionId,
      amount: finalAmount,
      currency: "USD",
      paymentStatus: String(newOrder.paymentStatus).toUpperCase(),
      qrData,
      serviceName: service.name,
      quantity: qty,
      catalog: isKhmerCatalog ? "khmer" : "standard",
    });
  } catch (error: unknown) {
    console.error("[SMM Order Creation Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create SMM order",
      },
      { status: error instanceof VngzzKhmerSmmError ? error.status : 500 }
    );
  }
}
