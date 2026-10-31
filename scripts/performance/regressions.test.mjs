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
    vm.runInNewContext(
      source,
      {
        module: loadedModule,
        exports: loadedModule.exports,
        require: localRequire,
        console,
        process,
        performance,
        setTimeout,
        clearTimeout,
        Buffer,
        Headers,
        Request,
        Response,
        URL,
        AbortController,
        AbortSignal,
        ...globals,
      },
      { filename }
    );
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

test('refund pagination rejects non-finite and fractional page sizes before database queries', async () => {
  const queries = [];
  const route = loader({
    'next/server': { NextResponse: Response },
    '@/lib/auth': { requireAdminAuth: async () => ({ authorized: true }) },
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/AdminAuditLog': {}, '@/models/Order': {}, '@/models/Payment': {},
    '@/lib/financeMath.mjs': {},
    '@/models/Refund': { Refund: {
      countDocuments: async () => 0,
      find: () => {
        const query = {};
        queries.push(query);
        return {
          sort() { return this; },
          skip(value) { query.skip = value; return this; },
          limit(value) { query.limit = value; return this; },
          lean: async () => [],
        };
      },
    } },
  })('src/app/api/admin/refunds/route.ts');
  for (const search of ['page=Infinity&limit=Infinity', 'page=1.5&limit=2.5', 'page=NaN&limit=NaN']) {
    const result = await route.GET({ nextUrl: new URL('http://localhost/api/admin/refunds?' + search) });
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.limit, 25);
    assert.deepEqual(queries.at(-1), { skip: 0, limit: 25 });
  }
});

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
        assert.equal(fields, 'supplier supplierGameCode requiresServer serverLabel -_id');
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

