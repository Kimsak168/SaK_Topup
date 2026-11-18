import fs from 'fs';
import { MongoClient } from 'mongodb';

const ROBUX_PACKAGES = [
  { amount: 50, price: 0.45, originalPrice: 0.55 },
  { amount: 100, price: 0.90, originalPrice: 1.10 },
  { amount: 300, price: 2.50, originalPrice: 2.95 },
  { amount: 500, price: 4.30, originalPrice: 4.90 },
  { amount: 800, price: 6.80, originalPrice: 7.75 },
  { amount: 1000, price: 8.40, originalPrice: 9.60 },
  { amount: 1500, price: 12.50, originalPrice: 14.20 },
  { amount: 2000, price: 16.35, originalPrice: 18.50 },
  { amount: 2500, price: 20.50, originalPrice: 23.20 },
  { amount: 3000, price: 24.58, originalPrice: 27.80 },
  { amount: 5000, price: 40.35, originalPrice: 45.60 },
  { amount: 10000, price: 80.96, originalPrice: 91.50 },
  { amount: 15000, price: 121.98, originalPrice: 137.90 },
  { amount: 20000, price: 161.89, originalPrice: 182.90 },
];

function isMobileLegends(gameSlug, gameCode) {
  const s = String(gameSlug || '').toLowerCase();
  const c = String(gameCode || '').toLowerCase();
  return s.includes('mlbb') || c.includes('mlbb') || s === 'mobile-legends' || c === 'mobile-legends';
}

