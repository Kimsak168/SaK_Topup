import { MongoClient } from 'mongodb';

const BASE_URL = (process.env.WEBBUILDER_BASE_URL || "https://webbuilderservice.dev/v1").replace(/\/+$/, "");
const API_KEY = process.env.WEBBUILDER_API_KEY?.trim();
const MONGODB_URI = process.env.MONGODB_URI;

if (!API_KEY) {
  console.error("Missing WEBBUILDER_API_KEY in environment.");
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in environment.");
  process.exit(1);
}

async function run() {
  console.log("=== Migrating Free Fire and MLBB to WebBuilder ===");

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
  console.log(`Fetched ${allProducts.length} products from WebBuilder.`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const gamesColl = db.collection("games");
  const pkgsColl = db.collection("gamepackages");

  // 2. Disable Vizo Free Fire
  console.log("\n--- Disabling Vizo Free Fire ---");
  const disabledVizoGames = await gamesColl.updateMany(
    { supplier: "vizo", $or: [{ supplierGameCode: /freefire/i }, { slug: /free-fire/i }] },
    { $set: { isActive: false, updatedAt: new Date() } }
  );
  console.log(`Disabled ${disabledVizoGames.modifiedCount} Vizo Free Fire game entries.`);

  const disabledVizoPkgs = await pkgsColl.updateMany(
    { supplier: "vizo", $or: [{ gameCode: /freefire/i }, { gameSlug: /free-fire/i }] },
    { $set: { isActive: false, updatedAt: new Date() } }
  );
  console.log(`Disabled ${disabledVizoPkgs.modifiedCount} Vizo Free Fire packages.`);

  // 3. Disable G2Bulk MLBB
  console.log("\n--- Disabling G2Bulk MLBB ---");
  const disabledG2Games = await gamesColl.updateMany(
    { supplier: "g2bulk", $or: [{ supplierGameCode: /mlbb/i }, { slug: /mlbb|mobile-legends/i }] },
    { $set: { isActive: false, updatedAt: new Date() } }
  );
  console.log(`Disabled ${disabledG2Games.modifiedCount} G2Bulk MLBB game entries.`);

  const disabledG2Pkgs = await pkgsColl.updateMany(
    { supplier: "g2bulk", $or: [{ gameCode: /mlbb/i }, { gameSlug: /mlbb|mobile-legends/i }] },
    { $set: { isActive: false, updatedAt: new Date() } }
  );
  console.log(`Disabled ${disabledG2Pkgs.modifiedCount} G2Bulk MLBB packages.`);

  // 4. Configure WebBuilder Free Fire Game Entry
  console.log("\n--- Configuring WebBuilder Free Fire Game ---");
  const existingFF = await gamesColl.findOne({
    $or: [
      { supplier: "webbuilder", supplierGameCode: "freefire_sgmy" },
      { supplier: "webbuilder", slug: "free-fire-sgmy" },
      { slug: "free-fire-sgmy" },
      { name: "Free Fire (SGMY)" },
    ],
  });

  const ffArtwork = existingFF?.customImage || existingFF?.image || "https://api.g2bulk.com/images/freefire_global.png";
  if (existingFF) {
    await gamesColl.updateOne(
      { _id: existingFF._id },
      {
        $set: {
          name: "Free Fire (SGMY)",
          slug: "free-fire-sgmy",
          supplier: "webbuilder",
          supplierGameCode: "freefire_sgmy",
          category: "Battle Royale",
          currencyName: "Diamonds",
          requiresServer: false,
          serverLabel: "Server ID",
          userIdLabel: "Player ID (UID)",
          instruction: "Open Free Fire, tap your avatar at top left. Locate your numeric Player ID.",
          image: ffArtwork,
          banner: ffArtwork,
          badge: "HOT DEAL",
          isPopular: true,
          isTrending: true,
          isActive: true,
          sortOrder: 1,
          updatedAt: new Date(),
        },
      }
    );
    console.log("Updated existing game to WebBuilder Free Fire (SGMY).");
  } else {
    await gamesColl.insertOne({
      name: "Free Fire (SGMY)",
      slug: "free-fire-sgmy",
      supplier: "webbuilder",
      supplierGameCode: "freefire_sgmy",
      category: "Battle Royale",
      publisher: "Garena",
      currencyName: "Diamonds",
      description: "Automated instant Free Fire Diamonds top-up delivered 24/7 via WebBuilder API.",
      requiresServer: false,
      serverLabel: "Server ID",
      userIdLabel: "Player ID (UID)",
      instruction: "Open Free Fire, tap your avatar at top left. Locate your numeric Player ID.",
      image: ffArtwork,
      banner: ffArtwork,
      badge: "HOT DEAL",
      isPopular: true,
      isTrending: true,
      isActive: true,
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("Created new WebBuilder Free Fire (SGMY) game.");
  }

  // 5. Configure WebBuilder MLBB Game Entry
  console.log("\n--- Configuring WebBuilder MLBB Game ---");
  const existingMLBB = await gamesColl.findOne({
    $or: [
      { supplier: "webbuilder", supplierGameCode: "mlbb" },
      { supplier: "webbuilder", slug: "mlbb" },
      { slug: "mlbb" },
      { name: "Mobile Legends" },
    ],
  });

  const mlbbArtwork = existingMLBB?.customImage || existingMLBB?.image || "https://api.g2bulk.com/images/mlbb.png";
  if (existingMLBB) {
    await gamesColl.updateOne(
      { _id: existingMLBB._id },
      {
        $set: {
          name: "Mobile Legends",
          slug: "mlbb",
          supplier: "webbuilder",
          supplierGameCode: "mlbb",
          category: "MOBA",
          currencyName: "Diamonds",
          requiresServer: true,
          serverLabel: "Zone ID",
          userIdLabel: "User ID",
          instruction: "Open Mobile Legends, tap your avatar to open profile. Locate your numeric User ID and 4-5 digit Zone ID.",
          image: mlbbArtwork,
          banner: mlbbArtwork,
          badge: "POPULAR",
          isPopular: true,
          isTrending: true,
          isActive: true,
          sortOrder: 2,
          updatedAt: new Date(),
        },
      }
    );
    console.log("Updated existing game to WebBuilder Mobile Legends.");
  } else {
    await gamesColl.insertOne({
      name: "Mobile Legends",
      slug: "mlbb",
      supplier: "webbuilder",
      supplierGameCode: "mlbb",
      category: "MOBA",
      publisher: "Moonton",
      currencyName: "Diamonds",
      description: "Official Mobile Legends: Bang Bang Diamonds top-up with automated instant delivery via WebBuilder API.",
      requiresServer: true,
      serverLabel: "Zone ID",
      userIdLabel: "User ID",
      instruction: "Open Mobile Legends, tap your avatar to open profile. Locate your numeric User ID and 4-5 digit Zone ID.",
      image: mlbbArtwork,
      banner: mlbbArtwork,
      badge: "POPULAR",
      isPopular: true,
      isTrending: true,
      isActive: true,
      sortOrder: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("Created new WebBuilder Mobile Legends game.");
  }

  // 6. Upsert WebBuilder Free Fire Packages
  console.log("\n--- Upserting WebBuilder Free Fire Packages ---");
  const ffProducts = allProducts.filter((p) => p.game === "Free Fire SGMY");
  console.log(`Found ${ffProducts.length} Free Fire SGMY products from WebBuilder.`);

  let ffImported = 0;
  let ffUpdated = 0;

  for (let i = 0; i < ffProducts.length; i++) {
    const p = ffProducts[i];
    const supplierProductCode = String(p.id).trim();
    const buyingPriceUsd = typeof p.price_cents === "number" ? p.price_cents / 100 : null;
    const isOrderable = p.orderable !== false && p.status !== "inactive";

    const isNumeric = /^\d+$/.test(p.name.trim());
    const displayName = isNumeric ? `${p.name} Diamonds` : p.name;
    const diamondsOrPoints = isNumeric ? `${p.name} Diamonds` : p.name;

    // Default 12% margin selling price
    const defaultSellingPrice = buyingPriceUsd ? Math.round(buyingPriceUsd * 1.12 * 100) / 100 : null;

    const existingPkg = await pkgsColl.findOne({
      supplier: "webbuilder",
      supplierProductCode,
    });

    if (!existingPkg) {
      await pkgsColl.insertOne({
        gameSlug: "free-fire-sgmy",
        gameCode: "freefire_sgmy",
        supplier: "webbuilder",
        supplierProductCode,
        name: displayName,
        diamondsOrPoints,
        buyingPrice: buyingPriceUsd,
        priceCents: p.price_cents,
        sellingPrice: defaultSellingPrice,
        originalPrice: defaultSellingPrice ? Math.round(defaultSellingPrice * 1.15 * 100) / 100 : null,
        currency: p.currency || "USD",
        badge: p.name === "100" ? "POPULAR" : p.name.includes("Weekly") ? "BEST VALUE" : "",
        isActive: isOrderable,
        adminConfigured: true,
        sortOrder: i + 1,
        syncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      ffImported++;
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
      ffUpdated++;
    }
  }
  console.log(`Free Fire packages: ${ffImported} imported, ${ffUpdated} updated.`);

  // 7. Upsert WebBuilder MLBB Packages
  console.log("\n--- Upserting WebBuilder MLBB Packages ---");
  // Select standard Mobile Legends products and Global products
  const mlbbProducts = allProducts.filter((p) => p.game === "Mobile Legends" || p.game === "Mobile Legends Global");
  console.log(`Found ${mlbbProducts.length} Mobile Legends products from WebBuilder.`);

  let mlbbImported = 0;
  let mlbbUpdated = 0;

  // Deduplicate products if necessary by name/diamonds
  const seenCodes = new Set();
  for (let i = 0; i < mlbbProducts.length; i++) {
    const p = mlbbProducts[i];
    const supplierProductCode = String(p.id).trim();
    if (seenCodes.has(supplierProductCode)) continue;
    seenCodes.add(supplierProductCode);

    const buyingPriceUsd = typeof p.price_cents === "number" ? p.price_cents / 100 : null;
    const isOrderable = p.orderable !== false && p.status !== "inactive";

    const isNumeric = /^\d+$/.test(p.name.trim());
    const displayName = isNumeric ? `${p.name} Diamonds` : p.name;
    const diamondsOrPoints = isNumeric ? `${p.name} Diamonds` : p.name;

    // Default 12% margin selling price
    const defaultSellingPrice = buyingPriceUsd ? Math.round(buyingPriceUsd * 1.12 * 100) / 100 : null;

    const existingPkg = await pkgsColl.findOne({
      supplier: "webbuilder",
      supplierProductCode,
    });

    if (!existingPkg) {
      await pkgsColl.insertOne({
        gameSlug: "mlbb",
        gameCode: "mlbb",
        supplier: "webbuilder",
        supplierProductCode,
        name: displayName,
        diamondsOrPoints,
        buyingPrice: buyingPriceUsd,
        priceCents: p.price_cents,
        sellingPrice: defaultSellingPrice,
        originalPrice: defaultSellingPrice ? Math.round(defaultSellingPrice * 1.15 * 100) / 100 : null,
        currency: p.currency || "USD",
        badge: p.name === "86" ? "POPULAR" : p.name.includes("Weekly") ? "HOT" : "",
        isActive: isOrderable,
        adminConfigured: true,
        sortOrder: i + 1,
        syncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mlbbImported++;
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
      mlbbUpdated++;
    }
  }
  console.log(`MLBB packages: ${mlbbImported} imported, ${mlbbUpdated} updated.`);

  await client.close();
  console.log("\n=== Migration completed successfully! ===");
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