function verificationRoute(webbuilder, g2bulk, game = { supplierGameCode: 'freefire_sgmy', requiresServer: false }, globals = {}) {
  return loader({
    'next/server': { NextResponse: Response },
    '@/lib/services/verificationGameService': { getVerificationGame: async () => game },
    '@/lib/suppliers/g2bulk': { checkG2BulkPlayer: g2bulk },
    '@/lib/suppliers/webbuilder': { checkWebBuilderPlayer: webbuilder },
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
  assert.match(res.headers.get('server-timing'), /metadata;dur=.*webbuilder;dur=.*app;dur=.*total;dur=/);
  assert.ok(!res.headers.get('server-timing').includes('test-player'));
});

test('MLBB regional fallback preserves success and shares one deadline across suppliers', async () => {
  const signals = [];
  const calls = [];
  const deadlines = [];
  const timedSignals = { any: signals => AbortSignal.any(signals), timeout: ms => {
    const controller = new AbortController(); deadlines.push({ ms, controller }); return controller.signal;
  } };
  const route = verificationRoute(
    async () => ({ success: false, isUnavailable: true }),
    async (game, _id, _server, signal) => {
      signals.push(signal); calls.push(game);
      if (game === 'mlbb') return { success: false, isInvalidId: true };
      return { success: true, playerName: 'Fixture' };
    },
    { supplierGameCode: 'mlbb', requiresServer: true },
    { AbortSignal: timedSignals }
  );
  const res = await route(verificationRequest('mlbb', 'test-zone'));
  assert.equal((await res.json()).success, true);
  assert.deepEqual(calls, ['mlbb', 'mlbb_global']);
  assert.deepEqual(deadlines.map(d => d.ms), [8000, 5000, 5000]);
  deadlines[0].controller.abort();
  assert.ok(signals.every(signal => signal.aborted));
});

test('verification timeout is a shared eight-second budget, not a new ten-second wait per fallback', async () => {
  const budgets = [];
  // Accelerated real aborts exercise the route without waiting eight seconds.
  const signals = { any: signals => AbortSignal.any(signals), timeout: ms => { budgets.push(ms); return AbortSignal.timeout(ms === 8000 ? 80 : 15); } };
  const unavailable = { success: false, isUnavailable: true };
  let fallbackHadTime = false;
  const route = verificationRoute(
    async (_prod, _id, _server, signal) => {
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      return unavailable;
    },
    async (_game, _id, _server, signal) => { fallbackHadTime = !signal.aborted; return unavailable; },
    undefined,
    { AbortSignal: signals }
  );
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

test('verification adapters pass cancellation to fetch and classify it as unavailable', async () => {
  for (const [file, name, key] of [
    ['g2bulk', 'checkG2BulkPlayer', 'G2BULK_API_KEY'],
    ['webbuilder', 'checkWebBuilderPlayer', 'WEBBUILDER_API_KEY'],
  ]) {
    const controller = new AbortController();
    controller.abort();
    let captured;
    const service = loader({}, {
      process: { env: { [key]: 'fixture' } },
      AbortSignal,
      fetch: async (_url, init) => { captured = init.signal; init.signal.throwIfAborted(); },
    })(`src/lib/suppliers/${file}.ts`);
    const result = await service[name]('mlbb', 'fixture', 'fixture', controller.signal);
    assert.ok(captured);
    assert.equal(captured.aborted, true);
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
    assert.equal(options.dbName, 'test');
    assert.equal(options.serverSelectionTimeoutMS, 10000);
    assert.equal(options.connectTimeoutMS, 10000);
    assert.equal(options.socketTimeoutMS, 20000);
    assert.equal(options.maxPoolSize, 10);
    assert.equal(options.minPoolSize, 0);
    await new Promise(r => setTimeout(r, 10));
    mongoose.connection.readyState = 1;
    return mongoose;
  } };
  const db = loader({ mongoose }, { process: { env: { NODE_ENV: 'development', MONGODB_URI: 'mongodb://test.invalid' } } })('src/lib/mongodb.ts');
  await Promise.all([db.connectDB(), db.connectDB(), db.connectDB()]);
  await db.connectDB();
  assert.equal(calls, 1);
});

test('production MongoDB connection requires an explicitly configured database name', async () => {
  let calls = 0;
  const mongoose = {
    connection: { readyState: 0 },
    connect: async () => { calls++; throw new Error('Unexpected connection'); },
  };
  for (const configuredName of [undefined, '', '  ']) {
    const env = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://test.invalid' };
    if (configuredName !== undefined) env.MONGODB_DB_NAME = configuredName;
    const db = loader({ mongoose }, { process: { env } })('src/lib/mongodb.ts');
    await assert.rejects(
      db.connectDB(),
      /MONGODB_DB_NAME is required in Production\. Set it to the confirmed MongoDB database name\./
    );
  }
  assert.equal(calls, 0);
});

test('production MongoDB connection selects the configured database name', async () => {
  const configuredDatabase = 'confirmed-production-db';
  let selectedDatabase;
  const mongoose = {
    connection: { readyState: 0 },
    connect: async (_uri, options) => {
      selectedDatabase = options.dbName;
      mongoose.connection.readyState = 1;
      return mongoose;
    },
  };
  const db = loader({ mongoose }, {
    process: {
      env: {
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://test.invalid',
        MONGODB_DB_NAME: configuredDatabase,
      },
    },
  })('src/lib/mongodb.ts');

  await db.connectDB();
  assert.equal(selectedDatabase, configuredDatabase);
});

test('invalid MongoDB database names fail clearly before connecting', async () => {
  let calls = 0;
  const mongoose = {
    connection: { readyState: 0 },
    connect: async () => { calls++; throw new Error('Unexpected connection'); },
  };
  for (const configuredDatabase of [' database ', 'database/name', 'x'.repeat(64)]) {
    const db = loader({ mongoose }, {
      process: {
        env: {
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb://test.invalid',
          MONGODB_DB_NAME: configuredDatabase,
        },
      },
    })('src/lib/mongodb.ts');
    await assert.rejects(db.connectDB(), /MONGODB_DB_NAME is invalid/);
  }
  assert.equal(calls, 0);
});

test('MongoDB connection failures never log the connection string', async () => {
  const uri = 'mongodb+srv://user:secret@cluster.invalid/example';
  const logEntries = [];
  const mongoose = {
    connection: { readyState: 0 },
    connect: async () => { throw new Error(`Connection failed for ${uri}`); },
  };
  const db = loader({ mongoose }, {
    console: { error: (...args) => logEntries.push(args.join(' ')) },
    process: { env: { NODE_ENV: 'production', MONGODB_URI: uri, MONGODB_DB_NAME: 'confirmed-db' } },
  })('src/lib/mongodb.ts');

  await assert.rejects(db.connectDB(), /MongoDB connection failed/);
  assert.match(logEntries[0], /\[MongoDB\] Connection failed\./);
  assert.equal(logEntries.join(' ').includes(uri), false);
});

function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$and') return value.every(condition => matches(doc, condition));
    if (key === '$or') return value.some(condition => matches(doc, condition));
    if (value && typeof value === 'object' && '$in' in value) return value.$in.includes(doc[key]);
    if (value && typeof value === 'object' && '$exists' in value) return (doc[key] !== undefined) === value.$exists;
    // MongoDB's $ne also matches documents where the field is absent.
    if (value && typeof value === 'object' && '$ne' in value) return doc[key] !== value.$ne;
    if (value && typeof value === 'object' && '$gt' in value) return doc[key] > value.$gt;
    if (value && typeof value === 'object' && '$regex' in value) return new RegExp(value.$regex, value.$options).test(doc[key] || '');
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
    _id: slug, slug, supplier: i === 1 ? 'g2bulk' : 'webbuilder', supplierGameCode: ['freefire_khsgmy', 'pubgm', 'mlbb'][i],
    name: ['Free Fire', 'PUBG Mobile', 'Mobile Legends'][i], isActive: true,
    category: 'Action', publisher: 'Publisher',
  }));
  const packages = [
    { gameSlug: 'free-fire-khsgmy', gameCode: 'freefire_khsgmy', supplier: 'webbuilder', supplierProductCode: 'same-id', name: '100', sellingPrice: 2.73, isActive: true, buyingPrice: 1, customImage: '/api/packages/image/image?v=old', updatedAt: new Date(1000) },
    { gameSlug: 'pubg-mobile', supplier: 'g2bulk', supplierProductCode: 'same-id', name: '60 UC', sellingPrice: 3.41, isActive: true },
    { gameSlug: 'mlbb', gameCode: 'mlbb', supplier: 'webbuilder', supplierProductCode: 'disabled', name: '200', sellingPrice: 5, isActive: false },
    { gameSlug: 'mlbb', gameCode: 'mlbb', supplier: 'webbuilder', supplierProductCode: 'unpriced', name: '300', sellingPrice: null, isActive: true },
  ];
  const service = loader({
    react: { cache: fn => fn }, 'next/cache': sharedDataCache(),
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/Game': { Game: model(games) }, '@/models/GamePackage': { GamePackage: model(packages) },
  })('src/lib/services/gameService.ts');
  const ff = await service.getNormalizedPackages('webbuilder', 'freefire_sgmy');
  assert.equal(ff.length, 1);
  assert.equal(ff[0].sellingPrice, 2.73);
  assert.equal(ff[0].group, 'diamonds');
  assert.equal(ff[0].customImage, '/api/packages/image/image?v=1000');
  assert.equal('buyingPrice' in ff[0], false);
  const pubg = await service.getNormalizedPackages('g2bulk', 'pubgm');
  assert.equal(pubg.length, 1);
  assert.equal(pubg[0].sellingPrice, 3.41);
  const mlbb = await service.getNormalizedPackages('webbuilder', 'mlbb');
  assert.equal(mlbb.length, 2);
  assert.ok(mlbb.every(p => !p.isAvailable));
  assert.equal((await service.getNormalizedPackages('vizo', 'free-fire'))[0].sellingPrice, 2.73);
  assert.equal((await service.getGameBySupplierAndCode('g2bulk', 'freefire_global')).shouldRedirect, '/games/webbuilder/freefire_khsgmy');
});

