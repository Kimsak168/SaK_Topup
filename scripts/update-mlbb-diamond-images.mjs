import fs from 'fs';
import { MongoClient } from 'mongodb';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');
const client = new MongoClient(uri);
await client.connect();

const collection = client.db().collection('gamepackages');
const specialRegex = /\b(pass|pack|package|weekly|monthly|twilight|starlight|member|subscription|bundle|membership|vip)\b/i;

const pkgs = await collection.find({
  $or: [
    { gameCode: { $regex: /mlbb/i } },
    { gameSlug: { $regex: /mlbb|mobile-legends/i } }
  ]
}).toArray();

let updatedCount = 0;
for (const p of pkgs) {
  const isSpecial = specialRegex.test(p.name || '') || specialRegex.test(p.diamondsOrPoints || '');
  if (!isSpecial) {
    await collection.updateOne(
      { _id: p._id },
      {
        $set: {
          customImage: '/images/mlbb-diamond.png',
          updatedAt: new Date()
        }
      }
    );
    updatedCount++;
  }
}

console.log(`Updated ${updatedCount} diamond packages for Mobile Legends with customImage: /images/mlbb-diamond.png`);

await client.close();
