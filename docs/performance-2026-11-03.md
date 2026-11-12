# SakSuuu Top-Up performance report — 2026-11-03

Completed locally against the existing working checkout. Existing uncommitted work was retained. No deployment, production database writes, schema/index migrations, or changes to payment, checkout, supplier, order, balance, pricing, or route logic were made.

## Findings and changes

| Finding | Performance change |
| --- | --- |
| The active-game ticker rebuilt its deduplicated lists and React elements while its parent handled search input. | Memoized the ticker using React's default prop comparison. Changed game data still renders normally. |
| Package cards independently read and processed identical artwork, including images with no white border. | Shared results within each package list. Both processed artwork and confirmed no-op results are reused. The existing pixel algorithm is preserved. |
| The pixel-processing algorithm shipped in the initial package UI code. | Moved it into an on-demand module, requested after an image loads during the existing idle callback. Original artwork remains the fallback if loading or processing fails. |
| A successful server read returning the default logo was treated like missing server data. | Distinguished a confirmed default (`null`) from a failed read (`undefined`), avoiding an unnecessary logo API request. Failed reads retain the client retry. |
| Homepage scrolling scheduled redundant React state updates and cancelled/replaced pending frame callbacks. | Kept one pending animation frame and updated state only when the active section changes. Section thresholds and visible navigation behavior are preserved. |

The artwork cache is recreated when the package array changes. Keys include the delivered image URL, its revision when present, and decoded dimensions. It holds at most 32 results; strings larger than 65,536 characters are returned without retention. Failed reads are retryable. Retained result strings are bounded to approximately 4 MiB.

## Existing optimizations retained

Source inspection covered public/admin routes, client rendering and effects, catalogue reads, MongoDB models/connections, API callers, image handling, imports, and available verification scripts.

- MongoDB already reuses a global connection and an in-flight connection promise, uses a bounded pool, and disables automatic index creation during requests.
- Public catalogue queries already use projections, `.lean()`, query deadlines, tagged persistent caching, and concurrent-read deduplication. Models declare indexes for the main catalogue filters and sorts. Deployed index plans were not changed or separately benchmarked.
- Public cache invalidation already expires relevant tags after admin changes. Cache durations and invalidation rules were preserved.
- Responsive image sizes, existing formats/quality, versioned image URLs, streamed sections, route caching, and intent-based navigation prefetching were retained.
- Transactional APIs and payment/order/balance polling were unchanged. No additional financial-data caching was introduced.

## Measurements

Chrome production preview at 390 px and 1440 px, device scale factor 1 and CPU slowdown 4. The rendering benchmark blocks mutable requests and transactional/cron API reads. Results use the same four-character search (`free`) and the same 27-package game page.

| Measurement | Before | After |
| --- | ---: | ---: |
| Ticker renders during mobile search | 9 | 0 |
| Ticker renders during desktop search | 10 | 0 |
| Canvas pixel reads, each viewport | 27 | 16 |
| Distinct artwork sources, each viewport | 16 | 16 |
| Search API requests | 0 | 0 |
| Package-selection API requests | 0 | 0 |
| Browser runtime exceptions | 0 | 0 |

Canvas reads fell by 40.7%. The artwork processor is a separate 1,364-byte JavaScript chunk (821 bytes using local gzip), loaded on demand. This is a deferral, not a reduction in total code downloaded when processing is used. The measured homepage script payload was essentially unchanged: 599,053 → 599,105 decoded bytes.

Single-run mobile navigation measured 475 → 473 ms, which is within measurement noise. LCP and input timing samples varied with cache warmth and host load; they do not establish a statistically reliable latency improvement or production Core Web Vitals change.

The initial restricted preview could not access MongoDB/image hosts; one social-services request reached the existing 15-second timeout. The unrestricted final preview rendered it successfully. Those cold-request timings are not comparable and are excluded from improvement claims. Final cached game/services samples returned headers in approximately 11–15 ms locally.

## Verification