async function main() {
  const envContent = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : fs.readFileSync('.env', 'utf8');
  const uriMatch = envContent.match(/MONGODB_URI=(.*)/);
  const dbMatch = envContent.match(/MONGODB_DB_NAME=(.*)/);
  const uri = uriMatch ? uriMatch[1].trim().replace(/^['"]|['"]$/g, '') : process.env.MONGODB_URI;
  const dbName = dbMatch ? dbMatch[1].trim().replace(/^['"]|['"]$/g, '') : 'Sak_Topup';

  console.log(`Connecting to MongoDB database: ${dbName}`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  // 1. Update Game defaultMarginPercent:
  // - MLBB games get 10%
  // - Other games get 15%
  const allGames = await db.collection('games').find({}).toArray();
  for (const g of allGames) {
    const isMlbb = isMobileLegends(g.slug, g.supplierGameCode);
    const targetMargin = isMlbb ? 10 : 15;
    await db.collection('games').updateOne(
      { _id: g._id },
      { $set: { defaultMarginPercent: targetMargin, updatedAt: new Date() } }
    );
  }
  console.log(`Updated ${allGames.length} games (MLBB: 10%, others: 15%).`);

  // 2. Process all packages
  const packages = await db.collection('gamepackages').find({}).toArray();
  console.log(`Scanning ${packages.length} game packages...`);

  const bulkOps = [];
  let mlbbCount = 0;
  let robloxCount = 0;
  let otherCount = 0;
  let skippedCount = 0;

  for (const p of packages) {
    const gameSlug = p.gameSlug || p.gameCode || '';
    const isMlbb = isMobileLegends(p.gameSlug, p.gameCode);
    const isRoblox = gameSlug === 'roblox';

    if (isRoblox) {
      // Find matching Roblox package
      const match = ROBUX_PACKAGES.find(r => p.supplierProductCode === `roblox-send-${r.amount}`);
      if (match) {
        robloxCount++;
        const buyingPrice = Math.round((match.price / 1.15) * 100) / 100;
        bulkOps.push({
          updateOne: {
            filter: { _id: p._id },
            update: {
              $set: {
                buyingPrice,
                sellingPrice: match.price,
                originalPrice: match.originalPrice,
                adminConfigured: true,
                updatedAt: new Date(),
              }
            }
          }
        });
        continue;
      }
    }

    const cost = p.buyingPrice;
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) {
      skippedCount++;
      continue;
    }

    if (isMlbb) {
      // MLBB ONLY: 10% profit margin
      mlbbCount++;
      const newSellingPrice = Math.ceil((cost * 1.10 - 1e-9) * 100) / 100;
      const newOriginalPrice = p.originalPrice !== null ? Math.round(newSellingPrice * 1.15 * 100) / 100 : null;

      bulkOps.push({
        updateOne: {
          filter: { _id: p._id },
          update: {
            $set: {
              sellingPrice: newSellingPrice,
              ...(newOriginalPrice !== null ? { originalPrice: newOriginalPrice } : {}),
              adminConfigured: true,
              updatedAt: new Date(),
            }
          }
        }
      });
    } else {
      // ALL OTHER GAMES: Keep original tiered margin (15% under $10, 20% on $10 and above)
      otherCount++;
      const marginPercent = cost < 10 ? 15 : 20;
      const newSellingPrice = Math.ceil((cost * (1 + marginPercent / 100) - 1e-9) * 100) / 100;
      const newOriginalPrice = p.originalPrice !== null ? Math.round(newSellingPrice * 1.15 * 100) / 100 : null;

      bulkOps.push({
        updateOne: {
          filter: { _id: p._id },
          update: {
            $set: {
              sellingPrice: newSellingPrice,
              ...(newOriginalPrice !== null ? { originalPrice: newOriginalPrice } : {}),
              adminConfigured: true,
              updatedAt: new Date(),
            }
          }
        }
      });
    }
  }

  console.log(`Prepared ${bulkOps.length} updates:`);
  console.log(`  - Mobile Legends packages (10% profit): ${mlbbCount}`);
  console.log(`  - Roblox packages (original prices): ${robloxCount}`);
  console.log(`  - Other game packages (original 15%/20% tiered): ${otherCount}`);
  console.log(`  - Skipped: ${skippedCount}`);

  if (bulkOps.length > 0) {
    const result = await db.collection('gamepackages').bulkWrite(bulkOps);
    console.log(`BulkWrite Result: Matched ${result.matchedCount}, Modified ${result.modifiedCount}`);
  }

  // Verification samples
  const mlbbSample = await db.collection('gamepackages').find({
    isActive: true,
    $or: [{ gameSlug: 'mlbb' }, { gameCode: 'mlbb' }]
  }).limit(5).toArray();

  const ffSample = await db.collection('gamepackages').find({
    isActive: true,
    $or: [{ gameSlug: 'free-fire-khsgmy' }, { gameCode: 'free-fire-khsgmy' }]
  }).limit(5).toArray();

  const hokSample = await db.collection('gamepackages').find({
    isActive: true,
    $or: [{ gameSlug: 'hok' }, { gameCode: 'hok' }]
  }).limit(5).toArray();

  console.log('\n--- Mobile Legends (10% profit) ---');
  console.table(mlbbSample.map(p => ({
    name: p.name,
    cost: `$${p.buyingPrice.toFixed(2)}`,
    sell: `$${p.sellingPrice.toFixed(2)}`,
    profit: `+$${(p.sellingPrice - p.buyingPrice).toFixed(2)}`,
    margin: `+${Math.round(((p.sellingPrice - p.buyingPrice) / p.buyingPrice) * 1000) / 10}%`,
  })));

  console.log('\n--- Free Fire (Original tiered price) ---');
  console.table(ffSample.map(p => ({
    name: p.name,
    cost: `$${p.buyingPrice.toFixed(2)}`,
    sell: `$${p.sellingPrice.toFixed(2)}`,
    profit: `+$${(p.sellingPrice - p.buyingPrice).toFixed(2)}`,
    margin: `+${Math.round(((p.sellingPrice - p.buyingPrice) / p.buyingPrice) * 1000) / 10}%`,
  })));

  console.log('\n--- Honor of Kings (Original tiered price) ---');
  console.table(hokSample.map(p => ({
    name: p.name,
    cost: `$${p.buyingPrice.toFixed(2)}`,
    sell: `$${p.sellingPrice.toFixed(2)}`,
    profit: `+$${(p.sellingPrice - p.buyingPrice).toFixed(2)}`,
    margin: `+${Math.round(((p.sellingPrice - p.buyingPrice) / p.buyingPrice) * 1000) / 10}%`,
  })));

  await client.close();
  console.log('\nDone.');
}

main().catch(console.error);
