# T Pay 10-Point Upgrade Delivery

Updated: 2026-05-16

This note summarizes the current production-readiness pass for the T Pay Arc Testnet app.

## 1. Home Testnet Dashboard
- Rebuilt the Home screen after an encoding issue.
- Shows Arc RPC health, USDC gas note, balance, quick actions, readiness guidance, market watch, and recent activity.

## 2. QR and Deep Link Routing
- Added a shared QR parser in `services/paymentRequestService.ts`.
- Scanner now supports T Pay invoice links, Expo payment links, `tpay://pay?invoiceId=...`, EIP-681-style payment QR, and plain EVM addresses.

## 3. Pay Flow Upgrade
- `/pay` without an invoice id now opens a useful payment landing screen instead of a dead error.
- Users can scan QR, open Merchant POS, or select local/backend open invoices.

## 4. Send Flow UX Fix
- The amount field was replaced with a dedicated large `TextInput` so users can actually enter a USDC amount on mobile.
- Scanner can prefill both recipient and amount.

## 5. Invoices Tab Migration
- The old `getCreatorInvoices` read path was removed from the tab UI.
- The tab now reads from the merchant invoice service/backend-local merge path instead of the old broken contract ABI/address path.

## 6. Settings Support Toolkit
- Added Arc RPC health check in Settings.
- Added safe debug-info copy with chain id, RPC, configured services, token addresses, and capability status.
- Debug info intentionally excludes seed phrases and private keys.

## 7. Arc App Kit Safety Layer
- App Kit adapter avoids browser-only `wallet_switchEthereumChain` against the Arc RPC.
- Send, swap, bridge, and unified balance paths remain App Kit-first where available with safe fallbacks/guards.

## 8. Merchant and FX Guardrails
- Merchant creation/payment uses local risk controls: token allowlist, max amount, blocked address checks, high-value warnings.
- Invoice cross-token payment uses exact-output FX where available so the merchant receives the target settlement amount.

## 9. Smart Contract Security Tests
- Added `contracts/test/merchant-settlement.test.js`.
- Covers single payment, double-payment rejection, expiry enforcement, pause/unpause, and token allowlist behavior.

## 10. Release Gate Verification
- `npm run type-check` passes.
- `contracts` test suite passes: 7 tests.
- `npx expo export --platform ios --clear` passes.
- Remaining bundle warnings are non-blocking package export warnings from dependencies such as `@noble/*` and `rpc-websockets`.

## Remaining Optional Work
- Run the Next.js backend sample in a real hosted environment for cross-device invoice persistence.
- Configure live DEX router/token addresses only after confirming them from official Arc docs.
- Add real sponsored smart-wallet/paymaster execution when the chosen smart-account provider is finalized.