function checkout(sellingPrice, isActive = true, existing = false) {
  const writes = [];
  const pkg = { _id: 'p', sellingPrice, isActive, name: 'Package', supplierProductCode: 'product', buyingPrice: 1 };
  const order = { supplier: 'g2bulk', supplierProductCode: 'product', gameSlug: 'free-fire', paymentStatus: 'PENDING', amount: 1, save: async () => writes.push('save') };
  const route = loader({
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/Game': { Game: { findOne: () => ({ lean: async () => ({ name: 'Free Fire', requiresServer: false, checkoutSupported: true, supplier: 'g2bulk' }) }) } },
    '@/models/GamePackage': { GamePackage: { findOne: () => ({ lean: async () => pkg }) } },
    '@/models/Order': { Order: { findOne: async () => order, create: async data => { writes.push(data); return { ...data, save: async () => {} }; } } },
    '@/models/Payment': { Payment: { findOneAndUpdate: async () => {} } },
    '@/lib/services/vngzzPayWayService': {
      isVngZz2Configured: () => true,
      VngZz2ConfigError: class extends Error {},
      generateVngZz2Qr: async data => { writes.push({ signedAmount: data.amount }); return { qrString: 'khqr', md5: 'test-hash' }; },
    },
  })('src/app/api/payment/vngzz2/create/route.ts');
  return { writes, call: () => route.POST({ json: async () => existing ? { orderNumber: 'existing' } : { gameSlug: 'free-fire', supplier: 'g2bulk', supplierProductCode: 'product', playerId: 'test', amount: 0.01, sellingPrice: 0.01 } }) };
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
  const { formatVngZzAmount } = loader()('src/lib/services/vngzzPayWayService.ts');
  assert.equal(formatVngZzAmount(' 1.50 '), '1.50');
  assert.equal(formatVngZzAmount(2), '2.00');
  for (const value of [Infinity, -Infinity, NaN, -1, '', ' ', '1.50USD', '1e2', '0x10', null, undefined]) {
    assert.throws(() => formatVngZzAmount(value), /Invalid payment amount/);
  }
});

test('legacy game redirects preserve the database supplier and regional Free Fire code', async () => {
  const page = loader({
    'next/navigation': { redirect: path => { throw new Error(`REDIRECT:${path}`); } },
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/Game': { Game: { findOne: () => ({ lean: async () => ({ supplier: 'g2bulk', supplierGameCode: 'custom-game' }) }) } },
  }, { console: { error() {} } })('src/app/(public)/game/[slug]/page.tsx').default;
  await assert.rejects(page({ params: Promise.resolve({ slug: 'custom-game' }) }), /REDIRECT:\/games\/g2bulk\/custom-game/);
  await assert.rejects(page({ params: Promise.resolve({ slug: 'freefire_sgmy' }) }), /REDIRECT:\/games\/webbuilder\/freefire_khsgmy/);
});

test('malformed checkout and payment-check bodies fail validation before database access', async () => {
  for (const filename of ['src/app/api/orders/route.ts', 'src/app/api/payment/vngzz2/create/route.ts', 'src/app/api/payment/vngzz2/check/route.ts']) {
    const { POST } = loader({
      'next/server': { NextResponse: Response },
      '@/lib/mongodb': { connectDB: () => assert.fail('Invalid input must not access the database') },
      '@/models/Order': {}, '@/models/Game': {}, '@/models/GamePackage': {}, '@/models/Payment': {},
      '@/lib/services/vngzzPayWayService': { VngZz2ConfigError: class extends Error {}, isVngZz2Configured: () => true },
      '@/lib/services/fulfillmentService': {},
    }, { console: { error() {} } })(filename);
    for (const body of [null, [], 'invalid', { playerId: {}, supplierProductCode: [] }, { orderNumber: { $ne: null } }]) {
      assert.equal((await POST({ json: async () => body })).status, 400, `${filename}: ${JSON.stringify(body)}`);
    }
    assert.equal((await POST({ json: async () => { throw new SyntaxError('Invalid JSON'); } })).status, 400, filename);
  }
});

test('admin payment statistics and filters include current and legacy status values', async () => {
  const documents = ['PAID', 'paid', 'successful', 'SUCCESSFUL', 'PENDING', 'pending', 'FAILED', 'failed'].map((status, i) => ({ _id: i, status, amount: 2 }));
  const { GET } = loader({
    'next/server': { NextResponse: Response },
    '@/lib/auth': { requireAdminAuth: async () => ({ authorized: true }) },
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/Order': {}, '@/lib/services/anajakPayService': {},
    '@/models/Payment': { Payment: {
      countDocuments: async filter => documents.filter(doc => matches(doc, filter)).length,
      aggregate: async pipeline => [{ total: documents.filter(doc => matches(doc, pipeline[0].$match)).reduce((sum, doc) => sum + doc.amount, 0) }],
      find: filter => ({ sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => documents.filter(doc => matches(doc, filter)) }),
    } },
  }, { URL })('src/app/api/admin/payments/route.ts');
  const res = await GET({ url: 'http://localhost/api/admin/payments?status=successful' });
  const data = await res.json();
  assert.equal(data.kpi.totalSuccess, 4);
  assert.equal(data.kpi.totalPending, 2);
  assert.equal(data.kpi.totalFailed, 2);
  assert.equal(data.kpi.totalVolume, 8);
  assert.equal(data.payments.length, 4);
  assert.ok(data.payments.every(payment => payment.status === 'successful'));
});

