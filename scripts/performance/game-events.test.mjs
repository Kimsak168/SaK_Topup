import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadTypeScript(filename, mocks = {}) {
  const fullPath = resolve(filename);
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(fullPath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/")) throw new Error(`Unexpected alias in game events test: ${name}`);
    if (name.startsWith(".")) return require(resolve(dirname(fullPath), name));
    return require(name);
  };
  vm.runInNewContext(js, { module: loaded, exports: loaded.exports, require: localRequire, Response, URL }, { filename: fullPath });
  return loaded.exports;
}

const gameTypes = {
  GAME_EVENT_GAMES: ["pubg-mobile", "mobile-legends", "free-fire", "roblox", "call-of-duty"],
  GAME_EVENT_STATUSES: ["upcoming", "live", "ended"],
};

test("game event input accepts supported events and rejects invalid games, dates, and ranges", () => {
  const input = loadTypeScript("src/lib/gameEventInput.ts", {
    "@/lib/bannerUpload": { BannerInputError: class BannerInputError extends Error {}, readBannerRequest: async () => ({}) },
    "@/lib/gameEventTypes": gameTypes,
  });
  const event = input.parseGameEventFields({
    game: "roblox",
    title: "Confirmed event",
    description: "A verified short event summary.",
    details: "Additional event details.",
    startDate: "2026-10-30",
    endDate: "2026-11-02",
    status: "upcoming",
    targetUrl: "/games",
    isActive: "true",
    sortOrder: "2",
  }, true);

  assert.equal(event.game, "roblox");
  assert.equal(event.startDate.toISOString(), "2026-10-30T00:00:00.000Z");
  assert.equal(event.targetUrl, "/games");
  assert.equal(event.isActive, true);
  assert.equal(event.sortOrder, 2);
  assert.throws(() => input.parseGameEventFields({ ...event, game: "unknown" }, true), /supported game/);
  assert.throws(() => input.parseGameEventFields({ ...event, startDate: "2026-02-30" }, true), /valid start date/);
  assert.throws(
    () => input.validateGameEventDateRange(new Date("2026-11-02T00:00:00.000Z"), new Date("2026-10-30T00:00:00.000Z")),
    /on or after the start date/
  );
});

test("game event admin endpoints reject unauthenticated requests before database access", async () => {
  let authChecks = 0;
  let databaseAccesses = 0;
  const unauthorized = new Response("Unauthorized", { status: 401 });
  const route = loadTypeScript("src/app/api/admin/game-events/route.ts", {
    "node:crypto": { randomUUID: () => "test-id" },
    mongoose: { Types: { ObjectId: class ObjectId {} } },
    "next/server": { NextResponse: { json: (body, options = {}) => new Response(JSON.stringify(body), { status: options.status || 200 }) } },
    "@/lib/auth": { requireAdminAuth: async () => { authChecks++; return { authorized: false, response: unauthorized }; } },
    "@/lib/mongodb": { connectDB: async () => { databaseAccesses++; } },
    "@/models/GameEvent": { GameEvent: new Proxy({}, { get: () => { databaseAccesses++; throw new Error("Database access before authorization"); } }) },
    "@/lib/gameEventInput": {
      GameEventInputError: class GameEventInputError extends Error {},
      parseGameEventFields: () => ({}),
      readGameEventRequest: async () => ({}),
      validateGameEventDateRange: () => {},
    },
    "@/lib/services/cacheService": { invalidateGameEventsCache: () => {} },
    "@/lib/services/blobService": { hasBlobToken: () => false, safeDeleteBlobIfOrphaned: async () => ({}), uploadToBlob: async () => ({ url: "", pathname: "" }) },
    "@/lib/services/legacyImageService": { invalidateLegacyImage: () => {} },
    "@/lib/blob-shared": { isVercelBlobUrl: () => false },
  });

  const req = { nextUrl: new URL("http://localhost/api/admin/game-events") };
  const responses = await Promise.all([
    route.GET(req),
    route.POST(req),
    route.PATCH(req),
    route.DELETE(req),
  ]);

  assert.deepEqual(responses.map(response => response.status), [401, 401, 401, 401]);
  assert.equal(authChecks, 4);
  assert.equal(databaseAccesses, 0);
});
