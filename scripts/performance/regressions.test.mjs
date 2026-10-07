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
    const loadedModule = { exports: {} };
    modules.set(filename, loadedModule);
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
    vm.runInNewContext(source, { module: loadedModule, exports: loadedModule.exports, require: localRequire, console, process, performance, setTimeout, clearTimeout, ...globals }, { filename });
    return loadedModule.exports;
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

test('admin return paths stay inside the dashboard and cannot loop back to login', () => {
  const { getAdminRedirect } = loader({}, { URL })('src/lib/adminRedirect.ts');
  assert.equal(getAdminRedirect('/admin/orders?page=2#latest'), '/admin/orders?page=2#latest');
  for (const path of [null, '', 'https://evil.test', '//evil.test', '/\\evil.test',
    'javascript:alert(1)', '/administrator', '/admin/login', '/admin/login/',
    '/admin/../checkout', '/admin/%2e%2e/checkout', '/admin/%2f../checkout',
    '/admin/%5cevil', '/admin/%00', '/admin/\norders', '/admin/%']) {
    assert.equal(getAdminRedirect(path), '/admin', String(path));
  }
});

function authModule(env) {
  return loader({ 'next/server': { NextResponse: Response } }, {
    process: { env }, crypto: require('node:crypto').webcrypto,
    TextEncoder, TextDecoder, atob, btoa, console: { error() {} },
  })('src/lib/auth.ts');
}

test('admin tokens require a configured secret and valid, unexpired session claims', async () => {
  const secret = 'test-only-secret-with-at-least-32-characters';
  const auth = authModule({ AUTH_SECRET: secret });
  const session = { username: 'admin', name: 'Administrator', role: 'Admin' };
  const valid = await auth.signAdminToken(session);
  assert.equal((await auth.verifyAdminToken(valid)).username, 'admin');
  assert.equal(await auth.verifyAdminToken(await auth.signAdminToken(session, 0)), null);
  assert.equal(await auth.verifyAdminToken(await auth.signAdminToken(session, -1)), null);
  const now = Math.floor(Date.now() / 1000);
  const sign = (claims, header = { alg: 'HS256', typ: 'JWT' }) => {
    const message = [header, claims].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return `${message}.${require('node:crypto').createHmac('sha256', secret).update(message).digest('base64url')}`;
  };
  for (const claims of [session, { ...session, exp: 0, iat: now },
    { ...session, exp: String(now + 3600), iat: now },
    { ...session, exp: now + 3600, iat: now + 10 },
    { ...session, exp: now + 3600, iat: now, role: 'Customer' },
    { ...session, exp: now + 3600, iat: now, username: '' }]) {
    assert.equal(await auth.verifyAdminToken(sign(claims)), null);
  }
  assert.equal(await auth.verifyAdminToken(sign({ ...session, exp: now + 3600, iat: now }, { alg: 'none', typ: 'JWT' })), null);
  const missing = authModule({});
  await assert.rejects(missing.signAdminToken(session), /AUTH_SECRET/);
  assert.equal(await missing.verifyAdminToken(valid), null);
});

function adminService({ env = {}, account = null, count = 0, offline = false } = {}) {
  return loader({
    '@/lib/mongodb': { connectDB: async () => { if (offline) throw new Error('offline'); } },
    '@/models/Admin': { Admin: {
      findOne: async () => account,
      countDocuments: async () => count,
      updateOne: () => ({ exec: async () => {} }),
    } },
  }, { Buffer, process: { env }, console: { error() {} } })('src/lib/services/adminService.ts');
}

test('admin authentication preserves password whitespace and rejects malformed password hashes', async () => {
  const service = adminService();
  const password = '  long-password  ';
  const hash = service.hashPassword(password);
  assert.equal(service.verifyPassword(password, hash), true);
  assert.equal(service.verifyPassword(password.trim(), hash), false);
  for (const hash of ['salt:', ':', 'salt:zz', 'salt:ab', '']) {
    assert.equal(service.verifyPassword(password, hash), false);
  }
  const auth = adminService({ account: { _id: '1', username: 'admin', isActive: true, passwordHash: hash } });
  assert.equal((await auth.authenticateAdmin('admin', password)).success, true);
  assert.equal((await auth.authenticateAdmin('admin', password.trim())).success, false);
  assert.equal((await auth.authenticateAdmin({}, [])).success, false);
});

