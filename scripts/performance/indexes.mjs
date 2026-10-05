// Additive catalogue indexes only. No documents or existing indexes are changed.
// Dry run: node scripts/performance/indexes.mjs
// Apply:   node scripts/performance/indexes.mjs --apply
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const { MongoClient } = require('mongoose').mongo;
const definitions = [
  ['games', { isActive: 1, isPopular: -1, sortOrder: 1, name: 1 }],
  ['banners', { isActive: 1, sortOrder: 1, createdAt: -1 }],
  ['gamepackages', { supplier: 1, gameCode: 1, sortOrder: 1, sellingPrice: 1 }],
  ['gamepackages', { supplier: 1, gameSlug: 1, sortOrder: 1, sellingPrice: 1 }],
];
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ dryRun: true, definitions }, null, 2));
} else {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'test');
    const added = [];
    for (const [collection, keys] of definitions) {
      added.push({ collection, index: await db.collection(collection).createIndex(keys) });
    }
    await writeFile('artifacts/performance/indexes.json', JSON.stringify(added, null, 2));
    console.log(JSON.stringify(added));
  } finally { await client.close(); }
}
