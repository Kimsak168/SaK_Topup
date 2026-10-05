// Unit regressions use isolated mocks: no real orders, payments, or DB writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');

function loader(mocks = {}, globals = {}) {
  const modules = new Map();
  const load = filename => {
    filename = resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = name => {
      if (name in mocks) return mocks[name];
      if (name === 'server-only') return {};
      if (name.startsWith('@/')) return load(resolve('src', name.slice(2)) + '.ts');
      if (name.startsWith('.')) return load(resolve(dirname(filename), name) + '.ts');
      return require(name);
    };
    vm.runInNewContext(source, { module, exports: module.exports, require: localRequire, console, process, performance, setTimeout, clearTimeout, ...globals }, { filename });
    return module.exports;
  };
  return load;
}

function sharedDataCache() {
  const entries = new Map();
  return {
    unstable_cache: (fn, key, { tags }) => async (...args) => {
      const id = JSON.stringify([key, args]);
      if (entries.has(id)) return entries.get(id).value;
      const value = await fn(...args);
      entries.set(id, { value, tags });
      return value;
    },
    revalidateTag: (tag, profile) => {
      assert.equal(profile.expire, 0);
      for (const [key, value] of entries) if (value.tags.includes(tag)) entries.delete(key);
    },
    revalidatePath() {},
  };
}

test('concurrent cold reads share one query; tagged invalidation reaches another instance', async () => {
  const backend = sharedDataCache();
  const first = loader({ 'next/cache': backend })('src/lib/services/cacheService.ts');
  const second = loader({ 'next/cache': backend })('src/lib/services/cacheService.ts');
  let calls = 0;
  let price = 2;
  const query = async () => { calls++; await new Promise(r => setTimeout(r, 10)); return price; };
  const read = first.cachePublicQuery('price', 'catalogue', query);
  assert.deepEqual(await Promise.all([read(), read(), read()]), [2, 2, 2]);
  assert.equal(calls, 1);
  price = 5;
  second.invalidateCatalogueCache();
  assert.equal(await read(), 5);
  assert.equal(calls, 2);
});

test('failed queries are retried; a real empty result is cached', async () => {
  const service = loader({ 'next/cache': sharedDataCache() })('src/lib/services/cacheService.ts');
  let calls = 0;
  const read = service.cachePublicQuery('empty', 'catalogue', async () => {
    if (++calls === 1) throw new Error('temporary DB failure');
    return [];
  });
  await assert.rejects(read());
  assert.equal((await read()).length, 0);
  assert.equal((await read()).length, 0);
  assert.equal(calls, 2);
});

test('catalogue timeout timer is cleared when a query finishes', async () => {
  const timers = new Set();
  const load = loader({ '@/lib/mongodb': {} }, {
    setTimeout: (...args) => { const id = setTimeout(...args); timers.add(id); return id; },
    clearTimeout: id => { timers.delete(id); clearTimeout(id); },
  });
  const timing = load('src/lib/services/catalogueTiming.ts');
  assert.equal(await timing.withCatalogueTimeout(Promise.resolve('ready'), 100), 'ready');
  assert.equal(timers.size, 0);
});

test('concurrent serverless connection requests reuse a single pending connection', async () => {
  let calls = 0;
  const mongoose = { connection: { readyState: 0 }, connect: async (_uri, options) => {
    calls++;
    assert.equal(options.autoIndex, false);
    await new Promise(r => setTimeout(r, 10));
    mongoose.connection.readyState = 1;
    return mongoose;
  } };
  const db = loader({ mongoose }, { process: { env: { MONGODB_URI: 'mongodb://test.invalid' } } })('src/lib/mongodb.ts');
  await Promise.all([db.connectDB(), db.connectDB(), db.connectDB()]);
  await db.connectDB();
  assert.equal(calls, 1);
});

function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(condition => matches(doc, condition));
    if (value && typeof value === 'object' && '$in' in value) return value.$in.includes(doc[key]);
    return doc[key] === value;
  });
}
function model(documents) {
  return { find(filter) {
    return { select() { return this; }, sort() { return this; }, maxTimeMS() { return this; }, async lean() { return documents.filter(d => matches(d, filter)); } };
  } };
}

