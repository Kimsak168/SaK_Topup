# VNGZZ2 game integration

## SMM catalog and checkout

The SMM storefront contract is `contracts/smm-storefront.openapi.json`. The public
`GET /api/smm/services` route reads only validated, active MongoDB `SmmService`
records and applies search, filters, sorting, and pagination server-side. Checkout
revalidates the selected record and current database rate before creating an order.

Supplier imports are not automatic: an administrator previews the supplier snapshot
in **Admin > Social Services**, reviews the counts, then confirms the exact apply
phrase. Sync and cleanup snapshot affected SMM records and write an audit entry.
Cleanup never deletes services or changes order/payment records. See
`scripts/audit/smm-catalog-cleanup.mjs` for the read-only report and hash-confirmed
normalization workflow.

The game client uses `VNGZZ2_GAME_BASE_URL` and `VNGZZ2_GAME_API_KEY`, falling back to the existing payment base URL and key. Credentials stay on the server.

## Import and refresh

```powershell
npm run fetch:vngzz2
npm run sync:vngzz2 -- --snapshot
npm run sync:vngzz2 -- --snapshot --apply
```

The first sync command validates the complete snapshot without database writes. The last imports it and backs up existing VNGZZ2 records under `artifacts/vngzz2-catalogue/`. That directory is ignored by Git because it contains private supplier prices and database snapshots. To sync directly from the provider, omit `--snapshot`.

In the dashboard, use **Games → Sync All Games**, then **Packages → Supplier: VNGZZ2 → Sync Packages**. Existing supplier records are preserved. VNGZZ2 has distinct `/games/vngzz2/<game_code>` routes and prefixed slugs, preserving each regional catalogue.

New packages use the game's configured margin, initially 12%, rounded up to the nearest USD cent. Sync updates reseller costs and provider stock without replacing admin prices, images, badges or visibility. `sell_price`, rather than the provider's internal `cost_price`, is the purchase cost. Inactive, removed or non-USD stock cannot be purchased.

## Verification

```powershell
npm test
npm run typecheck
npm run lint
postman simulation run postman/simulations/vngzz2.sim.yaml --port 4900 --no-history --output ndjson
# In another terminal:
npm run test:vngzz2:simulation
```

The local mock was generated from the provider's OpenAPI document and populated with observed catalogue shapes. Order responses are synthetic fixtures. No live top-up is needed for these checks.

The live import on 2026-10-27 (Asia/Bangkok) contained **191 games and 5,011 packages**. Nine games require a character name (`charname`), which the published create-order contract does not support. These catalogues remain visible with checkout disabled. The provider also has no documented nickname verification endpoint; the UI reports verification as unavailable, without claiming a player was verified.

Fulfillment sends the paid order's stored product, player, zone and stable reference. Submission is never retried automatically. Reconciliation calls `check_order` with the local order reference, including after an uncertain submission.
