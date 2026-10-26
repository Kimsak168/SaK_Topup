import { MongoClient } from "mongodb";

const BASE_URL = (process.env.WEBBUILDER_BASE_URL || "https://webbuilderservice.dev/v1").replace(/\/+$/, "");
const API_KEY = process.env.WEBBUILDER_API_KEY?.trim();
const MONGODB_URI = process.env.MONGODB_URI;

if (!API_KEY || !MONGODB_URI) {
  console.error("Missing WEBBUILDER_API_KEY or MONGODB_URI in environment.");
  process.exit(1);
}

const WEBBUILDER_GAMES = [
  {
    name: "Free Fire (KHSGMY)",
    slug: "free-fire-khsgmy",
    code: "freefire_khsgmy",
    category: "Battle Royale",
    currencyName: "Diamonds",
    publisher: "Garena",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("free fire")),
    requiresServer: false,
    userIdLabel: "Player ID (UID)",
    image: "https://api.g2bulk.com/images/freefire_global.png",
    badge: "HOT",
    isPopular: true,
    sortOrder: 1,
  },
  {
    name: "Mobile Legends",
    slug: "mlbb",
    code: "mlbb",
    category: "MOBA",
    currencyName: "Diamonds",
    publisher: "Moonton",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("mobile legend")),
    requiresServer: true,
    serverLabel: "Zone ID (4-5 digits)",
    userIdLabel: "User ID",
    image: "https://api.g2bulk.com/images/mlbb_global.png",
    badge: "POPULAR",
    isPopular: true,
    sortOrder: 2,
  },
  {
    name: "Honor of Kings",
    slug: "hok",
    code: "hok",
    category: "MOBA",
    currencyName: "Tokens",
    publisher: "Level Infinite",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("honor of king")),
    requiresServer: false,
    userIdLabel: "Player ID (UID)",
    image: "https://api.g2bulk.com/images/hok.png",
    badge: "TRENDING",
    isPopular: true,
    sortOrder: 3,
  },
  {
    name: "PUBG Mobile",
    slug: "pubg-mobile",
    code: "pubgm",
    category: "Battle Royale",
    currencyName: "UC",
    publisher: "Krafton / Tencent",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("pubg")),
    requiresServer: false,
    userIdLabel: "Character ID",
    image: "https://api.g2bulk.com/images/pubgm.png",
    badge: "POPULAR",
    isPopular: true,
    sortOrder: 4,
  },
  {
    name: "Blood Strike",
    slug: "blood-strike",
    code: "bloodstrike",
    category: "Battle Royale",
    currencyName: "Gold",
    publisher: "NetEase",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("blood strike")),
    requiresServer: false,
    userIdLabel: "User ID",
    image: "https://api.g2bulk.com/images/bloodstrike.png",
    badge: "",
    isPopular: false,
    sortOrder: 5,
  },
  {
    name: "Magic Chess: Go Go",
    slug: "magic-chess-gogo",
    code: "magic_chess",
    category: "Strategy",
    currencyName: "Diamonds",
    publisher: "Moonton",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("magic chess")),
    requiresServer: true,
    serverLabel: "Zone ID",
    userIdLabel: "User ID",
    image: "/images/magic-chess.jpg",
    badge: "NEW",
    isPopular: false,
    sortOrder: 6,
  },
  {
    name: "8 Ball Pool",
    slug: "8-ball-pool",
    code: "8ballpool",
    category: "Sports",
    currencyName: "Cash / Coins",
    publisher: "Miniclip",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("8 ball")),
    requiresServer: false,
    userIdLabel: "Unique ID",
    image: "/images/8ballpool.jpg",
    badge: "",
    isPopular: false,
    sortOrder: 7,
  },
  {
    name: "Telegram Stars",
    slug: "telegram",
    code: "telegram",
    category: "Apps & Social",
    currencyName: "Stars",
    publisher: "Telegram FZ-LLC",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("telegram")),
    requiresServer: false,
    userIdLabel: "Telegram Username (@username)",
    image: "/images/telegram-stars.jpg",
    badge: "HOT",
    isPopular: true,
    sortOrder: 8,
  },
];

