# SakSuuu performance investigation and changes

Measured on October 4, 2026. Application changes are local and have **not been deployed**. Four additive indexes were installed in the existing Atlas database. No catalogue documents were modified.

The working tree already contained partial caching/query/index changes when this task started. Those changes were incorporated. The starting tree failed TypeScript because two `revalidateTag` calls used the old one-argument signature. The local baseline build needed that signature corrected; automatic index creation was also disabled before running it against Atlas. Production and the starting local implementation differ, so production-to-local numbers must not be interpreted as deployment improvements.

## Measured bottlenecks

- **Public supplier requests:** the deployed package endpoint called Vizo/G2Bulk during public reads. Free Fire responses took 1,248–1,840 ms; Mobile Legends took 1,247–1,990 ms, all CDN misses. Catalogue data can instead come from saved packages. The pre-existing local changes had already started that conversion; this work completed it, added shared caching, and corrected legacy slug matching.
- **Cold catalogue delivery:** the first measured `/api/games` response took 4,739 ms; subsequent CDN hits took 79 and 96 ms. An earlier homepage curl probe took 4.98 seconds overall. In the three recorded HTTP samples, homepage completion was 2,277 / 812 / 573 ms. These observations are not a statistical cold-start distribution.
- **Blocking layout:** every public layout awaited an uncached MongoDB settings lookup, with a 600 ms fallback, before returning the navbar. The layout now renders synchronously and streams the cached custom logo inside a separate Suspense boundary.
- **Image bytes:** the first mobile banner downloaded its original 1,920-pixel, 307,254-byte image. It now uses a responsive optimized image of 32,138 bytes in the same mobile viewport, a 89.5% reduction. Package images also used eager raw `<img>` elements. They now use correctly sized, lazy `next/image` images. Artwork, dimensions, colors, and final layout are retained.
- **Redundant/error paths:** an empty server package result triggered another browser package request. Successful banner reads left a four-second timeout alive, generating misleading warnings visible in Vercel logs. Empty results now remain valid empty results; failed cached queries are retried on subsequent requests, and timers are cleared.
- **Selection rendering:** clicks already made no API requests. However, they rebuilt/filter-scanned the entire package grid and used a 200 ms transition for selection colors. Stable memoized cards now update only the old/new selection; grouping is calculated when the package list changes, and selection colors update immediately.
- **Database work was small:** before changes, explain plans reported 0 ms for games/banners and 2 ms for Mobile Legends packages. Saved baseline round trips were 42–87 ms with a 556 ms initial connection. An earlier probe measured 55–122 ms and a 703 ms connection. Networking, connection setup, public supplier dependencies, and image/render work were more significant than query execution on this catalogue.

## Before/after measurements

Both local versions were built with `npm run build` and served with `next start`, using the same real Atlas data. HTTP samples contain three requests per endpoint. “Repeat average” averages requests 2 and 3. These are small laboratory samples, not production percentiles.

| Metric | Local baseline | Optimized local build |
| --- | ---: | ---: |
| Homepage HTML completion, first sample | 1,452 ms | 1,177 ms |
| Homepage HTML completion, repeat average | 59.5 ms | 31 ms |
| Mobile Legends package API, first sample | 151 ms | 148 ms |
| Mobile Legends package API, repeat average | 17 ms | 10.5 ms |
| Free Fire detail HTML, repeat average | 65 ms | 31.5 ms |
| Mobile browser home → Mobile Legends navigation | 583 ms | 525 ms |
| Package click → selected DOM, median of 12 clicks | 11.45 ms | 6.55 ms |
| Package click → two animation frames, median | 23.45 ms | 16.65 ms |
| First mobile banner encoded bytes | 307,254 | 32,138 |
| Browser homepage FCP | 1,640 ms | 1,612 ms |
| Browser homepage LCP | 1,640 ms | 1,648 ms |
| API requests caused by package selection | 0 | 0 |

Browser measurements use isolated headless Chrome, a 390×844 viewport, disabled browser cache, and 4× CPU slowdown. LCP did **not** improve meaningfully in this sample; a faster transfer or API should not be presented as a measured LCP improvement. First visits to image optimizer variants can still incur encoding/upstream costs. The corrected after HTTP/browser run overlapped briefly, so small differences include local resource contention.

