# SakSuuu blue/cyan storefront

Changed the existing public storefront color system while preserving component structure, responsive dimensions, routes, and event handlers.

## Color replacements

| Previous role | Updated color |
|---|---|
| Primary green `#16A34A` | Primary blue `#2563EB` |
| Bright green theme accents `#22C55E` | Bright blue `#0EA5E9`; deep blue `#1D4ED8` for action hover |
| Deep green `#15803D` | Deep blue `#1D4ED8` |
| Mint `#F0FDF4` | Soft blue `#F0F9FF` |
| Pale green page `#F7FFF9` | Blue page `#F0F9FF` with white / `#F8FCFF` surfaces |
| Green border `#BBF7D0` | Blue border `#BAE6FD` |
| Soft green border `#DCFCE7` | Soft blue border `#E0F2FE` |
| Main text `#172033` | Navy text `#0F172A` |

Search buttons and existing package badges use a blue/cyan gradient. Active navigation underlines and soft input focus rings use cyan `#06B6D4`. The brand keeps its one-time typing behavior and uses the requested five gradient stops: `#2563EB`, `#0EA5E9`, `#06B6D4`, `#14B8A6`, `#2563EB`.

Semantic success states remain green (`#22C55E`); warning and error colors remain `#F59E0B` and `#EF4444`. ABA/KHQR artwork, banner images, game artwork, and natural flower colors are preserved.

The existing public toolbar contains Logo, Telegram, Facebook, TikTok, and Support. Theme switching remains admin-only, following the earlier request to preserve existing public behavior. Existing social URLs are unchanged.

## Verification

- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Home and a real Mobile Legends game page with 68 configured package cards: no horizontal overflow at 320, 360, 375, 390, 430, 768, 1024, 1440, and 1920px.
- Navbar geometry matches the saved previous layout at matching widths.
- Verified search/clear, blue card hover, cyan focus rings, package selection/deselection, and payment selection.
- Verified compact social rail at 320x740, 390x844, 430x320, and 1440x1000; real Facebook/TikTok URLs, left-side tooltips, Escape and outside-click closing.
- Verified exact typing sequence once, cursor removal, stable reserved brand width, and reduced-motion behavior.
- No browser runtime exceptions.
- Source comparison confirms only public presentation files changed; markup structure, business logic, routes, APIs, admin source, supplier/payment code, and flower animation are unchanged.
- No orders or payments were created during verification.

## Changed files (22)

### Public components

- `src/components/public/ActiveGamesTicker.tsx`
- `src/components/public/CustomerFooter.tsx`
- `src/components/public/CustomerNavbar.tsx`
- `src/components/public/GameCard.tsx`
- `src/components/public/GameSearch.tsx`
- `src/components/public/GameTopUpClient.tsx`
- `src/components/public/HomeSkeletons.tsx`
- `src/components/public/PackageOptions.tsx`
- `src/components/public/PromotionalBanner.tsx`
- `src/components/public/SupportDropdown.tsx`

### Public pages and loading states

- `src/app/(public)/checkout/page.tsx`
- `src/app/(public)/games/loading.tsx`
- `src/app/(public)/games/page.tsx`
- `src/app/(public)/games/[supplier]/[code]/loading.tsx`
- `src/app/(public)/layout.tsx`
- `src/app/(public)/orders/page.tsx`
- `src/app/(public)/orders/[id]/page.tsx`
- `src/app/(public)/page.tsx`
- `src/app/(public)/payment/cancel/page.tsx`
- `src/app/(public)/payment/success/page.tsx`

### Shared presentation

- `src/app/globals.css`
- `src/app/not-found.tsx`

## Screenshots

- [Mobile home, 320px](home-320.png)
- [Mobile home, 390px](home-390.png)
- [Desktop home, 1440px](home-1440.png)
- [Mobile game, 320px](game-320.png)
- [Mobile game, 390px](game-390.png)
- [Desktop game, 1440px](game-1440.png)

Detailed measurements: [verification.json](verification.json)
