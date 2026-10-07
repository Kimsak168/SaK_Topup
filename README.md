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

Run the production build locally with `npm start`. Configure the same environment
variables on your hosting platform, including `NEXT_PUBLIC_APP_URL` for payment
return URLs. Administrator route protection uses `src/proxy.ts`, the Next.js 16
replacement for the deprecated middleware convention.

If package directories are empty or imports fail, run `npm ci` to restore the
locked dependency installation, then repeat the checks above.
