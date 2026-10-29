import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import mongoose from "mongoose";

const BASE_URL = process.env.G2BULK_BASE_URL || "https://api.g2bulk.com/v1";
const apiKey = process.env.G2BULK_API_KEY;

if (!apiKey) {
  console.error("G2BULK_API_KEY is missing");
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;

  // 1. Upsert Roblox Game
  const robloxGameData = {
    slug: "roblox",
    name: "Roblox",
    supplier: "g2bulk",
    supplierGameCode: "roblox",
    category: "Adventure",
    image: "/images/roblox.jpg",
    banner: "/images/roblox.jpg",
    publisher: "Roblox Corporation",
    currencyName: "Robux",
    description: "Instant automated Roblox Robux recharge & digital Gift Cards via G2Bulk. Safe 24/7 delivery.",
    requiresServer: false,
    userIdLabel: "Roblox Username",
    instruction: "Enter your Roblox Username (or User ID) to recharge Robux or Gift Cards.",
    badge: "HOT",
    isPopular: true,
    isTrending: true,
    isActive: true,
    defaultMarginPercent: 12,
    sortOrder: 5,
    updatedAt: new Date(),
  };

  const gameResult = await db.collection("games").findOneAndUpdate(
    { supplier: "g2bulk", $or: [{ slug: "roblox" }, { supplierGameCode: "roblox" }] },
    {
      $set: robloxGameData,
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true, returnDocument: "after" }
  );

  const gameId = gameResult._id || (await db.collection("games").findOne({ slug: "roblox" }))._id;
  console.log("Roblox Game Upserted. ID:", gameId);

  // 2. Fetch products from G2Bulk
  console.log("Fetching Roblox products from G2Bulk API...");
  const res = await fetch(`${BASE_URL}/products`, {
    headers: { "X-API-Key": apiKey },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch G2Bulk products: HTTP ${res.status}`);
  }

  const data = await res.json();
  const allProducts = Array.isArray(data.products) ? data.products : [];
  
  // Filter for Roblox products (Global Robux and US Gift Cards)
  const robloxProducts = allProducts.filter((p) => {
    const s = `${p.title} ${p.category_title}`.toLowerCase();
    return s.includes("roblox") || s.includes("robux");
  });

  const relevantProducts = robloxProducts.filter((p) => {
    const cat = (p.category_title || "").toLowerCase();
    return cat.includes("global") || cat.includes("us giftcard");
  });

  const listToSync = relevantProducts.length > 0 ? relevantProducts : robloxProducts;
  console.log(`Found ${listToSync.length} relevant Roblox products.`);

  let imported = 0;
  let updated = 0;

  for (const prod of listToSync) {
    const prodId = String(prod.id);
    const wholesaleCost = Number(prod.unit_price) || 0;
    const computedSellingPrice = Math.round(wholesaleCost * 1.12 * 100) / 100;
    const computedOriginalPrice = Math.round(computedSellingPrice * 1.15 * 100) / 100;

    const isCard = prod.title.toLowerCase().includes("us") || prod.title.toLowerCase().includes("$");
    const badge = prod.title.includes("800") || prod.title.includes("20$") ? "HOT" : prod.title.includes("1000") || prod.title.includes("200 Robux") ? "POPULAR" : "";

    const existing = await db.collection("gamepackages").findOne({
      supplier: "g2bulk",
      supplierProductCode: prodId,
    });

    if (!existing) {
      await db.collection("gamepackages").insertOne({
        gameId,
        gameSlug: "roblox",
        gameCode: "roblox",
        supplier: "g2bulk",
        supplierPackageId: prodId,
        supplierProductCode: prodId,
        name: prod.title,
        diamondsOrPoints: prod.title,
        buyingPrice: wholesaleCost,
        sellingPrice: computedSellingPrice,
        originalPrice: computedOriginalPrice,
        currency: "USD",
        customImage: isCard ? "/images/roblox.jpg" : "/images/robux-coin.jpg",
        badge,
        isActive: true,
        supplierAvailable: prod.stock !== 0,
        adminConfigured: false,
        sortOrder: Math.round(wholesaleCost * 10),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      imported++;
    } else {
      const updateFields = {
        gameId,
        gameSlug: "roblox",
        gameCode: "roblox",
        supplier: "g2bulk",
        name: prod.title,
        diamondsOrPoints: prod.title,
        buyingPrice: wholesaleCost,
        supplierAvailable: prod.stock !== 0,
        updatedAt: new Date(),
      };

      if (!existing.adminConfigured) {
        updateFields.sellingPrice = computedSellingPrice;
        updateFields.originalPrice = computedOriginalPrice;
      }

      await db.collection("gamepackages").updateOne(
        { _id: existing._id },
        { $set: updateFields }
      );
      updated++;
    }
  }

  console.log(`Synchronization finished: ${imported} imported, ${updated} updated.`);

  // Verify DB state
  const pkgs = await db.collection("gamepackages").find({ gameSlug: "roblox" }).toArray();
  console.log(`Total Roblox packages now in DB: ${pkgs.length}`);
  pkgs.slice(0, 10).forEach(p => {
    console.log(`- [${p.supplierProductCode}] ${p.name}: Cost $${p.buyingPrice} -> Sell $${p.sellingPrice} (Available: ${p.supplierAvailable})`);
  });

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