test('admin order search retains the selected status filter and accepts current status values', async () => {
  const documents = [
    { _id: 'a', orderNumber: 'ORD-a', playerId: 'player[1]', paymentStatus: 'PENDING', fulfillmentStatus: 'NOT_STARTED' },
    { _id: 'b', orderNumber: 'ORD-b', playerId: 'player[1]', paymentStatus: 'PAID', fulfillmentStatus: 'completed' },
    { _id: 'c', orderNumber: 'ORD-c', playerId: 'player1', paymentStatus: 'PENDING', fulfillmentStatus: 'NOT_STARTED' },
  ];
  const { GET } = loader({
    'next/server': { NextResponse: Response },
    '@/lib/auth': { requireAdminAuth: async () => ({ authorized: true }) },
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/Order': { Order: {
      countDocuments: async (filter = {}) => documents.filter(doc => matches(doc, filter)).length,
      aggregate: async () => [],
      find: filter => ({ sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => documents.filter(doc => matches(doc, filter)) }),
    } },
  }, { URL })('src/app/api/admin/orders/route.ts');
  const data = await (await GET({ url: 'http://localhost/api/admin/orders?status=pending&search=player%5B1%5D' })).json();
  assert.deepEqual(data.orders.map(order => order.id), ['a']);
  assert.equal(data.kpi.pendingCount, 2);
});

test('admin package filters combine game, price configuration, and literal search', async () => {
  const documents = [
    { _id: 'a', name: 'Package[1]', gameSlug: 'mlbb', sellingPrice: 0 },
    { _id: 'b', name: 'Package[1]', gameSlug: 'mlbb', sellingPrice: 2 },
    { _id: 'c', name: 'Package[1]', gameSlug: 'pubgm', sellingPrice: 0 },
    { _id: 'd', name: 'Package1', gameSlug: 'mlbb', sellingPrice: 0 },
  ];
  const { GET } = loader({
    'next/server': { NextResponse: Response },
    '@/lib/auth': { requireAdminAuth: async () => ({ authorized: true }) },
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/lib/services/cacheService': {},
    '@/models/Game': { Game: model([]) },
    '@/models/GamePackage': { GamePackage: {
      countDocuments: async (filter = {}) => documents.filter(doc => matches(doc, filter)).length,
      find: filter => ({ sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => documents.filter(doc => matches(doc, filter)) }),
    } },
  }, { URL })('src/app/api/admin/packages/route.ts');
  const res = await GET({ url: 'http://localhost/api/admin/packages?game=mlbb&status=unconfigured&search=Package%5B1%5D' });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).packages.map(pkg => pkg.id), ['a']);
});

