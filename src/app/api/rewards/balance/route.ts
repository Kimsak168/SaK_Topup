import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RewardWallet } from "@/models/RewardWallet";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const identifier = (searchParams.get("identifier") || "").trim();

    if (!identifier) {
      return NextResponse.json(
        { success: false, error: "identifier is required." },
        { status: 400 }
      );
    }

    await connectDB();
    const wallet = await RewardWallet.findOne({ identifier });

    if (!wallet) {
      return NextResponse.json({
        success: true,
        points: 0,
        totalPointsEarned: 0,
        transactions: [],
        vouchers: [],
      });
    }

    return NextResponse.json({
      success: true,
      points: wallet.points,
      totalPointsEarned: wallet.totalPointsEarned,
      transactions: wallet.transactions.slice(-10).reverse(),
      vouchers: wallet.vouchers.filter((v) => !v.isUsed && new Date(v.expiresAt) > new Date()),
    });
  } catch (error) {
    console.error("[Reward Balance API Error]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch reward wallet." },
      { status: 500 }
    );
  }
}
