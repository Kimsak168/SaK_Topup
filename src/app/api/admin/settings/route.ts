import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Setting } from "@/models/Setting";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS = {
  key: "general",
  siteName: "SakSuuu Game Top-Up",
  siteTagline: "Official Direct Game Recharge & 24/7 Fast Delivery",
  logoUrl: "",
  telegramSupport: "https://t.me/saksuuu_support",
  whatsappSupport: "",
  defaultMarginPercent: 10,
  currencyRateKHR: 4100,
  maintenanceMode: false,
  announcement:
    "Welcome to SakSuuu Top-Up! Direct wholesale supplier pricing for Free Fire, PUBG Mobile & Mobile Legends.",
  enabledGateways: ["khqr", "aba", "wing", "binance"],
};

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const setting = await Setting.findOne({ key: "general" }).lean().catch(() => null);

    return NextResponse.json({
      success: true,
      settings: setting || DEFAULT_SETTINGS,
    });
  } catch (error: unknown) {
    console.error("Admin settings GET error:", error);
    return NextResponse.json(
      {
        success: false,
        settings: DEFAULT_SETTINGS,
        error: error instanceof Error ? error.message : "Failed to load settings",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const body = await req.json();

    const updateData = {
      siteName: String(body.siteName || DEFAULT_SETTINGS.siteName).trim(),
      siteTagline: String(body.siteTagline || DEFAULT_SETTINGS.siteTagline).trim(),
      logoUrl: body.logoUrl ? String(body.logoUrl).trim() : "",
      telegramSupport: String(body.telegramSupport || DEFAULT_SETTINGS.telegramSupport).trim(),
      whatsappSupport: body.whatsappSupport ? String(body.whatsappSupport).trim() : "",
      defaultMarginPercent: Math.max(0, Number(body.defaultMarginPercent) || 10),
      currencyRateKHR: Math.max(1, Number(body.currencyRateKHR) || 4100),
      maintenanceMode: Boolean(body.maintenanceMode),
      announcement: body.announcement ? String(body.announcement).trim() : "",
      enabledGateways: Array.isArray(body.enabledGateways) ? body.enabledGateways : DEFAULT_SETTINGS.enabledGateways,
      updatedAt: new Date(),
    };

    const updated = await Setting.findOneAndUpdate(
      { key: "general" },
      { $set: updateData },
      { upsert: true, new: true }
    ).lean();

    return NextResponse.json({
      success: true,
      message: "Website settings saved successfully",
      settings: updated,
    });
  } catch (error: unknown) {
    console.error("Admin settings POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save settings",
      },
      { status: 500 }
    );
  }
}