test('admin package image upload persists binary data, refreshes the public image, and removes it cleanly', async () => {
  const packageId = '6ad6452f92d124dc45126343';
  const initial = {
    _id: packageId,
    gameSlug: 'mlbb',
    gameCode: 'mlbb',
    supplier: 'webbuilder',
    supplierProductCode: 'supplier-package-1',
    sellingPrice: 3.5,
    buyingPrice: 2,
    originalPrice: 4,
    isActive: true,
    supplierAvailable: false,
    adminConfigured: true,
    isFeatured: true,
    sortOrder: 12,
  };
  let stored = { ...initial };
  const imageCache = new Map();
  const writes = [];
  const GamePackage = {
    findByIdAndUpdate: (id, update) => {
      assert.equal(id, packageId);
      writes.push(update.$set);
      stored = { ...stored, ...update.$set };
      return { lean: async () => ({ ...stored }) };
    },
    findById: id => ({
      select() { return this; },
      maxTimeMS() { return this; },
      lean: async () => id === packageId ? {
        imageData: stored.imageData,
        imageContentType: stored.imageContentType,
        updatedAt: stored.updatedAt,
      } : null,
    }),
  };
  const mocks = {
    'next/server': { NextResponse: Response },
    '@/lib/auth': { requireAdminAuth: async () => ({ authorized: true }) },
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/GamePackage': { GamePackage },
    '@/lib/bannerUpload': {
      readBannerImage: async file => ({
        imageData: Buffer.from(await file.arrayBuffer()),
        imageContentType: 'image/png',
      }),
    },
    '@/lib/services/blobService': {
      hasBlobToken: () => false,
      uploadToBlob: async () => { throw new Error('Mongo persistence path should be used'); },
    },
    '@/lib/services/cacheService': { invalidateCatalogueCache() {} },
    '@/lib/services/legacyImageService': {
      invalidateLegacyImage: key => imageCache.delete(key),
    },
  };
  const { POST } = loader(mocks, { File })('src/app/api/admin/packages/upload/route.ts');
  const { GET } = loader({
    'next/server': {},
    '@/models/GamePackage': { GamePackage },
    '@/lib/services/catalogueTiming': { catalogueQuery: (_name, query) => query() },
    '@/lib/services/legacyImageService': {
      legacyImageBytes: value => value ? Buffer.from(value) : null,
      legacyImageCacheControl: () => 'public, max-age=60',
      getCachedLegacyImage: key => imageCache.get(key),
      setCachedLegacyImage: (key, value) => imageCache.set(key, value),
      fetchWithDeduplication: (_key, query) => query(),
    },
  })('src/app/api/packages/[packageId]/image/route.ts');

  async function upload(bytes) {
    const form = new FormData();
    form.set('packageId', packageId);
    form.set('image', new File([bytes], 'package.png', { type: 'image/png' }));
    return POST(new Request('http://localhost/api/admin/packages/upload', { method: 'POST', body: form }));
  }
  async function publicImage(url) {
    return GET(
      { nextUrl: new URL(`http://localhost${url}`) },
      { params: Promise.resolve({ packageId }) }
    );
  }

  const firstBytes = Buffer.from('first persistent package image');
  const firstResponse = await upload(firstBytes);
  assert.equal(firstResponse.status, 200);
  const firstBody = await firstResponse.json();
  assert.match(firstBody.package.customImage, new RegExp(`^/api/packages/${packageId}/image\\?v=`));
  assert.deepEqual(Buffer.from(stored.imageData), firstBytes);
  assert.equal(stored.imageContentType, 'image/png');
  assert.equal(stored.supplierProductCode, initial.supplierProductCode);
  assert.equal(stored.gameSlug, initial.gameSlug);
  assert.equal(stored.gameCode, initial.gameCode);
  assert.equal(stored.supplier, initial.supplier);
  assert.equal(stored.sellingPrice, initial.sellingPrice);
  assert.equal(stored.buyingPrice, initial.buyingPrice);
  assert.equal(stored.originalPrice, initial.originalPrice);
  assert.equal(stored.isActive, initial.isActive);
  assert.equal(stored.supplierAvailable, initial.supplierAvailable);
  assert.equal(stored.adminConfigured, initial.adminConfigured);
  assert.equal(stored.isFeatured, initial.isFeatured);
  assert.equal(stored.sortOrder, initial.sortOrder);
  assert.equal('customImage' in writes[0], true);
  assert.equal('imageData' in writes[0], true);
  assert.equal('supplierProductCode' in writes[0], false);
  assert.equal('sellingPrice' in writes[0], false);
  assert.equal('originalPrice' in writes[0], false);
  assert.equal('supplierAvailable' in writes[0], false);

  const firstPublicResponse = await publicImage(firstBody.package.customImage);
  assert.equal(firstPublicResponse.status, 200);
  assert.equal(firstPublicResponse.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await firstPublicResponse.arrayBuffer()), firstBytes);

  const secondBytes = Buffer.from('replacement package image');
  const secondResponse = await upload(secondBytes);
  const secondBody = await secondResponse.json();
  assert.equal(secondResponse.status, 200);
  assert.notEqual(secondBody.package.customImage, firstBody.package.customImage);
  const refreshed = await publicImage(secondBody.package.customImage);
  assert.equal(refreshed.status, 200);
  assert.deepEqual(Buffer.from(await refreshed.arrayBuffer()), secondBytes);

  const removeResponse = await POST(new Request('http://localhost/api/admin/packages/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ packageId, customImage: '' }),
  }));
  assert.equal(removeResponse.status, 200);
  assert.equal(stored.customImage, '');
  assert.equal(stored.imageData, null);
  assert.equal(stored.imageContentType, null);
  assert.equal(stored.supplierProductCode, initial.supplierProductCode);
  assert.equal(stored.sellingPrice, initial.sellingPrice);
  assert.equal(stored.originalPrice, initial.originalPrice);
  assert.equal(stored.supplierAvailable, initial.supplierAvailable);
  assert.equal((await publicImage(secondBody.package.customImage)).status, 404);
});

test('package image uploads reject invalid MIME bytes and files above the server size limit', async () => {
  const { readBannerImage, BannerInputError } = loader({}, { File })('src/lib/bannerUpload.ts');
  const sharp = require('sharp');
  const png = await sharp({
    create: { width: 1, height: 1, channels: 4, background: '#000000' },
  }).png().toBuffer();

  const valid = await readBannerImage(new File([png], 'package.png', { type: 'image/png' }));
  assert.ok(valid.imageData.length > 0);
  assert.ok(['image/png', 'image/webp'].includes(valid.imageContentType));
  await assert.rejects(
    readBannerImage(new File([png], 'package.jpg', { type: 'image/jpeg' })),
    error => error instanceof BannerInputError && error.status === 400
  );
  await assert.rejects(
    readBannerImage(new File([Buffer.from('not an image')], 'package.png', { type: 'image/png' })),
    error => error instanceof BannerInputError && error.status === 400
  );
  await assert.rejects(
    readBannerImage(new File([Buffer.alloc(4.5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })),
    error => error instanceof BannerInputError && error.status === 413
  );
});

test('package image upload and removal require admin auth and reject temporary browser URLs', async () => {
  let databaseConnections = 0;
  let packageUpdates = 0;
  const deniedResponse = new Response('Unauthorized', { status: 401 });
  const denied = loader({
    'next/server': { NextResponse: Response },
    '@/lib/auth': { requireAdminAuth: async () => ({ authorized: false, response: deniedResponse }) },
    '@/lib/mongodb': { connectDB: async () => { databaseConnections++; } },
    '@/models/GamePackage': { GamePackage: {
      findByIdAndUpdate: () => { packageUpdates++; throw new Error('Unauthorized update'); },
    } },
  })('src/app/api/admin/packages/upload/route.ts');
  const unauthorized = await denied.POST(new Request('http://localhost/api/admin/packages/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ packageId: '6ad6452f92d124dc45126343', customImage: '' }),
  }));
  assert.equal(unauthorized.status, 401);
  assert.equal(databaseConnections, 0);
  assert.equal(packageUpdates, 0);

  const { POST } = loader({
    'next/server': { NextResponse: Response },
    '@/lib/auth': { requireAdminAuth: async () => ({ authorized: true }) },
    '@/lib/mongodb': { connectDB: async () => { databaseConnections++; } },
    '@/models/GamePackage': { GamePackage: {
      findByIdAndUpdate: () => { packageUpdates++; throw new Error('Temporary URL must not be persisted'); },
    } },
  })('src/app/api/admin/packages/upload/route.ts');
  for (const customImage of ['blob:https://localhost/image-id', 'data:image/png;base64,AA==']) {
    const response = await POST(new Request('http://localhost/api/admin/packages/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ packageId: '6ad6452f92d124dc45126343', customImage }),
    }));
    assert.equal(response.status, 400);
  }
  assert.equal(databaseConnections, 0);
  assert.equal(packageUpdates, 0);

  let patchUpdates = 0;
  const packageRoute = loader({
    'next/server': { NextResponse: Response },
    '@/lib/auth': { requireAdminAuth: async () => ({ authorized: true }) },
    '@/lib/mongodb': { connectDB: async () => { databaseConnections++; } },
    '@/models/Game': { Game: {} },
    '@/models/GamePackage': { GamePackage: {
      findByIdAndUpdate: () => { patchUpdates++; throw new Error('Temporary URL must not be persisted'); },
    } },
    '@/lib/services/cacheService': { invalidateCatalogueCache() {} },
    '@/lib/services/legacyImageService': { invalidateLegacyImage() {} },
  }, { URL })('src/app/api/admin/packages/route.ts');
  for (const customImage of ['blob:https://localhost/image-id', 'data:image/png;base64,AA==', 'javascript:alert(1)']) {
    const response = await packageRoute.PATCH(new Request('http://localhost/api/admin/packages', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ packageId: '6ad6452f92d124dc45126343', customImage }),
    }));
    assert.equal(response.status, 400);
  }
  assert.equal(patchUpdates, 0);
});

