# VNGZZ2 catalogue integration

- Contract: provider `/api/document?format=json`; catalogue fixtures were captured from authenticated GETs on 2026-10-27 (Asia/Bangkok). The provider requires `X-API-Key` for both catalogue endpoints despite `security: []` in its published spec. The corrected game API subset is in `postman/contracts/vngzz2.openapi.json`.
- The local mock was generated from the provider spec, then supplied with observed catalogue response shapes. No published owner mock was available in this repository. Purchase responses are synthetic contract fixtures; they do not establish live fulfillment compatibility.
- Read-only live digital catalogue check on 2026-10-28: authenticated `GET /api/v1/digitalshop/products` returned HTTP 200 with 38 products. The provider dashboard exposes Game and SMM menus, and its published OpenAPI document does not list digital-shop endpoints. This catalogue response does not confirm digital order submission or fulfillment support.
- Digital Shop listing and checkout are paused until a documented digital-product supplier is configured. Do not add digital endpoints to this provider mock based on the undocumented catalogue response.
- The provider's private webhook-enabled setting was not accessible from this checkout. It is a payment callback setting and does not add Digital fulfillment capability.
- Run: `postman simulation run postman/simulations/vngzz2.sim.yaml --port 4900 --no-history --output ndjson`.
- Check: `node scripts/verify-vngzz2-simulation.mjs`. It runs the actual TypeScript game supplier client over HTTP. It does not use database stubs or make live purchases.
- The mock must use `interceptRequests: true`; state is stored under `vngzz2.orders`. Restart after handler edits.
- Live catalogue snapshot: 191 categories, 5,011 packages. Nine categories require `charname`, which the published order contract does not model; checkout is blocked for these games. Nickname verification is also absent from the published contract.
- Validation on 2026-10-27: the game client passed catalogue, reseller price selection, inactive stock, 429 retry, malformed JSON/shape, mismatched game, timeout, reference reuse/conflict and order reconciliation checks. The `vngzz2` member served all modeled game API paths in the simulation log; no member was silent.
- Postman local state calls must be awaited, and intercepted POST handlers must read `req.body` instead of re-consuming the request stream. CLI 1.73.0 requires a manifest file path for this simulation member, rather than its directory.
