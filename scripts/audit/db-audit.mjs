import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI is not defined in environment variables.");
  process.exit(1);
}

async function runAudit() {
  console.log("Connecting to MongoDB in read-only audit mode...");
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;

  console.log("\n========================================================");
  console.log("1. MONGODB COLLECTIONS & RECORD COUNTS");
  console.log("========================================================");
  const collections = await db.listCollections().toArray();
  const collectionStats = {};

  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    collectionStats[col.name] = count;
    console.log(`- ${col.name}: ${count} records`);
  }

  console.log("\n========================================================");
  console.log("2. INDEX AUDIT ACROSS ALL COLLECTIONS");
  console.log("========================================================");
  for (const col of collections) {
    const indexes = await db.collection(col.name).indexes();
    console.log(`\nCollection [${col.name}] Indexes:`);
    for (const idx of indexes) {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} (unique: ${Boolean(idx.unique)})`);
    }
  }

  console.log("\n========================================================");
  console.log("3. AUDITING GAMES COLLECTION");
  console.log("========================================================");
  const gamesCol = db.collection("games");
  const games = await gamesCol.find({}).toArray();
  console.log(`Total Games found: ${games.length}`);

  const gameSlugs = new Map();
  const duplicateGames = [];
  const gamesMissingFields = [];

  for (const g of games) {
    const slugKey = (g.slug || "").toLowerCase().trim();
    if (gameSlugs.has(slugKey)) {
      duplicateGames.push({ slug: slugKey, ids: [gameSlugs.get(slugKey), g._id] });
    } else {
      gameSlugs.set(slugKey, g._id);
    }

    if (!g.name || !g.slug || !g.supplier) {
      gamesMissingFields.push({ id: g._id, name: g.name, slug: g.slug, supplier: g.supplier });
    }

    console.log(`  * Game: "${g.name}" (slug: ${g.slug}, supplier: ${g.supplier}, active: ${g.isActive})`);
  }

  console.log(`Duplicate game slugs: ${duplicateGames.length}`);
  if (duplicateGames.length > 0) {
    console.log(JSON.stringify(duplicateGames, null, 2));
  }
  console.log(`Games with missing required fields: ${gamesMissingFields.length}`);

  console.log("\n========================================================");
  console.log("4. AUDITING GAME PACKAGES COLLECTION");
  console.log("========================================================");
  const pkgsCol = db.collection("gamepackages");
  const totalPkgs = await pkgsCol.countDocuments();
  console.log(`Total Packages: ${totalPkgs}`);

  // Check duplicate packages: gameSlug + supplierProductCode
  const duplicatePkgs = await pkgsCol.aggregate([
    {
      $group: {
        _id: { gameSlug: "$gameSlug", supplierProductCode: "$supplierProductCode" },
        count: { $sum: 1 },
        ids: { $push: "$_id" }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  console.log(`Duplicate packages (same gameSlug + supplierProductCode): ${duplicatePkgs.length}`);
  if (duplicatePkgs.length > 0) {
    console.log("Duplicate package examples:", duplicatePkgs.slice(0, 5));
  }

  // Check invalid prices
  const invalidPricePkgs = await pkgsCol.find({
    $or: [
      { sellingPrice: { $lt: 0 } },
      { buyingPrice: { $lt: 0 } },
      { sellingPrice: { $exists: false } },
    ]
  }).toArray();
  console.log(`Packages with invalid or negative prices: ${invalidPricePkgs.length}`);

  // Check packages with null/unconfigured sellingPrice
  const unconfiguredPricePkgs = await pkgsCol.countDocuments({
    $or: [{ sellingPrice: null }, { sellingPrice: { $lte: 0 } }]
  });
  console.log(`Packages with unconfigured/zero sellingPrice: ${unconfiguredPricePkgs}`);

  // Check packages referencing non-existent games
  const allGameSlugs = new Set(games.map(g => (g.slug || "").toLowerCase().trim()));
  const orphanPkgs = await pkgsCol.aggregate([
    {
      $group: {
        _id: "$gameSlug",
        count: { $sum: 1 }
      }
    }
  ]).toArray();

  console.log("\nPackages by Game Slug:");
  for (const op of orphanPkgs) {
    const isOrphan = !allGameSlugs.has((op._id || "").toLowerCase().trim());
    console.log(`  - "${op._id}": ${op.count} packages ${isOrphan ? "⚠️ [ORPHAN - GAME NOT FOUND IN GAMES COLLECTION]" : "✓"}`);
  }

  console.log("\n========================================================");
  console.log("5. AUDITING ORDERS COLLECTION");
  console.log("========================================================");
  const ordersCol = db.collection("orders");
  const totalOrders = await ordersCol.countDocuments();
  console.log(`Total Orders: ${totalOrders}`);

  if (totalOrders > 0) {
    // Status distribution
    const orderStatuses = await ordersCol.aggregate([
      { $group: { _id: { paymentStatus: "$paymentStatus", fulfillmentStatus: "$fulfillmentStatus" }, count: { $sum: 1 } } }
    ]).toArray();
    console.log("Order Status Distribution:");
    for (const os of orderStatuses) {
      console.log(`  - Payment: ${os._id.paymentStatus}, Fulfillment: ${os._id.fulfillmentStatus}: ${os.count}`);
    }

    // Duplicate order numbers
    const dupOrders = await ordersCol.aggregate([
      { $group: { _id: "$orderNumber", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();
    console.log(`Duplicate Order Numbers: ${dupOrders.length}`);

    // Missing required fields
    const invalidOrders = await ordersCol.find({
      $or: [
        { orderNumber: { $exists: false } },
        { amount: { $exists: false } },
        { amount: { $lte: 0 } },
        { playerId: { $exists: false } }
      ]
    }).toArray();
    console.log(`Orders with missing critical fields or invalid amounts: ${invalidOrders.length}`);
  }

  console.log("\n========================================================");
  console.log("6. AUDITING PAYMENTS COLLECTION");
  console.log("========================================================");
  const paymentsCol = db.collection("payments");
  const totalPayments = await paymentsCol.countDocuments();
  console.log(`Total Payments: ${totalPayments}`);

  if (totalPayments > 0) {
    const paymentGateways = await paymentsCol.aggregate([
      { $group: { _id: { gateway: "$gateway", status: "$status" }, count: { $sum: 1 }, volume: { $sum: "$amount" } } }
    ]).toArray();
    console.log("Payment Gateway & Status Breakdown:");
    for (const pg of paymentGateways) {
      console.log(`  - Gateway: ${pg._id.gateway}, Status: ${pg._id.status}: ${pg.count} records ($${pg.volume.toFixed(2)})`);
    }

    // Duplicate paymentId
    const dupPayments = await paymentsCol.aggregate([
      { $group: { _id: "$paymentId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();
    console.log(`Duplicate Payment IDs: ${dupPayments.length}`);
  }

  console.log("\n========================================================");
  console.log("7. AUDITING ADMINS & SYSTEM SETTINGS");
  console.log("========================================================");
  const adminsCol = db.collection("admins");
  const adminUsers = await adminsCol.find({}).project({ passwordHash: 0 }).toArray();
  console.log(`Admin accounts count: ${adminUsers.length}`);
  for (const a of adminUsers) {
    console.log(`  - Admin: "${a.username}" (role: ${a.role}, active: ${a.isActive})`);
  }

  const bannersCol = db.collection("banners");
  const banners = await bannersCol.find({}).toArray();
  console.log(`Banners count: ${banners.length}`);
  for (const b of banners) {
    console.log(`  - Banner: "${b.title || b.name || b._id}" (active: ${b.isActive}, image: ${b.imageUrl ? (b.imageUrl.length > 50 ? b.imageUrl.slice(0, 50) + '...' : b.imageUrl) : 'NONE'})`);
  }

  console.log("\nDatabase audit complete.");
  await mongoose.disconnect();
}

runAudit().catch(err => {
  console.error("Audit failed:", err);
  process.exit(1);
});
