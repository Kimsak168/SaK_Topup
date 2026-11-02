import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { RewardWallet } from "@/models/RewardWallet";
import { LUCKY_PRIZES, LuckyPrize } from "@/types/luckyDraw";

export const dynamic = "force-dynamic";

function pickWeightedPrize(): { prize: LuckyPrize; index: number } {
  const totalWeight = LUCKY_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  const randomVal = crypto.randomInt(0, totalWeight);
  let cumulative = 0;

  for (let i = 0; i < LUCKY_PRIZES.length; i++) {
    cumulative += LUCKY_PRIZES[i].weight;
    if (randomVal < cumulative) {
      return { prize: LUCKY_PRIZES[i], index: i };
    }
  }

  return { prize: LUCKY_PRIZES[0], index: 0 };
}

function generateVoucherCode(prefix: string): string {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${rand}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientIdentifier = (body.identifier || `guest-${crypto.randomBytes(4).toString("hex")}`).trim();

    // 1. Pick prize by weighted random
    const { prize, index } = pickWeightedPrize();

    // 2. Generate promo voucher code
    let code: string | undefined;
    if (prize.type === "discount") {
      code = generateVoucherCode("SPIN");
    } else if (prize.type === "diamonds") {
      code = generateVoucherCode("LUCKY-DIA");
    } else if (prize.type === "views") {
      code = generateVoucherCode("LUCKY-VIEWS");
    } else {
      code = generateVoucherCode("PTS");
    }

    const wonPrize = {
      id: prize.id,
      name: prize.name,
      label: prize.label,
      icon: prize.icon,
      type: prize.type,
      value: prize.value,
      code,
      description: prize.description,
    };

    // 3. Persist to RewardWallet if available
    try {
      await connectDB();
      let wallet = await RewardWallet.findOne({ identifier: clientIdentifier });
      if (!wallet) {
        wallet = new RewardWallet({ identifier: clientIdentifier, points: 0, totalPointsEarned: 0 });
      }

      if (prize.type === "points") {
        wallet.points += prize.value;
        wallet.totalPointsEarned += prize.value;
        wallet.transactions.push({
          type: "EARN_LUCKY_DRAW",
          points: prize.value,
          description: `Daily Free Lucky Spin prize: ${prize.label}`,
          createdAt: new Date(),
        });
      }

      if (code) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 14); // 14 days validity
        wallet.vouchers.push({
          code,
          title: prize.label,
          type: prize.type as "discount" | "diamonds" | "views",
          value: prize.value,
          minSpend: prize.type === "discount" ? 0.50 : 0,
          isUsed: false,
          expiresAt,
          createdAt: new Date(),
        });
      }

      await wallet.save();
    } catch {
      // Wallet persistence is best-effort for guests
    }

    return NextResponse.json({
      success: true,
      prize: wonPrize,
      sliceIndex: index,
      code,
      isFreeSpin: true,
    });
  } catch (error) {
    console.error("[Free Lucky Draw Spin API Error]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to execute free spin." },
      { status: 500 }
    );
  }
}
