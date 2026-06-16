# T Pay Backend API

T Pay backend is optional and testnet-only. It provides resilient FX proxy endpoints and a lightweight merchant event indexer for Arc Testnet.

## Health

`GET /api/health`

Returns backend health and environment readiness.

## FX

`POST /api/fx/quote`

Body fields: `fromToken`, `toToken`, `amount`, `amountMode`, `slippageBps`, `walletAddress`.

Returns normalized protected quote with expected output, slippage minimum/maximum, source, fee, price impact, and expiry.

`POST /api/fx/execute`

Executes or prepares the configured StableFX/DEX route when backend execution is enabled. Demo fallback stays available for testnet UX but must not be used for mainnet settlement.

## Invoices

`GET /api/invoices`

Returns indexed invoices from the configured merchant settlement contract.

`GET /api/invoices/:id`

Returns a single invoice by app id or contract invoice id.

## Merchant

`GET /api/merchant/:address/history`

Returns invoices for one merchant wallet address.

`GET /api/merchant/:address/analytics`

Returns invoice counts, success rate, revenue totals, settlement timing, and token breakdown.

## Dashboard

`GET /dashboard`

Read-only merchant dashboard. The merchant enters their wallet address; the page loads history and analytics from the API and supports CSV export.

## Notes

- Arc Testnet only.
- No private keys are stored or accepted by the backend.
- RPC and contract addresses must come from environment variables.
- CSV export fields include `txHash`, `blockTimestamp`, `token`, `FX rate`, `fee`, and `status` when the indexer has those fields.

