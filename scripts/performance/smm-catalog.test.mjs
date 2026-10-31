import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { PassThrough } from "node:stream";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");

function loader(mocks) {
  const modules = new Map();
  const load = filename => {
    filename = resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = { exports: {} };
    modules.set(filename, loaded);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const localRequire = name => {
      if (name in mocks) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/") || name.startsWith(".")) {
        const path = name.startsWith("@/") ? resolve("src", name.slice(2)) : resolve(dirname(filename), name);
        return load(existsSync(path + ".ts") ? path + ".ts" : path + ".tsx");
      }
      return require(name);
    };
    vm.runInNewContext(source, {
      module: loaded, exports: loaded.exports, require: localRequire,
      console: { error() {} }, process, performance, setTimeout, clearTimeout, Response,
    }, { filename });
    return loaded.exports;
  };
  return load;
}

function dataCache() {
  const entries = new Map();
  return {
    unstable_cache: (fn, keys, { tags }) => async (...args) => {
      const key = JSON.stringify([keys, args]);
      if (entries.has(key)) return entries.get(key).value;
      const value = await fn(...args);
      entries.set(key, { value, tags });
      return value;
    },
    revalidateTag(tag, profile) {
      assert.equal(profile.expire, 0);
      for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
    },
    revalidatePath() {},
  };
}

const defaultQuery = { page: 1, limit: 12, platform: "all", type: "all", category: "All", search: "", sort: "recommended" };
function catalogFixture() {
  const calls = { aggregate: 0, find: 0, count: 0, filters: [], selects: [] };
  const state = {
    offline: false,
    groups: [
      { _id: { platform: "tiktok", category: "Followers" }, count: 2 },
      { _id: { platform: "telegram", category: "Views" }, count: 3 },
    ],
    rows: [{ supplierServiceId: "service-1", name: "Fixture followers", category: "Followers", platform: "tiktok", serviceType: "followers", rate: 2, min: 100, max: 500, refill: false, sourceDescription: "private", fingerprint: "private" }],
  };
  const model = {
    aggregate(pipeline) {
      calls.aggregate++;
      return { option: async options => {
        assert.equal(options.maxTimeMS, 4000);
        if (state.offline) throw new Error("offline");
        const group = pipeline.find(stage => stage.$group).$group._id;
        if (typeof group === "string") return [{ _id: "duplicate", count: 2 }];
        calls.filters.push(pipeline[0].$match);
        return state.groups;
      } };
    },
    countDocuments(filter) {
      calls.count++;
      calls.filters.push(filter);
      return { maxTimeMS: async () => state.rows.length };
    },
    find(filter) {
      calls.find++;
      calls.filters.push(filter);
      return {
        select(value) { calls.selects.push(value); return this; },
        sort() { return this; }, skip() { return this; }, limit() { return this; }, maxTimeMS() { return this; },
        lean: async () => { if (state.offline) throw new Error("offline"); return state.rows; },
      };
    },
  };
  const cache = dataCache();
  const newInstance = () => loader({
    "next/cache": cache,
    "@/lib/mongodb": { connectDB: async () => {} },
    "@/models/SmmService": { SmmService: model },
  });
  return { calls, state, newInstance };
}

test("homepage summary caches three scans and never fetches individual services", async () => {
  const fixture = catalogFixture();
  const catalog = fixture.newInstance()("src/lib/services/smmPublicCatalogService.ts");
  const [summary] = await Promise.all([catalog.getPublicSmmCatalogSummary(), catalog.getPublicSmmCatalogSummary()]);
  assert.equal(summary.catalogTotal, 5);
  assert.equal(summary.platforms.find(p => p.id === "telegram").count, 3);
  assert.equal(fixture.calls.aggregate, 3);
  assert.equal(fixture.calls.find, 0);
  assert.equal(fixture.calls.count, 0);
  assert.deepEqual(Object.keys(summary).sort(), ["catalogTotal", "platforms"]);
  const filter = fixture.calls.filters[0];
  assert.equal(filter.requiresReview, false);
  assert.equal(filter.supplierAvailable, true);
  assert.equal(filter.fingerprint.$nin[0], "duplicate");
  assert.equal(filter.supplierServiceId.$nin[0], "duplicate");
});

test("catalog pages reuse metadata and cached rows while searches stay uncached and literal", async () => {
  const fixture = catalogFixture();
  const catalog = fixture.newInstance()("src/lib/services/smmPublicCatalogService.ts");
  const results = await Promise.all([catalog.getPublicSmmCatalog(defaultQuery), catalog.getPublicSmmCatalog(defaultQuery)]);
  assert.equal(fixture.calls.aggregate, 3);
  assert.equal(fixture.calls.find, 1);
  assert.equal(fixture.calls.count, 0);
  assert.equal(results[0].services[0].rate, 2.3);
  assert.equal(results[0].services[0].sourceDescription, undefined);
  assert.equal(results[0].services[0].fingerprint, undefined);
  assert.equal(fixture.calls.selects[0].includes("+rate"), true);
  const search = { ...defaultQuery, search: "[", platform: "tiktok" };
  await catalog.getPublicSmmCatalog(search);
  await catalog.getPublicSmmCatalog(search);
  assert.equal(fixture.calls.aggregate, 3);
  assert.equal(fixture.calls.find, 3);
  assert.equal(fixture.calls.count, 2);
  const filter = fixture.calls.filters.at(-1);
  assert.equal(filter.$and[0].$or[0].name.source, "\\[");
  const filtered = await catalog.getPublicSmmCatalog({ ...defaultQuery, platform: "tiktok" });
  assert.deepEqual(Array.from(filtered.categories), ["All", "Followers"]);
});

