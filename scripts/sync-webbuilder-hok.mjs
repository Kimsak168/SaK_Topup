#!/usr/bin/env node
/**
 * Honor of Kings WebBuilder Synchronizer / Seed Script
 * Run with: node --env-file=.env.local scripts/sync-webbuilder-hok.mjs
 */

import { MongoClient } from "mongodb";

const BASE_URL = (process.env.WEBBUILDER_BASE_URL || "https://webbuilderservice.dev/v1").replace(/\/+$/, "");
const API_KEY = process.env.WEBBUILDER_API_KEY?.trim();
const MONGODB_URI = process.env.MONGODB_URI;

if (!API_KEY) {
  console.error("ERROR: Missing WEBBUILDER_API_KEY environment variable.");
  console.error("Please add WEBBUILDER_API_KEY to your .env.local file or server environment.");
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error("ERROR: Missing MONGODB_URI environment variable.");
  process.exit(1);
}

function isHonorOfKings(p) {
  const name = (p.name || "").toLowerCase();
  const game = (p.game || "").toLowerCase();
  const id = (p.id || "").toLowerCase();
  return (
    name.includes("honor of king") ||
    name.includes("hok") ||
    game.includes("honor of king") ||
    game.includes("hok") ||
    id.includes("hok") ||
    id.includes("honor-of-kings") ||
    id.includes("honor_of_kings")
  );
}

async function run() {
  console.log("=== WebBuilder Reseller API: Honor of Kings Sync ===");
  console.log(`Connecting to WebBuilder Base URL: ${BASE_URL}`);

  // 1. Fetch balance
  try {
    const balRes = await fetch(`${BASE_URL}/balance`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (balRes.ok) {
      const balJson = await balRes.json();
      const available = balJson.available_cents ?? balJson.data?.available_cents ?? 0;
      const reserved = balJson.reserved_cents ?? balJson.data?.reserved_cents ?? 0;
      console.log(`Reseller Balance: $${(available / 100).toFixed(2)} USD available, $${(reserved / 100).toFixed(2)} USD reserved.`);
    } else {
      console.warn(`Balance check returned HTTP ${balRes.status}`);
    }
  } catch (err) {
    console.warn(`Could not check balance: ${err.message}`);
  }

  // 2. Fetch products
  console.log("Fetching /products from WebBuilder...");
  const prodRes = await fetch(`${BASE_URL}/products`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!prodRes.ok) {
    const errText = await prodRes.text();
    console.error(`Failed to fetch products: HTTP ${prodRes.status} - ${errText}`);
    process.exit(1);
  }

  const rawProducts = await prodRes.json();
  const allList = Array.isArray(rawProducts)
    ? rawProducts
    : Array.isArray(rawProducts.products)
    ? rawProducts.products
    : Array.isArray(rawProducts.data)
    ? rawProducts.data
    : [];

  const hokProducts = allList.filter(isHonorOfKings);
  console.log(`Found ${allList.length} total products on WebBuilder. Honor of Kings products: ${hokProducts.length}`);

  if (hokProducts.length === 0) {
    console.warn("Notice: No Honor of Kings products were returned by /products.");
  }

  // 3. Connect to MongoDB
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const gamesColl = db.collection("games");
  const pkgsColl = db.collection("gamepackages");

  // 4. Ensure Honor of Kings game document
  const gameSlug = "honor-of-kings";
  const gameCode = "hok";
  const existingGame = await gamesColl.findOne({
    supplier: "webbuilder",
    $or: [{ slug: gameSlug }, { supplierGameCode: gameCode }],
  });

  if (!existingGame) {
    await gamesColl.insertOne({
      slug: gameSlug,
      name: "Honor of Kings",
      supplier: "webbuilder",
      supplierGameCode: gameCode,
      category: "MOBA",
      image: "https://api.g2bulk.com/images/hok.png",
      banner: "https://api.g2bulk.com/images/hok.png",
      publisher: "Level Infinite",
      currencyName: "Tokens",
      description: "Official Honor of Kings Tokens automated instant top-up via WebBuilder API. 24/7 delivery.",
      requiresServer: true,
      serverLabel: "Server / Zone ID",
      userIdLabel: "Player ID (UID)",
      instruction: "Open Honor of Kings, tap your avatar to open profile. Locate your numeric UID and Zone ID.",
      badge: "HOT",
      isPopular: true,
      isTrending: true,
      isActive: true,
      defaultMarginPercent: 12,
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("Created 'Honor of Kings' game entry in database.");
  } else {
    console.log("Found existing 'Honor of Kings' game entry in database.");
  }

  // 5. Upsert products
  let imported = 0;
  let updated = 0;

  for (let i = 0; i < hokProducts.length; i++) {
    const p = hokProducts[i];
    const supplierProductCode = String(p.id).trim();
    if (!supplierProductCode) continue;

    const buyingPriceUsd = typeof p.price_cents === "number" ? p.price_cents / 100 : null;
    const isOrderable = p.orderable !== false && p.status !== "inactive";
    const tokensMatch = p.name.match(/\d[\d,]*/);
    const diamondsOrPoints = tokensMatch ? tokensMatch[0].replace(/,/g, "") : p.name;

    const existingPkg = await pkgsColl.findOne({
      supplier: "webbuilder",
      supplierProductCode,
    });

    if (!existingPkg) {
      await pkgsColl.insertOne({
        gameSlug,
        gameCode,
        supplier: "webbuilder",
        supplierProductCode,
        name: p.name,
        diamondsOrPoints,
        buyingPrice: buyingPriceUsd,
        priceCents: p.price_cents,
        sellingPrice: null, // Admin configures this in dashboard
        originalPrice: null,
        currency: p.currency || "USD",
        badge: i === 0 ? "POPULAR" : "",
        isActive: isOrderable,
        adminConfigured: false,
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
            name: existingPkg.name || p.name,
            syncedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );
      updated++;
    }
  }

  console.log(`Package sync complete: ${imported} imported, ${updated} updated.`);
  await client.close();
  console.log("Database connection closed. Done!");
}

run().catch((err) => {
  console.error("Sync script failed:", err);
  process.exit(1);
});
