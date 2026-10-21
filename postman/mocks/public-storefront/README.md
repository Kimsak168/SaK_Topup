# Public notification simulation

These local fixtures test the real SakSuuu public frontend against first-party
HTTP response shapes from the existing player-verification, checkout-creation,
payment-status, and order-lookup route handlers. This repository owns those
contracts; no remote workspace or published mock is required.

The SDK fixture models the `window.KhqrPayway` interface used by
`src/lib/khqrPlugin.ts`. The real SakSuuu checkout wrapper still runs. This
does not validate the external provider's current SDK or payment processing.

No mock handler calls MongoDB, suppliers, or the payment provider. Created records
are synthetic, stored under `public-storefront:` keys in Postman's local mock
state. Unknown endpoints return 501. Test control routes exist only in this mock.

After `npm run build`, run these in separate terminals:

```powershell
postman simulation run postman/simulations/public-toasts.sim.yaml --port 4900 --output ndjson --no-history
npm run start -- --hostname 127.0.0.1 --port 3010
node scripts/public-toast-preview-proxy.mjs
node scripts/verify-public-toasts.mjs
```

The proxy serves the real frontend at `http://127.0.0.1:3011` and forwards mutable
API traffic to the Postman simulation. The browser check redirects the SDK script
request to the simulation's HTTP-served SDK fixture; it does not replace the
frontend's fetch implementation or Sonner.

The browser check defaults to Chrome's Windows installation. Set `CHROME_PATH`
to use another installed Chrome binary. It writes measurements and screenshots
to `artifacts/public-toasts/`. Postman CLI 1.73.0 was used for verification.

## Checkout redesign verification

With the storefront running on `http://localhost:3000`, start the same local
simulation on port 4900 and run:

```powershell
node scripts/verify-checkout-redesign.mjs
```

This browser check covers mobile navbar and drawer behavior, the disabled
sticky payment bar, ID validation, automatic confirmation, cancel and package
changes, responsive layouts at 320, 360, 375, 390, 430, 768, 1024, and 1440px,
checkout errors, and a simulated paid result. It routes player verification, order
creation, payment status, and the KHQR SDK fixture to Postman; it does not create
a real order or contact the payment provider. Screenshots and measurements go to
`artifacts/public-checkout/`. Use `CHECKOUT_CHROME_FLAGS` if headless Chrome needs
local launch flags.