test('invalid admin pagination uses finite defaults and keeps per-page limits', () => {
  const { getAdminPagination } = loader()('src/lib/adminQuery.ts');
  for (const query of ['', 'page=invalid&limit=NaN', 'page=-5&limit=-3', 'page=Infinity&limit=Infinity', 'page=1.5&limit=2.5']) {
    const result = getAdminPagination(new URLSearchParams(query));
    assert.equal(result.page, 1, query);
    assert.equal(result.limit, 25, query);
  }
  assert.equal(getAdminPagination(new URLSearchParams('page=2&limit=500')).limit, 100);
  assert.equal(getAdminPagination(new URLSearchParams(), 50, 250).limit, 50);
});

test('proxy normalizes legacy WebBuilder game links and preserves supplier-owned catalogs', async () => {
  const { proxy } = loader({
    'next/server': { NextResponse: { next: () => ({ next: true }), redirect: url => ({ location: url.pathname }) } },
    '@/lib/auth': {}, '@/lib/adminRedirect': {},
  }, { URL })('src/proxy.ts');
  const request = path => ({ nextUrl: new URL(path, 'http://localhost'), url: `http://localhost${path}` });
  for (const path of ['/game/freefire_sgmy', '/game/free-fire-sgmy']) {
    assert.equal((await proxy(request(path))).location, '/games/webbuilder/freefire_khsgmy');
  }
  for (const path of ['/games/g2bulk/freefire_sgmy', '/games/vngzz2/freefire_sgmy']) {
    assert.equal((await proxy(request(path))).next, true);
  }
  assert.equal((await proxy(request('/game/custom-game'))).next, true);
});

test('admin payment reconciliation requires the provider amount to match the order', async () => {
  for (const amount of [undefined, null, NaN, Infinity, 0.01, 9.25]) {
    const writes = [];
    const order = { _id: 'order', orderNumber: 'ORD-test', transactionId: 'TXN-test', amount: 9.25, paymentStatus: 'PENDING', paymentGateway: 'aba_payway_v2', save: async () => writes.push('order') };
    const { POST } = loader({
      'next/server': { NextResponse: Response },
      '@/lib/auth': { requireAdminAuth: async () => ({ authorized: true }) },
      '@/lib/mongodb': { connectDB: async () => {} },
      '@/models/Order': { Order: { findOne: async () => order, findById: () => ({ lean: async () => order }), findOneAndUpdate: async () => order } },
      '@/models/Payment': { Payment: { findOneAndUpdate: async () => writes.push('payment') } },
      '@/lib/services/fulfillmentService': { triggerAutomaticFulfillment: async () => { writes.push('fulfill'); return { message: 'Dispatched' }; }, reconcileSupplierFulfillment: async () => ({ message: 'Reconciled' }) },
      '@/lib/services/vngzzPayWayService': {
        checkVngZz2Transaction: async () => ({ success: true, state: 'PAID', amount, currency: 'USD', transactionId: 'TXN-test' }),
      },
    })('src/app/api/admin/orders/reconcile/route.ts');
    const res = await POST({ json: async () => ({ orderNumber: order.orderNumber }) });
    assert.equal(res.status, amount === 9.25 ? 200 : (amount === 0.01 ? 400 : 503), String(amount));
  }
});

