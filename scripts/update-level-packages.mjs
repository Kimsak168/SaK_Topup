import fs from 'fs';
import { MongoClient } from 'mongodb';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');
const client = new MongoClient(uri);
await client.connect();

const collection = client.db().collection('gamepackages');
const pkgs = await collection.find({
  $or: [{ gameCode: 'freefire_khsgmy' }, { gameSlug: 'freefire_khsgmy' }],
  name: { $regex: /level\s*up\s*package/i }
}).toArray();

console.log(`Found ${pkgs.length} Free Fire level up packages to update.`);

for (const p of pkgs) {
  const levelMatch = p.name.match(/Level\s*Up\s*Package\s*[-–—:]*\s*Level\s*(\d+)/i);
  if (levelMatch) {
    const shortName = `Level Up ${levelMatch[1]}`;
    await collection.updateOne(
      { _id: p._id },
      {
        $set: {
          name: shortName,
          diamondsOrPoints: shortName,
          updatedAt: new Date()
        }
      }
    );
    console.log(`Updated [${p.supplierProductCode}]: "${p.name}" -> "${shortName}"`);
  }
}

await client.close();
console.log('Done updating Free Fire Level Up packages.');