A further warm mobile verification measured 315 ms navigation and 6.6 ms median selection DOM time. It also verified the summary price on every click and recorded exactly one card rendering on first selection, then two cards per change. These repeat results are in `local-after-verified-browser.json`; the table uses the first corrected run in `local-after-browser.json`. The two-frame measurement is a rendering proxy, **not** field INP or React render duration.

The Free Fire baseline detail page incorrectly returned zero purchasable packages because legacy records used `gameSlug: free-fire` without `gameCode`. The optimized page correctly includes the existing 16 packages; its HTML timing therefore includes more content. PUBG's 38 legacy packages are also found without migrating any records.

## Database, caching, and server verification

- One shared in-flight MongoDB connection promise and a bounded connection pool per warm instance; public requests no longer automatically create indexes.
- Projected lean catalogue queries; no private buying prices or image binaries in public results. Metadata, detail lookup, and package slug resolution reuse the small active-game catalogue.
- Next Data Cache entries last 300 seconds and use shared catalogue/banner/settings tags. The project keeps Next's documented non-Cache-Components model (`unstable_cache`); enabling Cache Components would require a broader migration of existing route configuration.
- Admin game/package/price/image/banner/settings writes and explicit supplier sync routes invalidate the relevant tags. Immediate expiry uses the installed version's `revalidateTag(tag, { expire: 0 })` signature. Public JSON responses use `no-store` to avoid an additional untagged CDN cache retaining an old admin price; the server data itself remains cached.
- Supplier synchronization remains authenticated and explicit. Public catalogue reads never invoke supplier catalogue APIs. The payment plugin loads through the existing checkout loader only when checkout is opened.
- New additive indexes: games `{isActive, isPopular:-1, sortOrder, name}`, banners `{isActive, sortOrder, createdAt:-1}`, and packages `{supplier, gameCode, sortOrder, sellingPrice}` / `{supplier, gameSlug, sortOrder, sellingPrice}`. No existing indexes were dropped. Explain plans now use the compound indexes and ordered index merges instead of blocking sorts. On this small dataset, package execution was 2 ms before and 5 ms after; **no database latency win is claimed** from those single explain samples. Round-trip variance was larger than query execution.
- `Server-Timing: catalogue;dur=...` measures the public service path. Warm final package calls measured 0.4–0.5 ms inside the service. `CATALOGUE_TIMING=1` enables credential-free connection/query timing logs on actual cache misses.
- Vercel deployment inspection identified Node functions in `iad1`. Runtime logs confirmed the repeated banner timeout messages. The exact duration and active CPU metrics were requested using `vercel metrics`; Vercel rejected both with `payment_required: Observability Plus is required for this query`. The rejection payloads are saved. No subscription was purchased, and no production duration or after-deployment improvement is claimed.
- Browser/local runtime testing also observed intermittent timeouts fetching G2Bulk-hosted game art. Existing Next image caching and image fallbacks are retained. A supplier image cache miss still depends on the remote image host; its availability cannot be guaranteed by these application changes.

## Preservation and functional checks

SHA-256 fingerprints of every document, including custom prices and image data, matched before/after for all **219 games, 319 packages, and 4 banners**. All **11 active games** remain present. Every active game's public package price/availability was compared directly to Atlas and matched. See `catalogue-verification.json` and the two database audit files.

`npx tsc --noEmit` and `npm run build` passed on the final source. The build retains the existing Next middleware-convention deprecation notice. Targeted ESLint passed with zero errors; two existing warnings concern an unused callback parameter and an unnecessary eslint-disable comment.

Seven automated regression tests passed: concurrent cache miss deduplication; invalidation through a separate cache client; failed/empty query handling; cleared timers; concurrent Mongo connection reuse; legacy slug/price isolation and private-field exclusion; authoritative checkout price and rejection of inactive/unpriced packages. Cache-backend behavior is mocked in these unit tests; actual cross-instance Vercel propagation remains a deployment verification step.

Mobile and 1,440-pixel desktop browser checks confirmed zero automatic package selection, immediate summary changes, no selection-triggered APIs, and retained layout. The desktop smoke test intercepted verification, payment creation/checking, and the gateway script to verify account confirmation, lazy plugin loading, checkout opening, and payment confirmation without creating real orders or charging money. An empty Valorant catalogue caused zero automatic package fetches. Unauthenticated admin API access still returned 401. Real supplier fulfillment and real payments were not executed.