test('VNGZZ2 prices use reseller sell_price and reject malformed or negative money', () => {
  const api = loader()('src/lib/suppliers/vngzz2.ts');
  const product = { product_code: 'MLBB_55', name: '55', sell_price: '0.76', cost_price: 0.01, status: 'active' };
  assert.equal(api.normalizeVngzzProducts({ products: [product] })[0].price, 0.76);
  assert.equal(api.normalizeVngzzProducts({ products: [{ ...product, status: 'inactive' }] })[0].available, false);
  for (const sell_price of [undefined, null, true, '', '1USD', 'Infinity', Infinity, -1]) {
    assert.throws(() => api.normalizeVngzzProducts({ products: [{ ...product, sell_price }] }), /invalid product or price/);
  }
  assert.throws(() => api.normalizeVngzzProducts({ products: [product, product] }), /invalid product or price/);
  assert.throws(() => api.normalizeVngzzGames({ total: 2, categories: [{ game_code: 'mlbb', name: 'MLBB' }] }), /incomplete catalogue/);
  assert.equal(api.isVngzzCheckoutSupported({ game_fields: ['userid', 'serverid'] }), true);
  assert.equal(api.isVngzzCheckoutSupported({ game_fields: ['userid', 'serverid', 'charname'] }), false);
});

test('VNGZZ2 regional routes and packages stay with their supplier and never expose wholesale prices', async () => {
  const games = [
    { _id: 'wb', slug: 'mlbb', supplier: 'webbuilder', supplierGameCode: 'mlbb', name: 'MLBB', category: 'MOBA', publisher: 'Publisher' },
    { _id: 'vng', slug: 'vngzz2-mlbb', supplier: 'vngzz2', supplierGameCode: 'mlbb', name: 'MLBB', category: 'MOBA', publisher: 'Publisher' },
    { _id: 'regional', slug: 'vngzz2-freefire-sgmy', supplier: 'vngzz2', supplierGameCode: 'freefire_sgmy', name: 'FF SGMY', category: 'Action', publisher: 'Publisher' },
    { _id: 'extra', slug: 'vngzz2-ragnarok-origin', supplier: 'vngzz2', supplierGameCode: 'ragnarok_origin', name: 'Ragnarok', category: 'Action', publisher: 'Publisher', checkoutSupported: false },
  ];
  const packages = [
    { gameCode: 'mlbb', gameSlug: 'mlbb', supplier: 'webbuilder', supplierProductCode: 'shared', name: '55', sellingPrice: 9, isActive: true },
    { gameCode: 'mlbb', gameSlug: 'vngzz2-mlbb', supplier: 'vngzz2', supplierProductCode: 'shared', name: '55', sellingPrice: 1, buyingPrice: 0.76, priceCents: 76, isActive: true },
    { gameCode: 'mlbb', gameSlug: 'vngzz2-mlbb', supplier: 'vngzz2', supplierProductCode: 'out-of-stock', name: '86', sellingPrice: 2, isActive: true, supplierAvailable: false },
    { gameCode: 'ragnarok_origin', gameSlug: 'vngzz2-ragnarok-origin', supplier: 'vngzz2', supplierProductCode: 'extra', name: '40', sellingPrice: 2, isActive: true },
  ];
  const service = loader({ react: { cache: fn => fn }, 'next/cache': sharedDataCache(),
    '@/lib/mongodb': { connectDB: async () => {} }, '@/models/Game': { Game: model(games.map(game => ({ ...game, isActive: true }))) }, '@/models/GamePackage': { GamePackage: model(packages) },
  })('src/lib/services/gameService.ts');
  assert.equal((await service.getGameBySupplierAndCode('vngzz2', 'freefire_sgmy')).game.code, 'freefire_sgmy');
  assert.equal((await service.getGameBySupplierAndCode('vngzz2', 'mlbb')).game.supplier, 'vngzz2');
  assert.equal((await service.getGameBySupplierAndCode('webbuilder', 'mlbb')).game.supplier, 'webbuilder');
  const result = await service.getNormalizedPackages('vngzz2', 'mlbb');
  assert.equal(result.length, 2);
  assert.equal(result[0].sellingPrice, 1);
  assert.equal(result[0].isAvailable, true);
  assert.equal(result[1].isAvailable, false);
  assert.ok(result.every(pkg => !('buyingPrice' in pkg) && !('priceCents' in pkg)));
  assert.equal((await service.getNormalizedPackages('vngzz2', 'ragnarok_origin'))[0].isAvailable, false);
});

test('VNGZZ2 sync preserves admin prices and toggles and isolates duplicate product codes by game', async () => {
  const writes = [];
  const gameWrites = [];
  const categories = ['mlbb', 'freefire_sgmy'].map(game_code => ({ game_code, name: game_code, game_fields: ['userid'] }));
  const { syncVngzzCatalogue } = loader({
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/lib/suppliers/vngzz2': { getVngzzImageUrl: () => '/image.png', isVngzzCheckoutSupported: () => true },
    '@/models/Game': { Game: {
      updateOne: async (filter, update) => { gameWrites.push({ filter, update }); return { upsertedCount: 0 }; },
      findOne: filter => ({ lean: async () => ({ slug: `vngzz2-${filter.supplierGameCode}`, isActive: true, defaultMarginPercent: 12 }) }),
    } },
    '@/models/GamePackage': { GamePackage: {
      find: () => ({ select() { return this; }, lean: async () => [{ supplierProductCode: 'shared-code', sellingPrice: 99, isActive: false, customImage: '/admin.png' }] }),
      bulkWrite: async operations => writes.push(...operations), updateMany: async () => {},
    } },
  })('src/lib/services/vngzzSyncService.ts');
  const result = await syncVngzzCatalogue({ packages: true, source: { games: categories, products: async () => [{ product_code: 'shared-code', name: '55', price: 0.76, available: true, currency: 'USD' }] } });
  assert.equal(result.games.updated, 2);
  assert.equal(result.packages.updated, 2);
  assert.equal(result.packages.failed, 0);
  assert.equal(new Set(writes.map(op => op.updateOne.filter.gameCode)).size, 2);
  for (const op of writes) {
    assert.equal(op.updateOne.filter.supplier, 'vngzz2');
    for (const key of ['sellingPrice', 'isActive', 'customImage', 'name', 'badge', 'adminConfigured']) assert.equal(key in op.updateOne.update.$set, false, key);
    assert.equal(op.updateOne.update.$setOnInsert.sellingPrice, 0.86);
  }
  for (const op of gameWrites) assert.equal('isActive' in op.update.$set, false);
});

