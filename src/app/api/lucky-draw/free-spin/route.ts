import { NextRequest, NextResponse } from "next/server";
import { spinOrderLuckyDraw } from "@/lib/services/luckyDrawService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderNumber = (body.orderNumber || "").trim();

    // Lucky Draw is strictly exclusive to clients who bought/completed an order
    if (!orderNumber) {
      return NextResponse.json(
        {
          success: false,
          error: "Lucky Draw is exclusive to verified buyers. Please enter your paid Order Number or complete a top-up to spin.",
          buyerOnly: true,
        },
        { status: 403 }
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
      { success: false, error: "Failed to process spin. Please ensure you have a valid paid order." },
      { status: 500 }
    );
  }
}