## Changed files

| Files | Change |
| --- | --- |
| `next.config.ts` | Allow versioned local image URLs through the optimizer. |
| `src/lib/mongodb.ts` | Preserve concurrent connection reuse; disable automatic index creation. |
| `src/lib/services/gameService.ts` | Shared projected catalogue, canonical/legacy lookup, cached saved packages, price-write invalidation. |
| `src/lib/services/bannerService.ts` | Shared banner cache, projection, cleared timeout, versioned legacy image URLs. |
| `src/lib/services/cacheService.ts` | Shared tagged cache and invalidation helpers. |
| `src/lib/services/catalogueTiming.ts` | Cleared timeouts and optional connection/query measurements. |
| `src/lib/services/publicSettingsService.ts` | Cache only the public logo setting. |
| `src/models/Game.ts`, `Banner.ts`, `GamePackage.ts` | Matching compound index definitions. |
| `src/app/(public)/layout.tsx` | Immediate public shell and streamed logo/navbar. |
| `src/app/(public)/games/[supplier]/[code]/page.tsx` | Concurrent/deduplicated detail reads and per-game client state reset. |
| `src/app/(public)/games/[supplier]/[code]/loading.tsx`, `src/app/(public)/games/loading.tsx` | Lightweight local skeletons; shared navbar stays available. |
| `src/components/public/GameTopUpClient.tsx`, `PackageOptions.tsx` | Reuse server packages, remove empty-list refetch, memoize package cards/grouping, optimize package art. |
| `src/components/public/GameCard.tsx` | Prefetch the destination on hover or keyboard focus. |
| `src/components/public/PromotionalBanner.tsx`, `CustomerNavbar.tsx` | Responsive optimized images and supported preload API. |
| `src/app/layout.tsx` | Remove the unconditional homepage payment script; retain on-demand checkout loading. |
| `src/app/api/games/route.ts`, `src/app/api/games/[supplier]/[code]/packages/route.ts` | Cached saved data, response compatibility, server timings, uncached error responses. |
| `src/app/api/admin/games/route.ts`, `games/mlbb-configure/route.ts`, `packages/route.ts`, `packages/upload/route.ts`, `prices` via service | Invalidate catalogue after updates. |
| `src/app/api/admin/banners/route.ts`, `settings/route.ts`, `sync/games/route.ts`, `sync/packages/route.ts` | Invalidate corresponding caches, including partial sync outcomes. |
| `src/app/api/orders/route.ts`, `src/app/api/payment/anajakpay/create/route.ts` | Retain authoritative uncached pricing; reject inactive games and invalid/unavailable packages, including resumed checkout. |
| `scripts/performance/*`, `artifacts/performance/*` | Reproducible read-only benchmarks, explicit additive index command, isolated regressions, evidence, screenshots, and CPU profiles. |

## Reproduce

```powershell
npx tsc --noEmit
npm run build
node --test scripts/performance/regressions.test.mjs
$env:CATALOGUE_TIMING='1'
npm run start -- --port 3100
# In a separate terminal:
node scripts/performance/http.mjs http://localhost:3100 local-repeat
node scripts/performance/browser.mjs http://localhost:3100 mobile-repeat
node scripts/performance/browser.mjs http://localhost:3100 desktop-repeat 1440 --smoke
node scripts/performance/database.mjs repeat
node scripts/performance/catalogue.mjs http://localhost:3100
```

The browser runner currently uses the installed Windows Chrome path. HTTP runs perform GET requests only. Database audits never write records. `indexes.mjs` defaults to a dry run; only `--apply` creates the four reviewed indexes. The local test server was stopped after verification.

Evidence: [HTTP baseline](local-before-http.json), [HTTP after](local-after-http.json), [production baseline](production-before-http.json), [browser baseline](local-before-browser.json), [browser after](local-after-browser.json), [summary/render verification](local-after-verified-browser.json), [desktop smoke](desktop-after-browser.json), [before DB](before-database.json), [after DB](after-database.json), [mobile screenshot](local-after-home.png), [desktop game screenshot](desktop-after-game.png).
