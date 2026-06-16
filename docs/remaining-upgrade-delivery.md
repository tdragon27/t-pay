# T Pay Remaining Upgrade Delivery

Updated: 2026-05-16

## Completed in this pass

1. One-Click Cross-Chain Pay foundation
   - `app/pay.tsx` now routes users from invoice payment to Bridge with `returnInvoiceId` when Arc USDC is insufficient but external USDC exists.
   - `app/bridge.tsx` returns users to the invoice after bridge submission and records a bridge notification.
   - Existing direct pay-on-Arc flow remains unchanged.

2. FX Pro exact-output UI
   - `app/fx.tsx` now supports `EXACT_INPUT` and `EXACT_OUTPUT` quote modes.
   - Exact-output quotes show maximum spend, while exact-input quotes show minimum receive.
   - Uses the existing slippage/deadline protected `fxService` execution path.

3. Security & Backup Upgrade
   - Added `app/security-backup.tsx`.
   - Includes backup checklist, explicit private-key export confirmation, clipboard export, and security notifications.
   - Settings links to the new security center.

4. Merchant Analytics Pro
   - Added `app/merchant-analytics.tsx`.
   - Expanded `services/merchantAnalyticsService.ts` with daily volume, token mix, median/fastest settlement, and richer KPIs.
   - Merchant POS now links to analytics.

5. Notification System
   - Added `services/notificationService.ts` and `app/notifications.tsx`.
   - Stores local in-app events for invoice, payment, bridge, security, and system messages.
   - Settings links to the notification center.

6. Smart Wallet / Gas Sponsorship Readiness
   - Added `services/gasSponsorshipService.ts` and `app/gas-sponsorship.tsx`.
   - Shows config readiness for App Kit, paymaster URL, smart-wallet flag, and sponsorship flag.
   - Does not fake sponsored execution; normal Arc native-USDC gas flow remains the safe fallback.

## Verification

- `npm run type-check` passed.
- `npx expo export --platform ios --clear` passed.
- Remaining warnings are non-blocking package export warnings from `@noble/*` and `rpc-websockets`.

## Remaining production notes

- Full automatic bridge-then-pay should wait for confirmed bridge completion/indexer state, not only bridge submission.
- Push notifications/webhooks require a hosted backend and probably `expo-notifications` or a push provider.
- Sponsored transactions require a real smart-wallet/paymaster execution path before enabling for users.

