import { MongoClient } from 'mongodb';

const BASE_URL = (process.env.WEBBUILDER_BASE_URL || "https://webbuilderservice.dev/v1").replace(/\/+$/, "");
const API_KEY = process.env.WEBBUILDER_API_KEY?.trim();
const MONGODB_URI = process.env.MONGODB_URI;

if (!API_KEY) {
  console.error("ERROR: Missing WEBBUILDER_API_KEY in environment.");
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error("ERROR: Missing MONGODB_URI in environment.");
  process.exit(1);
}

async function main() {
  console.log("=== Switching Honor of Kings from G2Bulk to WebBuilder ===");

  // 1. Fetch live products from WebBuilder
  console.log("Fetching live products from WebBuilder...");
  const res = await fetch(`${BASE_URL}/products`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    console.error(`WebBuilder returned HTTP ${res.status}:`, await res.text());
    process.exit(1);
  }

  const json = await res.json();
  const allProducts = json.data || json.products || json || [];
  const hokProducts = allProducts.filter((p) => {
    const game = (p.game || "").toLowerCase();
    const name = (p.name || "").toLowerCase();
    return game.includes("honor") || game.includes("hok") || name.includes("honor of king");
  });

  console.log(`Found ${hokProducts.length} Honor of Kings products from WebBuilder.`);

  // 2. Connect to MongoDB
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const gamesColl = db.collection("games");
  const pkgsColl = db.collection("gamepackages");

  // 3. Close G2Bulk for HoK and enable WebBuilder for HoK
  // Update the existing game or ensure supplier is 'webbuilder'
  const existingGame = await gamesColl.findOne({
    $or: [
      { supplierGameCode: "hok" },
      { slug: "hok" },
      { slug: "honor-of-kings" },
      { name: "Honor of Kings" },
    ],
  });

  if (existingGame) {
    console.log(`Found existing game: ${existingGame.name} (Supplier: ${existingGame.supplier}) -> Updating to webbuilder...`);
    await gamesColl.updateOne(
      { _id: existingGame._id },
      {
        $set: {
          supplier: "webbuilder",
          supplierGameCode: "hok",
          slug: "hok",
          name: "Honor of Kings",
          category: "MOBA",
          currencyName: "Tokens",
          requiresServer: false,
          userIdLabel: "Player ID (UID)",
          instruction: "Open Honor of Kings, tap your avatar to open profile. Locate your numeric UID.",
          image: existingGame.customImage || existingGame.image || "https://api.g2bulk.com/images/hok.png",
          badge: "POPULAR",
          isPopular: true,
          isTrending: true,
          isActive: true, // Enabled on Storefront
          updatedAt: new Date(),
        },
        $unset: {
          serverLabel: "",
        },
      }
    );
    console.log("Game updated to WebBuilder successfully! Storefront Visibility: Enabled.");
  } else {
    console.log("No existing game found. Creating new WebBuilder Honor of Kings entry...");
    await gamesColl.insertOne({
      slug: "hok",
      name: "Honor of Kings",
      supplier: "webbuilder",
      supplierGameCode: "hok",
      category: "MOBA",
      image: "https://api.g2bulk.com/images/hok.png",
      banner: "https://api.g2bulk.com/images/hok.png",
      publisher: "Level Infinite",
      currencyName: "Tokens",
      description: "Official Honor of Kings Tokens automated instant top-up via WebBuilder API. 24/7 delivery.",
      requiresServer: false,
      userIdLabel: "Player ID (UID)",
      instruction: "Open Honor of Kings, tap your avatar to open profile. Locate your numeric UID.",
      badge: "POPULAR",
      isPopular: true,
      isTrending: true,
      isActive: true,
      defaultMarginPercent: 12,
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("Created new WebBuilder Honor of Kings game!");
  }

  // Also disable any other game with supplier: 'g2bulk' and code: 'hok' if distinct
  const disabledG2Bulk = await gamesColl.updateMany(
    { supplier: "g2bulk", supplierGameCode: "hok" },
    { $set: { isActive: false, updatedAt: new Date() } }
  );
  if (disabledG2Bulk.modifiedCount > 0) {
    console.log(`Deactivated ${disabledG2Bulk.modifiedCount} legacy G2Bulk HoK game entry.`);
  }

  // Deactivate any old G2Bulk HoK packages
  const disabledPkgs = await pkgsColl.updateMany(
    { supplier: "g2bulk", $or: [{ gameCode: "hok" }, { gameSlug: "hok" }] },
    { $set: { isActive: false, updatedAt: new Date() } }
  );
  if (disabledPkgs.modifiedCount > 0) {
    console.log(`Deactivated ${disabledPkgs.modifiedCount} legacy G2Bulk HoK packages.`);
  }

  // 4. Upsert the 16 WebBuilder Honor of Kings packages
  console.log("Upserting WebBuilder packages...");
  let imported = 0;
  let updated = 0;

  for (let i = 0; i < hokProducts.length; i++) {
    const p = hokProducts[i];
    const supplierProductCode = String(p.id).trim();
    const buyingPriceUsd = typeof p.price_cents === "number" ? p.price_cents / 100 : null;
    const isOrderable = p.orderable !== false && p.status !== "inactive";

    // Format display name nicely: if name is just a number (e.g. "80"), label as "80 Tokens"
    const isNumeric = /^\d+$/.test(p.name.trim());
    const displayName = isNumeric ? `${p.name} Tokens` : p.name;
    const diamondsOrPoints = isNumeric ? `${p.name} Tokens` : p.name;

    // Default 10% margin selling price if unconfigured
    const defaultSellingPrice = buyingPriceUsd ? Math.round(buyingPriceUsd * 1.10 * 100) / 100 : null;

    const existingPkg = await pkgsColl.findOne({
      supplier: "webbuilder",
      supplierProductCode,
    });

    if (!existingPkg) {
      await pkgsColl.insertOne({
        gameSlug: "hok",
        gameCode: "hok",
        supplier: "webbuilder",
        supplierProductCode,
        name: displayName,
        diamondsOrPoints,
        buyingPrice: buyingPriceUsd,
        priceCents: p.price_cents,
        sellingPrice: defaultSellingPrice, // Configured with initial margin so customer can purchase immediately
        originalPrice: defaultSellingPrice ? Math.round(defaultSellingPrice * 1.15 * 100) / 100 : null,
        currency: p.currency || "USD",
        badge: p.name === "80" ? "POPULAR" : p.name.includes("Weekly") ? "HOT VALUE" : "",
        isActive: isOrderable,
        adminConfigured: true,
        sortOrder: i + 1,
        syncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      imported++;
    } else {
      await pkgsColl.updateOne(
        { _id: existingPkg._id },
        {
          $set: {
            buyingPrice: buyingPriceUsd,
            priceCents: p.price_cents,
            isActive: isOrderable,
            name: existingPkg.name || displayName,
            syncedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );
      updated++;
    }
  }

  console.log(`Packages sync result: ${imported} imported, ${updated} updated.`);

  await client.close();
  console.log("=== Migration successfully completed! ===");
}

main().catch((err) => {
  console.error("Migration script failed:", err);
  process.exit(1);
});
