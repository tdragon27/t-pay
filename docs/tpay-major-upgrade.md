# 1. Feature Overview & User Stories

## Onchain FX

T Pay now includes an FX surface for stablecoin conversion on Arc:

- Mobile screen: `app/fx.tsx`
- FX service and execution paths: `services/fxService.ts`
- Arc token/router config: `constants/chains.ts`

Supported execution modes:

- `DEX` mode: direct onchain swap through a configured Arc router via `EXPO_PUBLIC_ARC_DEX_ROUTER_ADDRESS`
- `StableFX` mode: optional server-side quote path through Circle StableFX proxy
- `Demo` mode: safe fallback quote so the UI still works before live infra is wired

User stories:

- As a wallet user, I can quote `USDC -> USDT`, `USDC -> EURC`, or reverse pairs without leaving the app.
- As a Vietnamese user, I can see quote values in `VND` as well as `USD`.
- As an operator, I can start with demo routing, then switch to Arc pools or Circle StableFX by environment config.

Text flow:

`Home -> FX -> choose from/to stablecoin -> get quote -> review VND/USD value -> execute swap -> Arc settlement complete`

## Merchant Payment + Instant Settlement

T Pay now includes a merchant mode:

- Merchant POS screen: `app/merchant.tsx`
- Payer invoice screen: `app/pay.tsx`
- Invoice/payment logic: `services/merchantService.ts`
- Settlement contract: `contracts/src/TPayMerchantSettlement.sol`

User stories:

- As a merchant, I can create a QR invoice in seconds.
- As a payer, I can open the invoice link or QR and settle instantly on Arc.
- As a merchant, I can review invoice history and export CSV for reconciliation.
- As a product team, I can run in direct-transfer mode first, then switch to contract settlement once deployed.

Text flow:

`Merchant -> create invoice -> generate QR/link -> customer opens /pay -> approve/pay -> invoice marked paid -> merchant dashboard updates -> CSV export`

# 2. Smart Contract Code

Primary contract:

- `contracts/src/TPayMerchantSettlement.sol`

What it does:

- Registers merchant invoices onchain
- Accepts supported stablecoins
- Lets the payer settle with `transferFrom`
- Marks invoice status as `Open`, `Paid`, or `Cancelled`
- Emits clean events for indexing and dashboard sync

Recommended deploy-time configuration:

- Add supported Arc stablecoins with `setSupportedToken`
- Set `EXPO_PUBLIC_MERCHANT_SETTLEMENT_ADDRESS` in the mobile app once deployed
- Keep `USDC` enabled first, then add `USDT` and `EURC` when live pool/token addresses are confirmed

# 3. Frontend Components Code

## Mobile / Expo React app

Built screens and services:

- `app/fx.tsx`
- `app/merchant.tsx`
- `app/pay.tsx`
- `services/fxService.ts`
- `services/merchantService.ts`
- `app/send.tsx` updated to accept prefilled `address` and `amount` params
- `app/(tabs)/home.tsx` updated with `FX` and `Merchant` quick actions

Key UX behaviors:

- Loading states for quote fetch, invoice creation, and settlement
- Success feedback through toast + animated state transitions
- Low-friction buttons for copy/share/open payer view
- Market strip with `BTC`, `ETH`, `USDC` to make the wallet feel more like a live crypto product

## Web / Next.js sample

Sample folder:

- `backend-samples/next-app/app/api/fx/quote/route.ts`
- `backend-samples/next-app/app/dashboard/page.tsx`
- `backend-samples/next-app/components/fx-panel.tsx`
- `backend-samples/next-app/components/merchant-dashboard.tsx`

This sample gives you:

- A server-side `StableFX` quote proxy
- A Tailwind-style dashboard shell for web ops / merchant teams
- A clean split between wallet UI and institutional FX backend logic

# 4. Integration Guide

## Existing transfer code reuse

The upgrade intentionally reuses your current transfer stack:

- Existing USDC wallet send flow remains in `hooks/useSend.ts`
- `app/send.tsx` now accepts params from scan/payment links
- Merchant payment links can route users directly into the payer screen
- Direct transfer is still available as fallback when merchant contract or DEX router is not configured

## Environment variables

Add these to `.env` when ready:

```env
EXPO_PUBLIC_ARC_USDT_ADDRESS=
EXPO_PUBLIC_ARC_EURC_ADDRESS=
EXPO_PUBLIC_ARC_DEX_ROUTER_ADDRESS=
EXPO_PUBLIC_MERCHANT_SETTLEMENT_ADDRESS=
EXPO_PUBLIC_TPAY_BACKEND_URL=
```

Use these Next.js env vars in the sample server:

```env
CIRCLE_STABLEFX_API_KEY=
```

## Recommended rollout order

1. Deploy `TPayMerchantSettlement.sol` to Arc testnet.
2. Set `EXPO_PUBLIC_MERCHANT_SETTLEMENT_ADDRESS`.
3. Configure `USDT` / `EURC` token addresses on Arc testnet.
4. Configure `EXPO_PUBLIC_ARC_DEX_ROUTER_ADDRESS` for direct swap routing.
5. If you have Circle StableFX access, run the Next.js sample proxy and set `EXPO_PUBLIC_TPAY_BACKEND_URL`.

## StableFX / Arc references

- Circle StableFX overview: [https://developers.circle.com/stablefx](https://developers.circle.com/stablefx)
- StableFX technical guide: [https://developers.circle.com/stablefx/concepts/technical-guide](https://developers.circle.com/stablefx/concepts/technical-guide)
- StableFX taker quickstart: [https://developers.circle.com/stablefx/quickstarts/fx-trade-taker](https://developers.circle.com/stablefx/quickstarts/fx-trade-taker)
- Arc / Gateway supported chains: [https://developers.circle.com/gateway/references/supported-blockchains](https://developers.circle.com/gateway/references/supported-blockchains)
- Arc testnet faucet / chain details: [https://developers.circle.com/gateway/quickstarts/unified-balance](https://developers.circle.com/gateway/quickstarts/unified-balance)

# 5. Testing Steps on Arc Testnet

## Mobile app

1. Fund a wallet with Arc testnet USDC from Circle Faucet.
2. Open `FX` from Home.
3. Quote `USDC -> EURC` or `USDC -> USDT`.
4. If router address is not set, confirm demo mode appears and quote still renders.
5. If router address is set, execute a real swap and verify the receipt on Arc explorer.
6. Open `Merchant`.
7. Create an invoice in `USDC`, with `VND` display amount.
8. Open `Payer View` and settle the invoice.
9. Confirm merchant history updates to `paid`.
10. Export CSV and verify the record fields.

## Contract validation

1. Deploy `TPayMerchantSettlement.sol`.
2. Call `setSupportedToken` for the Arc USDC token first.
3. Create an invoice from a merchant wallet.
4. Approve the settlement contract from a payer wallet.
5. Call `payInvoice`.
6. Confirm:
   - merchant receives the token
   - invoice status changes to `Paid`
   - `InvoicePaid` event is emitted

## Operational checks

1. Test expiry by setting a short invoice window.
2. Test `cancelInvoice` on an open invoice.
3. Test missing config:
   - no DEX router
   - no settlement contract
   - no backend URL
4. Verify the app falls back gracefully instead of freezing.