test('environment admin login is explicit bootstrap only and cannot bypass disabled accounts or database failures', async () => {
  const env = { ADMIN_USERNAME: 'bootstrap', ADMIN_PASSWORD: 'test-password' };
  assert.equal((await adminService().authenticateAdmin('admin', 'saksuuu2025!')).success, false);
  assert.equal((await adminService({ env }).authenticateAdmin('bootstrap', 'test-password')).success, true);
  for (const options of [{ count: 1 }, { offline: true }, { account: { isActive: false } }]) {
    assert.equal((await adminService({ env, ...options }).authenticateAdmin('bootstrap', 'test-password')).success, false);
  }
});

test('malformed login payloads return a validation error before authentication', async () => {
  const { POST } = loader({
    'next/server': { NextResponse: Response }, '@/lib/auth': {},
    '@/lib/services/adminService': { authenticateAdmin: () => assert.fail('Must not authenticate invalid input') },
  })('src/app/api/admin/auth/login/route.ts');
  for (const body of [null, {}, [], { username: {}, password: [] }, { username: '  ', password: 'password' }]) {
    assert.equal((await POST({ json: async () => body })).status, 400);
  }
});

test('order search treats regex characters literally and reports database outages', async () => {
  let filter;
  let offline = false;
  const { GET } = loader({
    'next/server': { NextResponse: Response },
    '@/lib/mongodb': { connectDB: async () => { if (offline) throw new Error('offline'); } },
    '@/models/Order': { Order: { find: value => {
      filter = value;
      return { sort() { return this; }, limit() { return this; }, lean: async () => [] };
    } } },
  }, { URL, console: { warn() {} } })('src/app/api/orders/track/route.ts');
  for (const query of ['.*', '[', 'ORD-(123)', 'ABC$^+?{x}|\\']) {
    const res = await GET({ url: `http://localhost/api/orders/track?query=${encodeURIComponent(query)}` });
    assert.equal(res.status, 200);
    assert.equal(filter.$or[0].orderNumber.$regex.test(query), true);
    assert.equal(filter.$or[0].orderNumber.$regex.test('unrelated-order'), false);
  }
  assert.equal((await GET({ url: `http://localhost/api/orders/track?query=${'x'.repeat(129)}` })).status, 400);
  offline = true;
  const res = await GET({ url: 'http://localhost/api/orders/track?query=ORD-123' });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).success, false);
});

test('verification caches only public game rules and admin invalidation refreshes them', async () => {
  const backend = sharedDataCache();
  let queries = 0;
  let needsServer = false;
  const load = loader({
    'next/cache': backend,
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/Game': { Game: { findOne: () => {
      queries++;
      return { select: fields => {
        assert.equal(fields, 'supplierGameCode requiresServer serverLabel -_id');
        return { maxTimeMS: () => ({ lean: async () => ({ supplierGameCode: 'mlbb', requiresServer: needsServer }) }) };
      } };
    } } },
  });
  const { getVerificationGame } = load('src/lib/services/verificationGameService.ts');
  await getVerificationGame('g2bulk', 'mlbb');
  await getVerificationGame('g2bulk', 'mlbb');
  assert.equal(queries, 1);
  needsServer = true;
  load('src/lib/services/cacheService.ts').invalidateCatalogueCache();
  assert.equal((await getVerificationGame('g2bulk', 'mlbb')).requiresServer, true);
  assert.equal(queries, 2);
});

function verificationRoute(vizo, g2bulk, game = { supplierGameCode: 'freefire_sgmy', requiresServer: false }, globals = {}) {
  return loader({
    'next/server': { NextResponse: Response },
    '@/lib/services/verificationGameService': { getVerificationGame: async () => game },
    '@/lib/suppliers/vizo': { checkVizoPlayer: vizo },
    '@/lib/suppliers/g2bulk': { checkG2BulkPlayer: g2bulk },
  }, { Headers, AbortSignal, ...globals })('src/app/api/player/verify/route.ts').POST;
}

function verificationRequest(code = 'freefire_sgmy', serverId) {
  return new Request('http://localhost/api/player/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, userId: 'test-player', serverId }),
  });
}