test("admin invalidation refreshes SMM pages and platform counts across instances", async () => {
  const fixture = catalogFixture();
  const first = fixture.newInstance();
  const second = fixture.newInstance();
  const a = first("src/lib/services/smmPublicCatalogService.ts");
  const b = second("src/lib/services/smmPublicCatalogService.ts");
  await a.getPublicSmmCatalog(defaultQuery);
  await b.getPublicSmmCatalog(defaultQuery);
  assert.equal(fixture.calls.find, 1);
  fixture.state.groups = [];
  fixture.state.rows = [];
  first("src/lib/services/cacheService.ts").invalidateSmmCatalogueCache();
  assert.equal((await b.getPublicSmmCatalog(defaultQuery)).total, 0);
  assert.equal((await a.getPublicSmmCatalogSummary()).catalogTotal, 0);
  assert.equal(fixture.calls.find, 2);
});

test("failed SMM queries retry, while a valid empty summary is cached", async () => {
  const fixture = catalogFixture();
  const catalog = fixture.newInstance()("src/lib/services/smmPublicCatalogService.ts");
  fixture.state.offline = true;
  await assert.rejects(catalog.getPublicSmmCatalogSummary(), /offline/);
  fixture.state.offline = false;
  fixture.state.groups = [];
  assert.equal((await catalog.getPublicSmmCatalogSummary()).catalogTotal, 0);
  const scans = fixture.calls.aggregate;
  await catalog.getPublicSmmCatalogSummary();
  assert.equal(fixture.calls.aggregate, scans);
});

test("partially successful admin changes invalidate public SMM data even when a later write fails", async () => {
  let invalidations = 0;
  let saved = 0;
  const route = loader({
    "next/server": { NextResponse: Response },
    "@/lib/auth": { requireAdminAuth: async () => ({ authorized: true, session: { username: "fixture" } }) },
    "@/lib/mongodb": { connectDB: async () => {} },
    "@/lib/services/cacheService": { invalidateSmmCatalogueCache: () => invalidations++ },
    "@/lib/services/smmCatalogService": {},
    "@/models/SmmCatalogAudit": {},
    "@/models/SmmService": { SmmService: { find: () => ({ select: async () => [
      { save: async () => { saved++; } }, { save: async () => { throw new Error("write failed"); } },
    ] }) } },
  })("src/app/api/admin/smm-services/route.ts");
  const result = await route.POST({ json: async () => ({ action: "bulk-status", status: "inactive", serviceIds: ["aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb"] }) });
  assert.equal(result.status, 500);
  assert.equal(saved, 1);
  assert.equal(invalidations, 1);
});

test("homepage streams games and banners before a slow social catalog finishes", async () => {
  const React = require("react");
  const { renderToPipeableStream } = require("react-dom/server");
  let finishPlatforms;
  const platforms = new Promise(resolve => { finishPlatforms = resolve; });
  const textComponent = text => function FixtureText() { return React.createElement("div", null, text); };
  const HomePage = loader({
    "@/lib/services/gameService": { getClientGames: async () => [] },
    "@/lib/services/bannerService": { getPublicBanners: async () => [] },
    "@/components/public/PromotionalBanner": { PromotionalBanner: textComponent("PROMOTIONS_READY") },
    "@/components/public/HomeCatalogue": { HomeCatalogue: textComponent("GAMES_READY") },
    "@/components/public/HomePlatforms": { HomePlatforms: async () => { await platforms; return "PLATFORMS_READY"; } },
    "@/components/public/HomeGameEvents": { HomeGameEvents: textComponent("EVENTS_READY") },
    "@/components/public/HomeSkeletons": { BannerSkeleton: textComponent("BANNER_LOADING"), CatalogueSkeleton: textComponent("GAMES_LOADING"), PlatformsSkeleton: textComponent("PLATFORMS_LOADING"), GameEventsSkeleton: textComponent("EVENTS_LOADING") },
  })("src/app/(public)/page.tsx").default;
  let html = "";
  const output = new PassThrough();
  output.on("data", chunk => { html += chunk; });
  const complete = new Promise(resolve => output.on("end", resolve));
  const stream = renderToPipeableStream(React.createElement(HomePage), {
    onShellReady() { stream.pipe(output); },
    onError(error) { finishPlatforms(); output.destroy(error); },
  });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.match(html, /PROMOTIONS_READY/);
    assert.match(html, /GAMES_READY/);
    assert.match(html, /PLATFORMS_LOADING/);
    assert.match(html, /EVENTS_READY/);
    assert.ok(html.indexOf("PLATFORMS_LOADING") < html.indexOf("EVENTS_READY"));
    assert.doesNotMatch(html, /PLATFORMS_READY/);
  } finally {
    finishPlatforms();
    await complete;
  }
  assert.match(html, /PLATFORMS_READY/);
});
