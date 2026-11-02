import "server-only";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { RewardWallet } from "@/models/RewardWallet";
import { LUCKY_PRIZES, LuckyPrize } from "@/types/luckyDraw";

export { LUCKY_PRIZES };
export type { LuckyPrize };

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

export async function getLuckyDrawStatus(orderNumber: string) {
  await connectDB();
  const order = await Order.findOne({ orderNumber: orderNumber.trim() });
  if (!order) {
    return { success: false, error: "Order not found" };
  }

  const isPaid = String(order.paymentStatus).toUpperCase() === "PAID";
  const hasSpun = Boolean(order.luckyDraw?.spun);

  const identifier = order.customerContact || order.playerId || order.orderNumber;
  const wallet = await RewardWallet.findOne({ identifier });

  return {
    success: true,
    orderNumber: order.orderNumber,
    isPaid,
    eligible: isPaid && !hasSpun,
    hasSpun,
    prize: order.luckyDraw?.prize || null,
    customerPoints: wallet?.points || 0,
    prizes: LUCKY_PRIZES.map(({ id, name, label, icon, color }) => ({ id, name, label, icon, color })),
  };
}

export async function spinOrderLuckyDraw(orderNumber: string) {
  await connectDB();
  const order = await Order.findOne({ orderNumber: orderNumber.trim() });

  if (!order) {
    return { success: false, error: "Order not found." };
  }

  const isPaid = String(order.paymentStatus).toUpperCase() === "PAID";
  if (!isPaid) {
    return { success: false, error: "Only confirmed paid orders are eligible for the Lucky Draw." };
  }

  if (order.luckyDraw?.spun) {
    return {
      success: false,
      error: "This order has already been spun.",
      prize: order.luckyDraw.prize,
      alreadySpun: true,
    };
  }

  // 1. Pick prize by cryptographic weighted random
  const { prize, index } = pickWeightedPrize();

  // 2. Generate voucher code if applicable
  let code: string | undefined;
  if (prize.type === "discount") {
    code = generateVoucherCode("SAVE");
  } else if (prize.type === "diamonds") {
    code = generateVoucherCode("DIA");
  } else if (prize.type === "views") {
    code = generateVoucherCode("VIEWS");
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

  // 3. Persist spin to order document
  order.luckyDraw = {
    eligible: true,
    spun: true,
    spunAt: new Date(),
    prize: wonPrize,
  };
  await order.save();

  // 4. Update customer RewardWallet
  const identifier = order.customerContact || order.playerId || order.orderNumber;
  let wallet = await RewardWallet.findOne({ identifier });
  if (!wallet) {
    wallet = new RewardWallet({ identifier, points: 0, totalPointsEarned: 0 });
  }

  // Calculate order bonus points (10 pts per $1 spent)
  const orderEarnedPoints = Math.max(1, Math.floor((order.amount || 0) * 10));
  const spinEarnedPoints = prize.type === "points" ? prize.value : 0;
  const totalNewPoints = orderEarnedPoints + spinEarnedPoints;

  wallet.points += totalNewPoints;
  wallet.totalPointsEarned += totalNewPoints;

  wallet.transactions.push({
    type: "EARN_ORDER",
    points: orderEarnedPoints,
    orderNumber: order.orderNumber,
    description: `Order ${order.orderNumber} top-up reward ($${(order.amount || 0).toFixed(2)})`,
    createdAt: new Date(),
  });

  if (spinEarnedPoints > 0) {
    wallet.transactions.push({
      type: "EARN_LUCKY_DRAW",
      points: spinEarnedPoints,
      orderNumber: order.orderNumber,
      description: `Lucky Spin prize: ${prize.label}`,
      createdAt: new Date(),
    });
  }

  if (code) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days validity
    wallet.vouchers.push({
      code,
      title: prize.label,
      type: prize.type as "discount" | "diamonds" | "views",
      value: prize.value,
      minSpend: prize.type === "discount" ? 0.50 : 0,
      isUsed: false,
      orderNumber: order.orderNumber,
      expiresAt,
      createdAt: new Date(),
    });
  }

  await wallet.save();

  return {
    success: true,
    prize: wonPrize,
    sliceIndex: index,
    customerPoints: wallet.points,
    orderPointsEarned: orderEarnedPoints,
    code,
  };
}
