import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import mongoose from "mongoose";

const ROBUX_PACKAGES = [
  { amount: 50, price: 0.45, originalPrice: 0.55, badge: "POPULAR" },
  { amount: 100, price: 0.90, originalPrice: 1.10, badge: "HOT" },
  { amount: 300, price: 2.50, originalPrice: 2.95 },
  { amount: 500, price: 4.30, originalPrice: 4.90 },
  { amount: 800, price: 6.80, originalPrice: 7.75, badge: "BEST VALUE" },
  { amount: 1000, price: 8.40, originalPrice: 9.60, badge: "HOT" },
  { amount: 1500, price: 12.50, originalPrice: 14.20 },
  { amount: 2000, price: 16.35, originalPrice: 18.50, badge: "POPULAR" },
  { amount: 2500, price: 20.50, originalPrice: 23.20 },
  { amount: 3000, price: 24.58, originalPrice: 27.80 },
  { amount: 5000, price: 40.35, originalPrice: 45.60, badge: "VIP" },
  { amount: 10000, price: 80.96, originalPrice: 91.50, badge: "MEGA" },
  { amount: 15000, price: 121.98, originalPrice: 137.90 },
  { amount: 20000, price: 161.89, originalPrice: 182.90, badge: "PRO" },
];

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB Atlas");
  const db = mongoose.connection.db;

  // 1. Upsert Roblox Game
  const robloxGame = {
    slug: "roblox",
    name: "Roblox",
    supplier: "webbuilder",
    supplierGameCode: "roblox",
    category: "Adventure",
    image: "/images/roblox.webp",
    banner: "/images/roblox-send-banner.webp",
    publisher: "Roblox Corporation",
    currencyName: "Robux",
    description: "Roblox Robux Top-Up via Roblox Send. Safe, fast, and 100% secure delivery directly to your account. Select your package and chat with our admin on Telegram to complete your top-up.",
    requiresServer: false,
    userIdLabel: "Roblox Username",
    instruction: "Enter your exact Roblox Username to receive Robux via Roblox Send. After selecting your package, chat with our admin on Telegram to complete your top-up.",
    badge: "ROBUX SEND",
    isPopular: true,
    isTrending: true,
    isActive: true,
    checkoutSupported: true,
    defaultMarginPercent: 15,
    sortOrder: 4,
    updatedAt: new Date(),
  };

  await db.collection("games").deleteMany({ slug: "roblox" });
  const gameInsert = await db.collection("games").insertOne({
    ...robloxGame,
    createdAt: new Date(),
  });
  console.log("Upserted Roblox game:", gameInsert.insertedId);

  // 2. Remove old roblox packages
  await db.collection("gamepackages").deleteMany({ gameSlug: "roblox" });

  // 3. Insert 14 official Robux Send packages
  const packagesToInsert = ROBUX_PACKAGES.map((pkg, idx) => ({
    gameSlug: "roblox",
    gameCode: "roblox",
    supplier: "webbuilder",
    supplierProductCode: `roblox-send-${pkg.amount}`,
    name: `${pkg.amount.toLocaleString()} Robux`,
    diamondsOrPoints: String(pkg.amount),
    customImage: "/images/robux-coin.webp",
    sellingPrice: pkg.price,
    originalPrice: pkg.originalPrice,
    currency: "USD",
    badge: pkg.badge || undefined,
    isActive: true,
    supplierAvailable: true,
    adminConfigured: true,
    isFeatured: [50, 100, 800, 1000, 2000].includes(pkg.amount),
    sortOrder: idx + 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const pkgInsert = await db.collection("gamepackages").insertMany(packagesToInsert);
  console.log(`Successfully seeded ${pkgInsert.insertedCount} Roblox Send packages!`);

  process.exit(0);
}

main().catch(err => {
  console.error("Seed error:", err);
  process.exit(1);
});
