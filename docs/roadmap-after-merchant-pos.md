# T Pay Roadmap After Merchant POS + Backend Sync

Updated: 2026-05-16

## Completed

1. Merchant POS Pro foundation
   - Added a dedicated full-screen POS mode at `app/merchant-pos.tsx`.
   - Shows large QR, locked invoice amount, display fiat amount, merchant address, settlement mode, expiry countdown, and paid/expired/cancelled states.
   - Polls invoice status every 2 seconds via `subscribeToMerchantInvoice` so merchants can keep the screen open during checkout.

2. Backend Sync + Cross-Device Invoice foundation
   - Added backend metadata store: `backend-samples/next-app/lib/invoiceMetadataStore.ts`.
   - `POST /api/invoices` stores invoice metadata from the mobile app.
   - `PATCH /api/invoices/:id` updates invoice status/payment details.
   - `GET /api/invoices`, `GET /api/invoices/:id`, and `GET /api/merchant/:address/history` now merge mobile metadata with onchain indexer data.
   - Mobile `merchantService` now syncs invoice metadata after create, cancel, and payment when `EXPO_PUBLIC_TPAY_BACKEND_URL` is configured.

3. Unified Balance Portfolio Pro
   - Upgraded `hooks/useMultiChainBalance.ts` to prefer Arc App Kit unified balance, then fall back to direct RPC reads.
   - Added balance source metadata, last sync time, error count, per-chain error messages, and ranked funding sources.
   - Rebuilt `app/(tabs)/portfolio_v2.tsx` with total USDC across Arc and supported testnets, VND display, pull-to-refresh, chain health badges, market watch, and bridge-to-Arc recommendations.
   - Kept the old hook return fields so Bridge, Pay, and Insights remain backward-compatible.

## What this unlocks

- Merchants can create invoices with a more practical POS checkout screen.
- Invoice metadata can be synced to a backend sample so another device can load richer invoice data.
- Users can see whether their USDC is already on Arc or sitting on Base/Ethereum/Arbitrum/Polygon testnets.
- The app can recommend the best external testnet funding source and prefill Bridge to Arc.

## Remaining roadmap, recommended order

1. One-Click Cross-Chain Pay
   - If an invoice requires Arc USDC but payer funds sit on Base/Ethereum/Arbitrum/Polygon testnets, use App Kit Bridge/Unified Balance to fund Arc then settle invoice.
   - Add a single review screen: source chain -> bridge/fund -> pay invoice.

2. FX Pro
   - Add exact-output UI for invoice payment with non-settlement tokens.
   - Show route source, min received/max spent, deadline, slippage, fee, and final merchant settlement amount.
   - Only enable live routes confirmed by Arc/App Kit/docs config.

3. Security & Backup Upgrade
   - Add backup completion checklist before receiving larger funds.
   - Add private-key export behind double confirmation.
   - Add wallet reset cooldown and final phrase warning.

4. Merchant Analytics Pro
   - Add daily volume, revenue chart, settlement speed, success/failure trend, top tokens, and export filters.
   - Backend should eventually persist to Postgres/Redis instead of in-memory sample storage.

5. Notification System
   - Local notifications for invoice paid, invoice expired, bridge complete, and failed transaction.
   - Backend webhook/push notification can come after hosted backend exists.

6. Smart Wallet / Gas Sponsorship
   - Keep as final phase because it changes signing/execution assumptions.
   - Requires choosing smart-account/paymaster provider and testing sponsored UserOperation flow end-to-end.

## Important backend note

The current backend metadata store is intentionally lightweight and in-memory for local/testnet development. For real user testing across restarts or hosted serverless deployments, replace it with Redis, Postgres, SQLite, or another persistent store.

