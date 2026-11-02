import { NextRequest, NextResponse } from "next/server";
import { spinOrderLuckyDraw } from "@/lib/services/luckyDrawService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderNumber = (body.orderNumber || "").trim();

    if (!orderNumber) {
      return NextResponse.json(
        { success: false, error: "Valid orderNumber is required to spin." },
        { status: 400 }
      );
    }

    const result = await spinOrderLuckyDraw(orderNumber);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Lucky Draw Spin API Error]:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred while processing your spin." },
      { status: 500 }
    );
  }
}
