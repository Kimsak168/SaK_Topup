export interface LuckyPrize {
  id: string;
  name: string;
  label: string;
  icon: string;
  color: string;
  type: "points" | "discount" | "diamonds" | "views" | "pass";
  value: number;
  weight: number;
  description: string;
}

export const LUCKY_PRIZES: LuckyPrize[] = [
  {
    id: "ff-weekly",
    name: "FF Weekly",
    label: "Free Fire Weekly Membership",
    icon: "🔥",
    color: "#EF4444", // Red (Free Fire signature)
    type: "pass",
    value: 1,
    weight: 1,
    description: "Grand Prize: Free Fire Weekly Membership direct delivery code!",
  },
  {
    id: "mlbb-weekly",
    name: "MLBB Weekly",
    label: "MLBB Weekly Diamond Pass",
    icon: "👑",
    color: "#8B5CF6", // Purple (MLBB signature)
    type: "pass",
    value: 1,
    weight: 1,
    description: "Grand Prize: Mobile Legends Weekly Diamond Pass voucher code!",
  },
  {
    id: "ff-dia-50",
    name: "50 FF Dia",
    label: "50 Free Fire Diamonds",
    icon: "💎",
    color: "#F59E0B", // Amber gold
    type: "diamonds",
    value: 50,
    weight: 5,
    description: "Super Reward: 50 Free Fire Diamonds top-up code!",
  },
  {
    id: "mlbb-dia-50",
    name: "50 MLBB Dia",
    label: "50 MLBB Diamonds",
    icon: "💎",
    color: "#06B6D4", // Cyan
    type: "diamonds",
    value: 50,
    weight: 5,
    description: "Super Reward: 50 Mobile Legends Diamonds top-up voucher!",
  },
  {
    id: "ff-dia-20",
    name: "20 FF Dia",
    label: "20 Free Fire Diamonds",
    icon: "✨",
    color: "#10B981", // Emerald
    type: "diamonds",
    value: 20,
    weight: 22,
    description: "Bonus: 20 Free Fire Diamonds instant top-up code!",
  },
  {
    id: "mlbb-dia-15",
    name: "15 MLBB Dia",
    label: "15 MLBB Diamonds",
    icon: "🔷",
    color: "#3B82F6", // Royal blue
    type: "diamonds",
    value: 15,
    weight: 22,
    description: "Bonus: 15 Mobile Legends Diamonds instant voucher!",
  },
  {
    id: "disc-50-weekly",
    name: "$0.50 OFF",
    label: "$0.50 Weekly Pass Voucher",
    icon: "🎟️",
    color: "#EC4899", // Pink
    type: "discount",
    value: 0.50,
    weight: 20,
    description: "$0.50 discount voucher for Free Fire or MLBB Weekly Pass!",
  },
  {
    id: "disc-20-topup",
    name: "$0.20 OFF",
    label: "$0.20 Top-Up Voucher",
    icon: "🏷️",
    color: "#F97316", // Orange
    type: "discount",
    value: 0.20,
    weight: 24,
    description: "$0.20 discount coupon for Free Fire or MLBB game top-ups!",
  },
];