async function run() {
  console.log("=== Syncing All WebBuilder Games and Packages ===");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const gamesColl = db.collection("games");
  const pkgsColl = db.collection("gamepackages");

  // 1. Sync Games
  console.log("\n1. Synchronizing Games...");
  for (const def of WEBBUILDER_GAMES) {
    const existing = await gamesColl.findOne({
      supplier: "webbuilder",
      $or: [{ slug: def.slug }, { supplierGameCode: def.code }],
    });

    if (!existing) {
      await gamesColl.insertOne({
        slug: def.slug,
        name: def.name,
        supplier: "webbuilder",
        supplierGameCode: def.code,
        category: def.category,
        image: def.image,
        banner: def.image,
        publisher: def.publisher,
        currencyName: def.currencyName,
        description: `Instant ${def.name} automated top-up via WebBuilder API. Safe 24/7 delivery.`,
        requiresServer: def.requiresServer,
        serverLabel: def.serverLabel || "Server ID",
        userIdLabel: def.userIdLabel,
        instruction: "Enter your player account ID or username.",
        badge: def.badge || "",
        isPopular: def.isPopular,
        isTrending: def.isPopular,
        isActive: true,
        defaultMarginPercent: 12,
        sortOrder: def.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`+ Created game: ${def.name} (${def.slug})`);
    } else {
      const updateData = {
        supplier: "webbuilder",
        supplierGameCode: def.code,
        requiresServer: def.requiresServer,
        serverLabel: def.serverLabel || existing.serverLabel || "Server ID",
        userIdLabel: def.userIdLabel || existing.userIdLabel,
        isActive: true,
        updatedAt: new Date(),
      };
      if (!existing.image || existing.image === "/images/hero-banner.jpg" || def.image.startsWith("/images/")) {
        updateData.image = def.image;
        updateData.banner = def.image;
      }
      await gamesColl.updateOne({ _id: existing._id }, { $set: updateData });
      console.log(`~ Updated game: ${def.name} (${def.slug})`);
    }
  }

  // 2. Fetch live products from WebBuilder
  console.log("\n2. Fetching products from WebBuilder API...");
  const res = await fetch(`${BASE_URL}/products`, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch WebBuilder products: HTTP ${res.status}`);
  }

  const json = await res.json();
  const allProducts = json.data || json.products || json || [];
  console.log(`Fetched ${allProducts.length} total products from WebBuilder.`);

  // 3. Sync Packages for each game
  console.log("\n3. Synchronizing Packages...");
  let totalImported = 0;
  let totalUpdated = 0;

  for (const def of WEBBUILDER_GAMES) {
    const productsForGame = allProducts.filter(def.filter);
    console.log(`Game: ${def.name} -> found ${productsForGame.length} products`);

    for (let i = 0; i < productsForGame.length; i++) {
      const prod = productsForGame[i];
      const supplierProductCode = String(prod.id).trim();
      if (!supplierProductCode) continue;

      const buyingPriceUsd = typeof prod.price_cents === "number" ? prod.price_cents / 100 : null;
      const isOrderable = prod.orderable !== false && prod.status !== "inactive";
      const defaultSellingPrice = buyingPriceUsd
        ? Math.round(buyingPriceUsd * 1.12 * 100) / 100
        : null;

      const existing = await pkgsColl.findOne({
        supplier: "webbuilder",
        supplierProductCode,
      });

      if (!existing) {
        await pkgsColl.insertOne({
          gameSlug: def.slug,
          gameCode: def.code,
          supplier: "webbuilder",
          supplierProductCode,
          name: prod.name,
          diamondsOrPoints: prod.name,
          buyingPrice: buyingPriceUsd,
          priceCents: prod.price_cents,
          sellingPrice: defaultSellingPrice,
          originalPrice: defaultSellingPrice ? Math.round(defaultSellingPrice * 1.15 * 100) / 100 : null,
          currency: prod.currency || "USD",
          badge: "",
          isActive: isOrderable,
          adminConfigured: true,
          sortOrder: i + 1,
          syncedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        totalImported++;
      } else {
        await pkgsColl.updateOne(
          { _id: existing._id },
          {
            $set: {
              gameSlug: def.slug,
              gameCode: def.code,
              buyingPrice: buyingPriceUsd,
              priceCents: prod.price_cents,
              isActive: isOrderable,
              sellingPrice: existing.sellingPrice || defaultSellingPrice,
              originalPrice:
                existing.originalPrice ||
                (defaultSellingPrice ? Math.round(defaultSellingPrice * 1.15 * 100) / 100 : null),
              syncedAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );
        totalUpdated++;
      }
    }
  }

  console.log(`\nSync complete! Imported: ${totalImported}, Updated: ${totalUpdated}`);

  // 4. Output summary
  const finalGames = await gamesColl.find({ supplier: "webbuilder", isActive: true }).toArray();
  console.log("\nActive WebBuilder Games in DB:");
  for (const g of finalGames) {
    const pkgCount = await pkgsColl.countDocuments({ supplier: "webbuilder", gameSlug: g.slug, isActive: true });
    console.log(`- ${g.name} (${g.slug}) | category: ${g.category} | packages: ${pkgCount} | image: ${g.image}`);
  }

  await client.close();
}

run().catch((e) => {
  console.error("Error syncing WebBuilder:", e);
  process.exit(1);
});
