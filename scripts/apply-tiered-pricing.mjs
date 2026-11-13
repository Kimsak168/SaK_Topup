import fs from 'fs';
import { MongoClient } from 'mongodb';

async function main() {
  const envContent = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : fs.readFileSync('.env', 'utf8');
  const uriMatch = envContent.match(/MONGODB_URI=(.*)/);
  const dbMatch = envContent.match(/MONGODB_DB_NAME=(.*)/);
  const uri = uriMatch[1].trim().replace(/^['"]|['"]$/g, '');
  const dbName = dbMatch ? dbMatch[1].trim().replace(/^['"]|['"]$/g, '') : 'Sak_Topup';

  console.log('Connecting to database:', dbName);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const packages = await db.collection('gamepackages').find({}).toArray();
  console.log(`Found ${packages.length} packages to update.`);

  const bulkOps = [];
  let under10Count = 0;
  let tenPlusCount = 0;

  for (const p of packages) {
    const cost = p.buyingPrice;
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) {
      console.warn(`Skipping package ${p._id} (${p.name}) due to invalid buyingPrice: ${cost}`);
      continue;
    }

    const marginPercent = cost < 10 ? 15 : 20;
    if (cost < 10) under10Count++; else tenPlusCount++;

    const newSellingPrice = Math.ceil((cost * (1 + marginPercent / 100) - 1e-9) * 100) / 100;
    const newOriginalPrice = p.originalPrice !== null ? Math.round(newSellingPrice * 1.15 * 100) / 100 : null;

    bulkOps.push({
      updateOne: {
        filter: { _id: p._id },
        update: {
          $set: {
            sellingPrice: newSellingPrice,
            ...(p.originalPrice !== null ? { originalPrice: newOriginalPrice } : {}),
            adminConfigured: true,
            updatedAt: new Date(),
          }
        }
      }
    });
  }

  console.log(`Prepared ${bulkOps.length} updates:`);
  console.log(`  - Under $10 (15% margin): ${under10Count}`);
  console.log(`  - $10 & Above (20% margin): ${tenPlusCount}`);

  if (bulkOps.length > 0) {
    const result = await db.collection('gamepackages').bulkWrite(bulkOps);
    console.log(`\nBulkWrite Result:`);
    console.log(`  Matched: ${result.matchedCount}`);
    console.log(`  Modified: ${result.modifiedCount}`);
  }

  // Verification query
  const sampleVerification = await db.collection('gamepackages').find({ isActive: true }).limit(6).toArray();
  console.log('\nVerification Sample (Active Packages):');
  for (const p of sampleVerification) {
    const profit = Math.round((p.sellingPrice - p.buyingPrice) * 100) / 100;
    const margin = Math.round((profit / p.buyingPrice) * 1000) / 10;
    console.log(`  "${p.name}" (${p.gameCode || p.gameSlug}): cost=$${p.buyingPrice} -> sell=$${p.sellingPrice} (profit=$${profit}, margin=+${margin}%)`);
  }

  await client.close();
  console.log('\nDone.');
}

main().catch(console.error);