test('verification keeps invalid IDs distinct, never calls fallback for invalid Free Fire, and never caches responses', async () => {
  const route = verificationRoute(async () => ({ success: false, isInvalidId: true }), () => { throw new Error('Unexpected fallback'); });
  const res = await route(verificationRequest());
  assert.equal(res.status, 400);
  assert.equal((await res.json()).isInvalidId, true);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('server-timing'), /metadata;dur=.*vizo;dur=.*app;dur=.*total;dur=/);
  assert.ok(!res.headers.get('server-timing').includes('test-player'));
});

test('MLBB regional fallback preserves success and shares one deadline across all suppliers', async () => {
  const signals = [];
  const calls = [];
  const deadlines = [];
  const timedSignals = { any: signals => AbortSignal.any(signals), timeout: ms => {
    const controller = new AbortController(); deadlines.push({ ms, controller }); return controller.signal;
  } };
  const route = verificationRoute(async (_game, _id, _server, signal) => {
    signals.push(signal); calls.push('vizo'); return { success: true, playerName: 'Fixture' };
  }, async (game, _id, _server, signal) => {
    signals.push(signal); calls.push(game); return { success: false, isInvalidId: true };
  }, { supplierGameCode: 'mlbb', requiresServer: true }, { AbortSignal: timedSignals });
  const res = await route(verificationRequest('mlbb', 'test-zone'));
  assert.equal((await res.json()).success, true);
  assert.deepEqual(calls, ['mlbb', 'mlbb_global', 'vizo']);
  assert.deepEqual(deadlines.map(d => d.ms), [8000, 5000, 5000, 5000]);
  deadlines[0].controller.abort();
  assert.ok(signals.every(signal => signal.aborted));
});

test('verification timeout is a shared eight-second budget, not a new ten-second wait per fallback', async () => {
  const budgets = [];
  // Accelerated real aborts exercise the route without waiting eight seconds.
  const signals = { any: signals => AbortSignal.any(signals), timeout: ms => { budgets.push(ms); return AbortSignal.timeout(ms === 8000 ? 80 : 15); } };
  const unavailable = { success: false, isUnavailable: true };
  let fallbackHadTime = false;
  const route = verificationRoute(async (_game, _id, _server, signal) => {
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    return unavailable;
  }, async (_game, _id, _server, signal) => { fallbackHadTime = !signal.aborted; return unavailable; }, undefined, { AbortSignal: signals });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const res = await route(verificationRequest());
    const body = await res.json();
    assert.equal(body.isUnavailable, true);
    assert.equal(body.isInvalidId, undefined);
    assert.deepEqual(budgets, [8000, 5000, 5000]);
    assert.equal(fallbackHadTime, true);
  } finally { clearTimeout(keepAlive); }
});

test('both verification adapters pass cancellation to fetch and classify it as unavailable', async () => {
  for (const [file, name] of [['vizo', 'checkVizoPlayer'], ['g2bulk', 'checkG2BulkPlayer']]) {
    const controller = new AbortController();
    controller.abort();
    let captured;
    const service = loader({}, {
      process: { env: { VIZO_API_KEY: 'fixture', G2BULK_API_KEY: 'fixture' } },
      AbortSignal,
      fetch: async (_url, init) => { captured = init.signal; init.signal.throwIfAborted(); },
    })(`src/lib/suppliers/${file}.ts`);
    const result = await service[name]('mlbb', 'fixture', 'fixture', controller.signal);
    assert.equal(captured, controller.signal);
    assert.equal(result.isUnavailable, true);
    assert.equal(result.isInvalidId, undefined);
  }
});

test('legacy images preserve binary bytes and cache only a matching revision immutably', () => {
  const { mongo } = require('mongoose');
  const { legacyImageBytes, legacyImageCacheControl } = loader({}, { Uint8Array })('src/lib/services/legacyImageService.ts');
  const bytes = Buffer.from([0, 255, 13, 10, 128, 42]);
  assert.deepEqual(Buffer.from(legacyImageBytes(new mongo.Binary(bytes))), bytes);
  assert.deepEqual(Buffer.from(legacyImageBytes(bytes)), bytes);
  assert.equal(legacyImageBytes(undefined), null);
  const updated = new Date('2026-10-05T00:00:00.000Z');
  const short = 'public, max-age=60';
  assert.equal(legacyImageCacheControl(null, updated, short), short);
  assert.equal(legacyImageCacheControl('NaN', undefined, short), short);
  assert.equal(legacyImageCacheControl('old-version', updated, short), short);
  assert.match(legacyImageCacheControl(String(updated.getTime()), updated, short), /s-maxage=31536000, immutable/);
});

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

