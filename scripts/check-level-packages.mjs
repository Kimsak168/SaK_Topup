import fs from 'fs';
import { MongoClient } from 'mongodb';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');
const client = new MongoClient(uri);
await client.connect();

const pkgs = await client.db().collection('gamepackages').find({
  $or: [{ gameCode: 'freefire_khsgmy' }, { gameSlug: 'freefire_khsgmy' }],
  name: { $regex: /level/i }
}).toArray();

console.log('Found', pkgs.length, 'level packages:');
for (const p of pkgs) {
  console.log(`id=${p._id} [${p.supplierProductCode}] name="${p.name}" diamondsOrPoints="${p.diamondsOrPoints}"`);
}
await client.close();