| Check | Result |
| --- | --- |
| `npm run build` | Passed using the existing Google Fonts, with network access |
| `npm run typecheck` | Passed |
| `npm test` | 105 passed, zero failures; also 105 passed before editing |
| `node --test scripts/performance/package-artwork.test.mjs` | Four passed: pixel preservation, image revision/resolution isolation, no-op reuse, retry and memory bounds |
| Additional cron, notification and SMM deposit suites | 28 passed, two failures in unchanged cron authorization code |
| Built route manifest comparison | All 102 mappings identical |
| Read-only HTTP route checks | 24 passed, including public pages, catalogue APIs, expected admin redirects/401s, validation errors and missing suppliers |
| Desktop/mobile rendering comparison | Passed: catalogue and package text, prices, links, classes, dimensions and computed styling match; delivered package-image source hashes match byte for byte |
| Scroll navigation and mobile menu | Passed: Home/Games/Services activation, menu opening, Escape closing and focus return |
| Mobile navigation regression script | Passed: intent prefetch, normal/featured/invalid package selection, deselection, current query updates, summary prices, lazy lucky-draw opening and zero customer payment-health probes |

Across all executed test suites: **137 passed, two failed**. The two additional failures are:

- `scripts/cron.test.mjs:105`: `cron endpoints reject unauthorized requests without Bearer CRON_SECRET`.
- `scripts/notifications.test.mjs:181`: `cron and notification history require authorization; invalid supplier callbacks cannot update an order`.

Both expect HTTP 401 where the existing `src/lib/cronAuth.ts` allows a throttled unauthenticated trigger and returns 200. That helper and both test files match their original tracked versions; the performance changes do not enter their module dependencies. The existing behavior was left unchanged under the requested performance-only scope. The tests ran against temporary local MongoDB instances and provider fixtures, not production records.

No end-to-end live payment or authenticated admin session was exercised. Automated appearance checks cover the homepage catalogue and game package page at the two measured viewports; they are not an exhaustive visual comparison of every route. No styling, fonts, icons, animations, components, or displayed product information were edited.

## Files changed in this task

- `src/app/(public)/layout.tsx` — preserve the logo read result.
- `src/components/public/CustomerNavbar.tsx` — avoid redundant logo requests and scroll updates.
- `src/components/public/ActiveGamesTicker.tsx` — memoize unchanged ticker content.
- `src/components/public/PackageOptions.tsx` — load processing on demand and share artwork results.
- `src/lib/packageArtwork.ts` — existing pixel algorithm with bounded result reuse.
- `scripts/performance/rendering-browser.mjs` — read-only desktop/mobile measurement and appearance comparison.
- `scripts/performance/package-artwork.test.mjs` — focused artwork regression checks.
- `docs/performance-2026-11-03.md` — this report.

Pre-existing modified files outside this list are not part of this task.

## Reproduce

With the production preview at `http://127.0.0.1:3118`, run:

```powershell
npm run build
npm run typecheck
npm test
node --test scripts/performance/package-artwork.test.mjs
node --test scripts/cron.test.mjs scripts/notifications.test.mjs scripts/performance/smm-deposit.test.mjs
node scripts/performance/rendering-browser.mjs http://127.0.0.1:3118 after before
node scripts/performance/navigation-browser.mjs http://127.0.0.1:3118 performance-after 390 --verify
node scripts/performance/navigation-http.mjs http://127.0.0.1:3118 performance-after
```

Chrome must be installed at the script's default Windows path or supplied through `CHROME_PATH`. Baseline comparisons require the retained, ignored local artifacts:

- `.local-backups/performance-20261103/before-rendering.json`
- `.local-backups/performance-20261103/after-rendering.json`
- `.local-backups/performance-20261103/route-checks.json`
- `.local-backups/navigation/performance-before-browser.json`
- `.local-backups/navigation/performance-after-browser.json`
- `.local-backups/navigation/performance-before-http.json`
- `.local-backups/navigation/performance-after-http.json`
