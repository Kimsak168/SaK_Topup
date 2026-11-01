# Supplier catalogue reconciliation

The application and WebBuilder CLI commands use `webbuilderSyncService.ts` and
the same exact game/region definitions. Substring matching must not combine
MLBB regions, Free Fire regions, Magic Chess regions or Blood Strike MENA.
Regional routes take precedence over old base-game redirects. Verification
uses the matching supplier metadata and a product from the selected region.

WebBuilder IDs remain unchanged. Supplier buying prices are `price_cents / 100`.
VNGZZ2 identities include both `game_code` and `product_code`; reseller
`sell_price` (falling back to `price`) is the buying price, not `cost_price`.
Only positive USD prices with orderable supplier stock become available.
Malformed, duplicate or incomplete responses fail before availability cleanup.
An entirely empty WebBuilder catalogue is treated as a failed refresh.

Sync updates supplier cost, currency, availability and game links. Existing
selling prices, names, images, badges and activation settings are preserved.
Removed products are retained with `supplierAvailable: false`. Packages from
retired VNGZZ2 game codes are also made unavailable, and those games have
checkout disabled. New games and packages start inactive. Initial prices use the game's configured margin,
including a zero margin, rounded up to the next cent.

The 2026-11-01 account snapshot contained 640 WebBuilder products in 23 groups
and 4,913 VNGZZ2 products across 191 games. Provider responses may change;
fetch a new snapshot before another reconciliation.

The completed 2026-11-01 repair in the configured `test` database added 234
missing packages, corrected 358 regional game links, refreshed 4,077 buying
prices and marked 344 removed packages unavailable. Final verification matched
all 5,553 current provider packages with no errors. Existing admin prices,
artwork, labels and activation settings were checked and preserved. Retired
records remain for reference. Backups and the final verification are in
`.local-backups/supplier-repair-1793466965386/` and
`.local-backups/supplier-repair-1793467241086/`.

```powershell
npm run catalogue:audit
npm run catalogue:repair -- --snapshot .local-backups/supplier-catalogue-<timestamp>/snapshot.json
npm run catalogue:repair -- --snapshot .local-backups/supplier-catalogue-<timestamp>/snapshot.json --apply
npm run sync:webbuilder -- --apply
npm run sync:hok -- --apply
```

The audit is read-only and saves its snapshot under ignored `.local-backups/`.
Repair defaults to a dry run, checks snapshot age/completeness, takes a fresh
backup before applying, and verifies every current product and protected admin
field afterward. It uses `MONGODB_DB_NAME` through the application connector.
The legacy WebBuilder scripts now use this same path and require `--apply`.
CLI changes appear after the public catalogue cache expires (up to five minutes);
admin sync requests invalidate it immediately.

To verify without live accounts or purchases, run these in separate terminals:

```powershell
postman simulation run postman/simulations/supplier-catalogues.sim.yaml --port 4902 --no-history --output ndjson
npm run test:catalogue:simulation
```

The test process creates and removes an isolated MongoDB instance. No
`.env.local` is loaded. Test values are fictional; the catalogue envelopes
follow observed supplier payloads and the local VNGZZ2 contract. Provider-owner
mock discovery was skipped because the local Postman CLI is signed out.
