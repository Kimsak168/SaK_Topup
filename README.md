# SakSuuu Top-Up

Next.js 16 storefront and admin dashboard for game top-ups, using MongoDB,
Vizo, G2Bulk, AnajakPay, and Vercel Blob.

## Local setup

1. Install the locked dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` if you do not already have local settings.
   Configure MongoDB, supplier and payment credentials, and a random `AUTH_SECRET`.
   `.env` contains only shared defaults; secrets belong in `.env.local`.
3. Run `npm run admin:setup` to create a database administrator interactively.
4. Start the app with `npm run dev`, then open <http://localhost:3000>.

Admin login is at `/admin/login`. There are no built-in default credentials or
session secrets. Optional `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment
credentials work only while the database contains no administrator accounts.
Disabled accounts and database failures do not enable this fallback.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The regression suite uses isolated mocks and does not create real orders,
payments, or database records. The build uses the configured environment and
may read catalogue data and download Google fonts. Local backups and generated
artifacts are excluded from linting and type checking.

To verify navigation performance, run a production preview with
`npm start -- --port 3118`, then run
`node scripts/performance/navigation-http.mjs http://127.0.0.1:3118 local` and
`node scripts/performance/navigation-browser.mjs http://127.0.0.1:3118 local 390 --verify`.
The browser check requires Chrome (or `CHROME_PATH`), throttles the CPU fourfold,
and blocks all non-GET requests. It checks link preloading, package selection,
order totals, render counts, featured offer links, and the lazy-loaded lucky draw.
Reports are saved under `.local-backups/navigation/`.

Payment health probes share a result for 15 seconds within each server process;
failures expire after 3 seconds. The first request after expiry or a cold start
still waits for the provider. This cache applies only to health, and never to
payment verification. To check the real production route without live provider
calls, build the app, run `postman simulation run postman/simulations/payment-health.sim.yaml --port 4919 --no-history`,
then run `node scripts/verify-payment-health.mjs` in a second terminal.

To check the KHQR popup without creating real orders or payments, start a local
production preview and the fixtures with Postman CLI 1.70 or later:

```sh
npm run build
npm run start -- --port 3116
# In a second terminal:
postman simulation run postman/simulations/khqr-checkout.sim.yaml --port 4916 --no-history
# In a third terminal:
node scripts/verify-khqr.mjs
```

The browser check requires Chrome (or `CHROME_PATH`) and reads the local Honor of
Kings catalogue. It intercepts all mutable browser API calls and routes the
checkout calls to the local Postman simulation. It checks mobile layouts,
expiry/retry, slow and failed status requests, and payment confirmation. Reports
and screenshots are saved under `.local-backups/khqr/`. The fixture follows this
repository's response shapes and uses an invalid account and CRC; it does not
establish live bank acceptance or settlement.

Customer KHQR checkout requires `VNGZZ2_PRIMARY_API_KEY` (or the legacy
`VNGZZ2_PAYMENT_API_KEY`). Missing credentials return HTTP 503 before creating
an order; customer checkout never substitutes a demo QR. The modal displays the
provider's unchanged QR payload and its merchant name (EMV tag 59), where present.
The official KHQR logo in `public/images/khqr-logo.svg` is from the
[NBC Bakong design assets](https://bakong.nbc.gov.kh/en/).

Run the production build locally with `npm start`. Configure the same environment
variables on your hosting platform, including `NEXT_PUBLIC_APP_URL` for payment
return URLs. Administrator route protection uses `src/proxy.ts`, the Next.js 16
replacement for the deprecated middleware convention.

If package directories are empty or imports fail, run `npm ci` to restore the
locked dependency installation, then repeat the checks above.

## Uploaded images

Banner, event, and package uploads are stored in MongoDB when
`BLOB_READ_WRITE_TOKEN` is blank. With a real public Blob store token, new
uploads use Vercel Blob. Configure the same database and Blob store on each
deployment; a placeholder token does not enable storage. Files sent through
server routes are limited to 4 MB to leave room for multipart form fields.
Larger banner uploads go directly to Blob and require its token.

Saving text, prices, or an unchanged image URL preserves the stored picture.
Each replacement receives a new image URL revision, so the image cache refreshes
without downloading pictures again after unrelated edits. Old Blob pictures
are cleaned up after the owning record saves successfully. The server image
cache is limited to 32 MB, and package upload previews release browser memory
when closed or replaced.

Run `node --test scripts/performance/images.test.mjs` to check image preservation,
replacement, removal, cache refresh across servers, and cache memory limits.
These checks use local persistence fixtures and do not modify live records.