test('VNGZZ2 fulfillment submits the stored product and reference and reconciles without resubmitting', async () => {
  const calls = [];
  const order = { _id: 'order', supplier: 'vngzz2', orderNumber: 'ORD-VNG-test', supplierProductCode: 'MLBB_55', playerId: 'player', serverId: 'zone', paymentStatus: 'PAID', fulfillmentStatus: 'processing', save: async () => {} };
  const service = loader({
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/models/Order': { Order: { findOneAndUpdate: async () => order, findOne: async () => order, findByIdAndUpdate: async () => {} } },
    '@/lib/suppliers/webbuilder': {}, '@/lib/suppliers/g2bulk': {},
    '@/lib/suppliers/vngzz2': {
      createVngzzOrder: async payload => { calls.push(payload); return { id: 'provider-id', status: 'processing', supplierStatus: 'pending', message: 'Pending' }; },
      checkVngzzOrder: async reference => { assert.equal(reference, order.orderNumber); return { id: 'provider-id', status: 'completed', supplierStatus: 'completed', message: 'Delivered' }; },
    },
  })('src/lib/services/fulfillmentService.ts');
  assert.equal((await service.triggerAutomaticFulfillment(order.orderNumber)).fulfillmentStatus, 'processing');
  assert.equal(calls[0].productCode, 'MLBB_55');
  assert.equal(calls[0].serverId, 'zone');
  assert.equal(calls[0].reference, order.orderNumber);
  assert.equal((await service.reconcileSupplierFulfillment(order.orderNumber)).fulfillmentStatus, 'completed');
  assert.equal(calls.length, 1);
});

test('VNGZZ2 package endpoint and proxy preserve supplier and exact regional codes', async () => {
  const { GET } = loader({ 'next/server': { NextResponse: Response }, '@/lib/services/gameService': {
    getNormalizedPackages: async (supplier, code) => { assert.equal(supplier, 'vngzz2'); assert.equal(code, 'freefire_sgmy'); return []; },
  } })('src/app/api/games/[supplier]/[code]/packages/route.ts');
  assert.equal((await GET({}, { params: Promise.resolve({ supplier: 'vngzz2', code: 'freefire_sgmy' }) })).status, 200);
  assert.equal((await GET({}, { params: Promise.resolve({ supplier: 'unknown', code: 'mlbb' }) })).status, 404);
  const { proxy } = loader({ 'next/server': { NextResponse: { next: () => ({ next: true }), redirect: () => assert.fail('Must preserve VNGZZ2 routes') } }, '@/lib/auth': {}, '@/lib/adminRedirect': {} }, { URL })('src/proxy.ts');
  for (const code of ['mlbb_global', 'freefire_sgmy', 'freefire_th', 'hok', 'magic_chess_gogo']) {
    const path = `/games/vngzz2/${code}`;
    assert.equal((await proxy({ nextUrl: new URL(path, 'http://localhost'), url: `http://localhost${path}` })).next, true);
  }
  assert.equal((await proxy({ nextUrl: new URL('http://localhost/game/vngzz2-freefire-sgmy'), url: 'http://localhost/game/vngzz2-freefire-sgmy' })).next, true);
});

test('VNGZZ2 checkout rejects unavailable stock and unsupported account fields before any payment is created', async () => {
  for (const filename of ['src/app/api/orders/route.ts', 'src/app/api/payment/vngzz2/create/route.ts']) {
    for (const existing of [false, true]) {
      for (const unsupported of [false, true]) {
        const pkg = { supplier: 'vngzz2', supplierProductCode: 'MLBB_55', sellingPrice: 1, isActive: true, supplierAvailable: unsupported };
        const order = { supplier: 'vngzz2', gameSlug: 'vngzz2-mlbb', supplierProductCode: 'MLBB_55', paymentStatus: 'PENDING' };
        const { POST } = loader({
          'next/server': { NextResponse: Response }, '@/lib/mongodb': { connectDB: async () => {} },
          '@/models/Game': { Game: { findOne: filter => { assert.equal(filter.supplier, 'vngzz2'); return { lean: async () => ({ isActive: true, checkoutSupported: !unsupported }) }; } } },
          '@/models/GamePackage': { GamePackage: { findOne: filter => { assert.equal(filter.supplier, 'vngzz2'); return { lean: async () => pkg }; } } },
          '@/models/Order': { Order: { findOne: async () => order, create: () => assert.fail('Unavailable games must not create orders') } },
          '@/models/Payment': { Payment: { create: () => assert.fail('Unavailable games must not create payments') } },
          '@/lib/services/vngzzPayWayService': { isVngZz2Configured: () => true, VngZz2ConfigError: class extends Error {} },
        }, { console: { error() {} } })(filename);
        const payload = existing && !filename.includes('/api/orders/') ? { orderNumber: 'ORD-test' } : { supplier: 'vngzz2', gameSlug: 'vngzz2-mlbb', supplierProductCode: 'MLBB_55', playerId: 'player' };
        assert.equal((await POST({ json: async () => payload })).status, 400, `${filename}: existing=${existing}, unsupported=${unsupported}`);
      }
    }
  }
});
