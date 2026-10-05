// Read-only Atlas query/index audit; never initializes Mongoose models or writes data.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const { MongoClient } = require('mongoose').mongo;
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 3 });
const start = performance.now();
try {
  await client.connect();
  const result = { connectionMs: Math.round(performance.now() - start), queries: [] };
  const db = client.db(process.env.MONGODB_DB_NAME || 'test');
  for (const [collection, filter, sort, projection] of [
    ['games', { isActive: true }, { isPopular: -1, sortOrder: 1, name: 1 }, { slug: 1, name: 1, supplier: 1, supplierGameCode: 1, image: 1, customImage: 1 }],
    ['banners', { isActive: true }, { sortOrder: 1, createdAt: -1 }, { title: 1, imageUrl: 1 }],
    ['gamepackages', { supplier: 'vizo', $or: [{ gameCode: 'freefire_global' }, { gameSlug: 'freefire_global' }] }, { sortOrder: 1, sellingPrice: 1 }, { supplierProductCode: 1, name: 1, sellingPrice: 1, isActive: 1 }],
    ['gamepackages', { supplier: 'g2bulk', $or: [{ gameCode: 'mlbb' }, { gameSlug: 'mlbb' }] }, { sortOrder: 1, sellingPrice: 1 }, { supplierProductCode: 1, name: 1, sellingPrice: 1, isActive: 1 }],
  ]) {
    const col = db.collection(collection);
    const times = [];
    let documents;
    for (let run = 0; run < 3; run++) {
      const t = performance.now();
      documents = await col.find(filter, { projection }).sort(sort).toArray();
      times.push(Math.round(performance.now() - t));
    }
    const plan = await col.find(filter, { projection }).sort(sort).explain('executionStats');
    result.queries.push({ collection, filter, timesMs: times, count: documents.length, execution: plan.executionStats, winningPlan: plan.queryPlanner.winningPlan, indexes: await col.indexes(), games: collection === 'games' ? documents.map(g => ({ name: g.name, supplier: g.supplier, code: g.supplierGameCode })) : undefined });
  }
  // Compare every catalogue record before/after without storing private prices or image data.
  result.fingerprints = {};
  result.packageInventory = await db.collection('gamepackages').aggregate([{ $group: { _id: { supplier: '$supplier', gameCode: '$gameCode', gameSlug: '$gameSlug' }, count: { $sum: 1 }, available: { $sum: { $cond: [{ $and: [{ $gt: ['$sellingPrice', 0] }, { $ne: ['$isActive', false] }] }, 1, 0] } } } }]).toArray();
  for (const name of ['games', 'gamepackages', 'banners']) {
    const docs = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
    result.fingerprints[name] = { count: docs.length, sha256: createHash('sha256').update(JSON.stringify(docs)).digest('hex') };
  }
  await mkdir('artifacts/performance', { recursive: true });
  const label = process.argv[2] || 'before';
  await writeFile(`artifacts/performance/${label}-database.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  console.error('Read-only database audit failed:', error.name, String(error.message).replace(/mongodb[^\s]+/gi, '[redacted]'));
  process.exitCode = 1;
} finally { await client.close(); }
