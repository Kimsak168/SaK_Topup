# Public light theme verification

Public pages now use semantic Tailwind v4 theme variables: soft white `#F8FAFC`, dark primary text `#111827`, slate secondary text `#64748B`, white cards, and pink/purple/blue accents. Darker secondary text is used over tinted backgrounds to preserve contrast. Existing artwork supplies the subtle blurred background.

Admin layouts retain the original dark palette. The admin marker also scopes body-mounted dialogs and the toast theme. No admin dashboard content, API routes, models, supplier integrations, pricing, or payment logic changed. A TypeScript AST comparison confirmed that changes in checkout, game top-up, and order/payment pages are confined to CSS classes.

## Checks

- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `npm run build`: passed with the existing Next.js middleware deprecation warning.
- ESLint on the changed public components and pages: no errors; existing unused-variable and effect-dependency warnings remain.
- Full ESLint: two existing `react/no-unescaped-entities` errors remain in `src/app/(admin)/admin/games/mlbb-test/page.tsx:351`. The private admin test page was left unchanged.
- Chrome screenshots and layout inspection at 1440, 1024, 390, and 320 pixels. No horizontal overflow in the tested public views.
- Five game columns at desktop width, three package columns at desktop width, white card backgrounds, dark labels, pink prices, and pink selection borders confirmed from computed styles.
- Search filtering, package selection, account input, and simulated confirmation checked in the browser. Payment and verification responses were intercepted; no real order or payment was created.
- Public pages stayed light with a dark OS preference. Admin login retained its dark background and white text.
- Keyboard focus, brand shimmer, carousel navigation/transition, and reduced-motion rendering checked.
- Text contrast reviewed using computed colors and sampled rendered backgrounds; darkened labels on tinted backgrounds and green status text where needed. White text remains on strong accent buttons and badges.

## Coverage and limits

Home and catalog empty states, populated game/banner previews, the game detail component, checkout, order search/results/empty states, order details, paid/pending/failed payment returns, payment cancellation, and the 404 page were inspected. The contact redirect and legacy Free Fire redirect were also checked.

MongoDB DNS/buffering timeouts prevented this environment from loading the live catalog. Populated game and package views therefore used a temporary local preview route. Order and payment status screens used browser-only responses. Preview images reuse existing local artwork and the displayed sample prices are not live prices. The temporary route was removed before the final production build. Live supplier fulfillment and payment gateway transactions were not exercised.

## Screenshots

- [Populated catalog, desktop](catalogue-populated-desktop.png)
- [Populated catalog, mobile](catalogue-populated-mobile.png)
- [Game detail and selected package, desktop](game-desktop.png)
- [Game detail, tablet](game-tablet.png)
- [Game detail, 320px mobile](game-small-mobile.png)
- [Checkout, 320px mobile](checkout-small-mobile.png)
- [Order tracking, mobile](orders-results-mobile.png)
- [Order details, mobile](order-detail-mobile.png)
- [Payment success, desktop](success-paid-desktop.png)
- [Payment confirmation, mobile](confirmation-mobile.png)
- [Admin login remains dark](admin-login-desktop.png)
