export interface LuckyPrize {
  id: string;
  name: string;
  label: string;
  icon: string;
  color: string;
  type: "points" | "discount" | "diamonds" | "views";
  value: number;
  weight: number;
  description: string;
}

export const LUCKY_PRIZES: LuckyPrize[] = [
  {
    id: "pts-20",
    name: "20 Points",
    label: "+20 Points",
    icon: "🎁",
    color: "#8B5CF6", // Purple
    type: "points",
    value: 20,
    weight: 32,
    description: "20 Loyalty Points added to your balance!",
  },
  {
    id: "disc-10",
    name: "$0.10 OFF",
    label: "$0.10 Voucher",
    icon: "🎟️",
    color: "#EC4899", // Pink
    type: "discount",
    value: 0.10,
    weight: 24,
    description: "Voucher code for $0.10 off on your next checkout!",
  },
  {
    id: "pts-50",
    name: "50 Points",
    label: "+50 Points",
    icon: "⭐",
    color: "#0284C7", // Sky blue
    type: "points",
    value: 50,
    weight: 15,
    description: "Super reward! 50 Points added to your wallet!",
  },
  {
    id: "tt-views",
    name: "1K Views",
    label: "1,000 Views",
    icon: "🚀",
    color: "#10B981", // Emerald
    type: "views",
    value: 1000,
    weight: 10,
    description: "Free 1,000 TikTok Video Views voucher code!",
  },
  {
    id: "disc-25",
    name: "$0.25 OFF",
    label: "$0.25 Voucher",
    icon: "🎫",
    color: "#F59E0B", // Amber
    type: "discount",
    value: 0.25,
    weight: 8,
    description: "$0.25 discount voucher for your next game top-up!",
  },
  {
    id: "ff-dia-10",
    name: "10 Diamonds",
    label: "10 Diamonds",
    icon: "💎",
    color: "#3B82F6", // Royal blue
    type: "diamonds",
    value: 10,
    weight: 5,
    description: "Bonus 10 Free Diamonds code redeemable with support!",
  },
  {
    id: "jackpot-100",
    name: "100 Points",
    label: "👑 JACKPOT!",
    icon: "👑",
    color: "#EF4444", // Red gold
    type: "points",
    value: 100,
    weight: 2,
    description: "JACKPOT! Huge 100 Points reward credited to your wallet!",
  },
  {
    id: "water-fest-15",
    name: "15 Festive Pts",
    label: "🪷 Festive 15",
    icon: "🪷",
    color: "#06B6D4", // Cyan
    type: "points",
    value: 15,
    weight: 4,
    description: "Water Festival festive reward: +15 Points!",
  },
];
