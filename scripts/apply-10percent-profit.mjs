import fs from 'fs';
import { MongoClient } from 'mongodb';

async function main() {
  const envContent = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : fs.readFileSync('.env', 'utf8');
  const uriMatch = envContent.match(/MONGODB_URI=(.*)/);
  const dbMatch = envContent.match(/MONGODB_DB_NAME=(.*)/);
  const uri = uriMatch ? uriMatch[1].trim().replace(/^['"]|['"]$/g, '') : process.env.MONGODB_URI;
  const dbName = dbMatch ? dbMatch[1].trim().replace(/^['"]|['"]$/g, '') : 'Sak_Topup';

  if (!uri) throw new Error("No MONGODB_URI found.");

  console.log(`Connecting to MongoDB database: ${dbName}`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  // 1. Update all Games to defaultMarginPercent: 10
  const gamesRes = await db.collection('games').updateMany(
    {},
    { $set: { defaultMarginPercent: 10, updatedAt: new Date() } }
  );
  console.log(`Updated ${gamesRes.modifiedCount} games to defaultMarginPercent = 10.`);

  // 2. Update Settings to defaultMarginPercent: 10
  await db.collection('settings').updateMany(
    {},
    { $set: { defaultMarginPercent: 10, updatedAt: new Date() } }
  );

  // 3. Process Game Packages
  const packages = await db.collection('gamepackages').find({}).toArray();
  console.log(`Scanning ${packages.length} game packages...`);

  const bulkOps = [];
  let standardCount = 0;
  let robloxCount = 0;
  let skippedCount = 0;

  for (const p of packages) {
    let cost = p.buyingPrice;

    // Handle Roblox packages that had undefined buyingPrice
    const isRoblox = p.gameSlug === 'roblox' || p.gameCode === 'roblox';
    if (isRoblox && (!cost || cost <= 0)) {
      // Estimate wholesale cost from previous ~15% markup
      cost = Math.round((p.sellingPrice / 1.15) * 100) / 100;
      robloxCount++;
    }

    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) {
      skippedCount++;
      continue;
    }

    if (!isRoblox) standardCount++;

    // 10% profit margin
    const newSellingPrice = Math.ceil((cost * 1.10 - 1e-9) * 100) / 100;
    const newOriginalPrice = p.originalPrice !== null ? Math.round(newSellingPrice * 1.15 * 100) / 100 : null;

    bulkOps.push({
      updateOne: {
        filter: { _id: p._id },
        update: {
          $set: {
            buyingPrice: cost,
            sellingPrice: newSellingPrice,
            ...(newOriginalPrice !== null ? { originalPrice: newOriginalPrice } : {}),
            adminConfigured: true,
            updatedAt: new Date(),
          }
        }
      }
    });
  }

  console.log(`Prepared ${bulkOps.length} updates:`);
  console.log(`  - Standard packages: ${standardCount}`);
  console.log(`  - Roblox packages: ${robloxCount}`);
  console.log(`  - Skipped (invalid price): ${skippedCount}`);

  if (bulkOps.length > 0) {
    const result = await db.collection('gamepackages').bulkWrite(bulkOps);
    console.log(`BulkWrite Result: Matched ${result.matchedCount}, Modified ${result.modifiedCount}`);
  }

  // 4. Verification Check
  const sampleVerification = await db.collection('gamepackages').find({
    isActive: true,
    $or: [{ gameSlug: 'free-fire-khsgmy' }, { gameSlug: 'mlbb' }, { gameSlug: 'hok' }, { gameSlug: 'roblox' }]
  }).limit(12).toArray();

  console.log('\nVerification Sample (Active Packages with 10% Profit):');
  const preview = sampleVerification.map(p => {
    const profit = Math.round((p.sellingPrice - p.buyingPrice) * 100) / 100;
    const margin = Math.round((profit / p.buyingPrice) * 1000) / 10;
    return {
      game: p.gameSlug || p.gameCode,
      name: p.name,
      cost: `$${p.buyingPrice.toFixed(2)}`,
      sell: `$${p.sellingPrice.toFixed(2)}`,
      profit: `$${profit.toFixed(2)}`,
      margin: `+${margin}%`,
    };
  });
  console.table(preview);

  await client.close();
  console.log('\nPrice update completed successfully.');
}

main().catch(console.error);
