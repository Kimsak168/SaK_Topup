// Verify live saved prices against the local production API without writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const { MongoClient } = require('mongoose').mongo;
const base = process.argv[2] || 'http://localhost:3100';
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'test');
  const games = await db.collection('games').find({ isActive: true }, { projection: { slug: 1, supplier: 1, supplierGameCode: 1, name: 1 } }).toArray();
  const response = await fetch(base + '/api/games');
  const catalogue = await response.json();
  assert.equal(catalogue.games.length, 11);
  assert.equal(catalogue.games.length, games.length);
  const results = [];
  for (const game of games) {
    const code = game.supplierGameCode || game.slug;
    const saved = await db.collection('gamepackages').find({ supplier: game.supplier, $or: [{ gameCode: code }, { gameSlug: { $in: [code, game.slug] } }] }, { projection: { supplierProductCode: 1, sellingPrice: 1, isActive: 1 } }).toArray();
    const res = await fetch(`${base}/api/games/${game.supplier}/${code}/packages`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.packages.length, saved.length, game.name);
    for (const pkg of json.packages) {
      const record = saved.find(r => r.supplierProductCode === pkg.supplierProductCode);
      assert.ok(record, game.name);
      assert.equal(pkg.sellingPrice, record.sellingPrice > 0 ? record.sellingPrice : null);
      assert.equal(pkg.isAvailable, record.sellingPrice > 0 && record.isActive !== false);
      for (const privateField of ['buyingPrice', 'adminConfigured', 'imageData']) assert.equal(privateField in pkg, false);
    }
    results.push({ game: game.name, total: saved.length, available: json.availablePackages, pricesMatch: true });
  }
  const admin = await fetch(base + '/api/admin/games');
  assert.equal(admin.status, 401);
  await writeFile('artifacts/performance/catalogue-verification.json', JSON.stringify({ games: results, adminProtected: true }, null, 2));
  console.log(JSON.stringify(results));
} finally { await client.close(); }
