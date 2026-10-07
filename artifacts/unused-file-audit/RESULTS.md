# File cleanup results — 2026-10-05

The read-only audit preceded all deletions. Only the 28 files classified SAFE TO DELETE in [REPORT.md](REPORT.md) were removed. The [cleanup log](cleanup-log.json) records every deleted path, byte count, SHA-256 and Git restore commit. No production database records were changed.

## Deleted

- Six intermediate banner screenshots (`local-fixed-*`, `local-fixed-stable-*`, `local-ratio-check-*`). Final and before screenshots remain.
- Three unused Next starter decorations: `public/file.svg`, `public/globe.svg`, `public/window.svg`. Source/config/script references and all string values in the verified BSON backup were checked offline.
- Six unused root components: `Footer`, `GameCard`, `GameSearch`, `HowItWorks`, `Navbar`, `PromotionalBanner`.
- Unused `src/components/public/HowItWorks.tsx`.
- Twelve unused UI primitives in `src/components/ui/`: badge, button, card, dialog, input, label, select, skeleton, sonner, table, tabs, textarea. These were unreachable from all route/configuration/script roots; the unused dialog/button dependency was removed together.

## Kept and awaiting review

176 tracked files classified KEEP remain. All active Next routes, middleware, layouts, CSS, hooks, utilities, models, database connections, auth, payment/webhook endpoints, supplier integrations, Blob integration, package/config files, logos and current artwork remain. Private environment files, database backups, MongoDB restore tools and current package-audit evidence remain.

38 REVIEW REQUIRED files remain, individually listed in REPORT.md. These include historical screenshots, smoke/performance evidence and two manual scripts (`inspect-db.mjs`, `verify-admin-ui.mjs`). No review candidate was deleted.

The current audit/backup scripts are retained as operational tools. No dependency packages or CSS rules were removed merely because a component was unused.

## Size and performance

The original tracked project inventory was 28,493,034 bytes (28.49 MB). Deleted files total 3,094,375 bytes (3.09 MB, 10.9%). The same inventory after deletion is about 25.40 MB; [size-result.json](size-result.json) contains exact measured totals including the small verification-script/ignore-rule updates.

These totals exclude node_modules, .next, .git, private backups and newly generated audit evidence. Verified rollback copies remain locally, so this is a reduction in project files, not a claim of equivalent free disk space. Removing unused source/screenshots is not claimed to improve checkout latency.

Local production browser checks used 4× CPU throttling. Package clicks generated zero network requests in both widths. Mobile median selected-DOM update was 6.85 ms and the two-frame paint proxy was 16.45 ms; desktop was 6.75 ms / 15.25 ms. Package and payment toggles also generated zero requests. The earlier mobile baseline was 6.35 ms / 17.65 ms; these differences do not establish a JavaScript speed improvement.

## Verification

- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Existing middleware deprecation and catalogue/logo timeout warnings were emitted during build; the local production browser subsequently loaded catalogue data successfully.
- `node --test scripts/performance/regressions.test.mjs`: 7/7 passed, including current backend price validation and rejection of unavailable/unpriced packages.
- Homepage and game detail: passed at 390 px and 1440 px, with zero automatic selections, correct summary prices, package deselection, payment deselection, disabled Pay with empty selections, and no automatic fetch for an empty catalogue.
- Player verification and AnajakPay checkout/confirmation: passed with browser-intercepted responses and a mocked gateway plugin. No real order, payment or supplier fulfillment was triggered.
- Eight admin pages × three widths (1440/900/390): 24 page checks passed, no horizontal overflow or browser exceptions. Overview/statistics, games, packages, orders, payments, banners, suppliers and settings rendered.
- Sidebar collapse, tablet layout, drawer/navigation, range/theme controls, banner dialog, order details, game actions/edit form, supplier status display, mobile tables and logout-to-login passed. Forms were opened/cancelled, not saved. Supplier status events were simulated; no live supplier check ran.
- Admin smoke used a temporary signed session to avoid writing admin last-login data. Real credential submission, real gateway charges and live fulfillment are outside these non-mutating checks.

Fresh browser evidence is kept in ignored `artifacts/performance/package-audit-cleanup-*` and `artifacts/unused-file-audit/admin-check/`. The existing historical evidence was not overwritten.

## Restore

Current edits, new audit scripts and every deletion candidate were copied and SHA-256 verified before removal at:

`D:\web\saksuuu-topup\.local-backups\project-cleanup-20261005-153848`

Every removed file was checked to match Git commit `102ba0ba05aec70e721c16e921a49d1b1080a363`. To restore a file, use its exact path from cleanup-log.json:

```powershell
git restore --source=102ba0ba05aec70e721c16e921a49d1b1080a363 --worktree -- "src/components/Footer.tsx"
```

Restore only listed deleted paths; do not reset the working tree. The local backup offers a second recovery copy. No restore was required because validation passed.

Production database cleanup remains at the separate approval stage. This file cleanup applied no database updates, merges or deletions.