test('legacy slugs retain configured prices, isolate games, and never expose supplier costs', async () => {
  const games = ['free-fire', 'pubg-mobile', 'mlbb'].map((slug, i) => ({
    _id: slug, slug, supplier: i === 0 ? 'vizo' : 'g2bulk', supplierGameCode: ['freefire_global', 'pubgm', 'mlbb'][i],
    name: ['Free Fire', 'PUBG Mobile', 'Mobile Legends'][i], isActive: true,
    category: 'Action', publisher: 'Publisher',
  }));
  const packages = [
    { gameSlug: 'free-fire', supplier: 'vizo', supplierProductCode: 'same-id', name: '100', sellingPrice: 2.73, isActive: true, buyingPrice: 1, customImage: '/api/packages/image/image?v=old', updatedAt: new Date(1000) },
    { gameSlug: 'pubg-mobile', supplier: 'g2bulk', supplierProductCode: 'same-id', name: '60 UC', sellingPrice: 3.41, isActive: true },
    { gameSlug: 'mlbb', gameCode: 'mlbb', supplier: 'g2bulk', supplierProductCode: 'disabled', name: '200', sellingPrice: 5, isActive: false },
    { gameSlug: 'mlbb', gameCode: 'mlbb', supplier: 'g2bulk', supplierProductCode: 'unpriced', name: '300', sellingPrice: null, isActive: true },
  ];
  const service = loader({
    react: { cache: fn => fn }, 'next/cache': sharedDataCache(),
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/Game': { Game: model(games) }, '@/models/GamePackage': { GamePackage: model(packages) },
  })('src/lib/services/gameService.ts');
  const ff = await service.getNormalizedPackages('vizo', 'freefire_global');
  assert.equal(ff.length, 1);
  assert.equal(ff[0].sellingPrice, 2.73);
  assert.equal(ff[0].group, 'diamonds');
  assert.equal(ff[0].customImage, '/api/packages/image/image?v=1000');
  assert.equal('buyingPrice' in ff[0], false);
  const pubg = await service.getNormalizedPackages('g2bulk', 'pubgm');
  assert.equal(pubg.length, 1);
  assert.equal(pubg[0].sellingPrice, 3.41);
  const mlbb = await service.getNormalizedPackages('g2bulk', 'mlbb');
  assert.equal(mlbb.length, 2);
  assert.ok(mlbb.every(p => !p.isAvailable));
  assert.equal((await service.getNormalizedPackages('vizo', 'free-fire'))[0].sellingPrice, 2.73);
  assert.equal((await service.getGameBySupplierAndCode('g2bulk', 'freefire_global')).shouldRedirect, '/games/vizo/freefire_global');
});

function checkout(sellingPrice, isActive = true, existing = false) {
  const writes = [];
  const pkg = { _id: 'p', sellingPrice, isActive, name: 'Package', supplierProductCode: 'product', buyingPrice: 1 };
  const order = { supplier: 'vizo', supplierProductCode: 'product', gameSlug: 'free-fire', paymentStatus: 'PENDING', amount: 1, save: async () => writes.push('save') };
  const route = loader({
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/Game': { Game: { findOne: () => ({ lean: async () => ({ name: 'Free Fire', requiresServer: false }) }) } },
    '@/models/GamePackage': { GamePackage: { findOne: () => ({ lean: async () => pkg }) } },
    '@/models/Order': { Order: { findOne: async () => order, create: async data => { writes.push(data); return { ...data, save: async () => {} }; } } },
    '@/models/Payment': { Payment: { findOneAndUpdate: async () => {} } },
    '@/lib/services/anajakPayService': { AnajakPayConfigError: class extends Error {}, generateAnajakPayV2Checkout: data => { writes.push({ signedAmount: data.amount }); return { checkoutUrl: 'https://example.test/checkout' }; } },
  })('src/app/api/payment/anajakpay/create/route.ts');
  return { writes, call: () => route.POST({ json: async () => existing ? { orderNumber: 'existing' } : { gameSlug: 'free-fire', supplier: 'vizo', supplierProductCode: 'product', playerId: 'test', amount: 0.01, sellingPrice: 0.01 } }) };
}

test('checkout ignores submitted price and signs the current database price', async () => {
  const flow = checkout(9.25);
  assert.equal((await flow.call()).body.amount, 9.25);
  assert.equal(flow.writes[0].amount, 9.25);
  assert.equal(flow.writes[1].signedAmount, 9.25);
});

test('unavailable or unpriced packages cannot create or resume a payment', async () => {
  for (const existing of [false, true]) {
    for (const [price, active] of [[3, false], [null, true], [0, true], [NaN, true]]) {
      const flow = checkout(price, active, existing);
      assert.equal((await flow.call()).status, 400);
      assert.equal(flow.writes.length, 0);
    }
  }
});
