import { NextRequest, NextResponse } from "next/server";
import { getLuckyDrawStatus } from "@/lib/services/luckyDrawService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get("orderNumber");

    if (!orderNumber || !orderNumber.trim()) {
      return NextResponse.json(
        { success: false, error: "orderNumber query parameter is required." },
        { status: 400 }
      );
    }

    const result = await getLuckyDrawStatus(orderNumber);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Lucky Draw Status API Error]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to query lucky draw status." },
      { status: 500 }
    );
  }
}