test('payment amounts reject non-finite numbers and partially numeric strings', () => {
  const { formatAnajakAmount } = loader()('src/lib/services/anajakPayService.ts');
  assert.equal(formatAnajakAmount(' 1.50 '), '1.50');
  assert.equal(formatAnajakAmount(2), '2.00');
  for (const value of [Infinity, -Infinity, NaN, -1, '', ' ', '1.50USD', '1e2', '0x10', null, undefined]) {
    assert.throws(() => formatAnajakAmount(value), /Invalid payment amount/);
  }
});

function webhook({ signed = false, amount = 9.25, paid = false } = {}) {
  const writes = [];
  let inquiries = 0;
  const order = { _id: 'order', orderNumber: 'ORD-test', transactionId: 'TXN-test', amount: 9.25, currency: 'USD', paymentStatus: paid ? 'PAID' : 'PENDING' };
  const formatAnajakAmount = loader()('src/lib/services/anajakPayService.ts').formatAnajakAmount;
  const { POST } = loader({
    'next/server': { NextResponse: Response },
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/Order': { Order: {
      findOne: async () => order,
      findByIdAndUpdate: async () => assert.fail('Must not downgrade payment'),
      findOneAndUpdate: async (filter, update) => {
        assert.deepEqual(Array.from(filter.paymentStatus.$in), ['PENDING', 'pending']);
        writes.push(update); return order;
      },
    } },
    '@/models/Payment': { Payment: { findOneAndUpdate: async () => writes.push('payment') } },
    '@/lib/services/fulfillmentService': { triggerAutomaticFulfillment: async () => writes.push('fulfill') },
    '@/lib/services/anajakPayService': {
      verifyAnajakPayWebhookSignature: () => signed,
      formatAnajakAmount,
      checkAnajakPayTransactionV2: async () => { inquiries++; return { status: 'PAID', amount }; },
    },
  }, { console: { log() {}, warn() {}, error() {} } })('src/app/api/payment/anajakpay/webhook/route.ts');
  return {
    writes, inquiries: () => inquiries,
    call: body => POST(new Request('http://localhost/api/payment/anajakpay/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })),
  };
}

test('unsigned payment callbacks use the provider amount and status, not callback claims', async () => {
  const body = { transaction_id: 'TXN-test', amount: 9.25, status: 'SUCCESS' };
  const mismatch = webhook({ amount: 0.01 });
  assert.equal((await mismatch.call(body)).status, 400);
  assert.equal(mismatch.writes.length, 0);
  const missing = webhook({ amount: null });
  assert.equal((await missing.call(body)).status, 503);
  assert.equal(missing.writes.length, 0);
  for (const extra of [{}, { amount: 0.01, status: 'FAILED', currency: 'invalid' }]) {
    const flow = webhook();
    assert.equal((await flow.call({ transaction_id: 'TXN-test', ...extra })).status, 200);
    assert.equal(flow.inquiries(), 1);
    assert.equal(flow.writes.length, 3);
    assert.equal(flow.writes[0].$set.paymentStatus, 'PAID');
  }
});

test('payment callbacks cannot downgrade paid orders and duplicate callbacks never fulfill again', async () => {
  const body = { transaction_id: 'TXN-test', req_time: 'now', hash: 'test', amount: 9.25, status: 'FAILED' };
  const failed = webhook({ signed: true, paid: true });
  assert.equal((await failed.call(body)).status, 400);
  assert.equal(failed.writes.length, 0);
  const duplicate = webhook({ signed: true, paid: true });
  assert.equal((await duplicate.call({ ...body, status: 'SUCCESS' })).status, 200);
  assert.equal(duplicate.writes.length, 0);
  const malformed = webhook();
  assert.equal((await malformed.call(null)).status, 400);
  assert.equal(malformed.inquiries(), 0);
});
