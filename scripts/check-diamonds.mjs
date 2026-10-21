import fs from 'fs';
import { MongoClient } from 'mongodb';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');
const client = new MongoClient(uri);
await client.connect();
const pkgs = await client.db().collection('gamepackages').find({
  $or: [{ gameCode: 'freefire_khsgmy' }, { gameSlug: 'freefire_khsgmy' }]
}).sort({ sellingPrice: 1 }).toArray();

for (const p of pkgs) {
  console.log(`${p.supplierProductCode}: name="${p.name}", diamondsOrPoints="${p.diamondsOrPoints}", price=$${p.sellingPrice}`);
}
await client.close();
