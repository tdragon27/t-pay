# Circle / Arc Grant Notes

## Project Summary

T Pay is a Social USDC Payment App on Arc Testnet. It focuses on everyday payment coordination rather than generic trading: send USDC, receive USDC, split bills, merchant invoices, QR/payment links, and unified activity tracking.

## Product Direction

T Pay is designed for people and merchants who need lightweight USDC coordination:

- Friends splitting a bill.
- A small merchant creating a QR invoice.
- A user receiving a request link and paying from the app.
- A tester reviewing payment status without reading raw logs.

The app keeps execution user-controlled and testnet-only.

## Why Arc

Arc is a strong fit because T Pay centers on USDC-denominated payment UX. The app highlights Arc Testnet status, fast payment confirmation UX, and low-friction stablecoin flows.

## Current Capabilities

- Arc Testnet USDC send and receive.
- Smart QR/payment links for wallet requests, splits, and merchant invoices.
- Split Bill with participant tracking, progress, copy-all links, reminders, and optional Supabase sync.
- Merchant invoice flow with QR/payment link, status handling, and backend/indexer readiness.
- Unified activity feed for send, receive, split, merchant, FX, bridge, and passport events.
- Portfolio/Home with balance, active payments, latest activity preview, and stablecoin rails.
- Developer Debug screen for safe testnet readiness checks.

## Circle / Arc Ecosystem Readiness

T Pay is prepared for the current Circle/Arc direction without overclaiming:

- App Kit Send/Bridge/Swap/Unified Balance pathways are represented where configured.
- FX screen is ready for App Kit same-chain stablecoin swaps on Arc Testnet.
- Unified Balance readiness is surfaced in Portfolio/Debug without inventing balances.
- Stablecoin rails focus on USDC and EURC, with USDT/DAI/PYUSD only when real config exists.
- Unsupported integrations show missing/not-connected states.

## Agent-Ready Metadata, Not Autonomous Payments

T Pay stores payment metadata that could be useful for future policy-aware automation:

- `createdBy`
- `permissionScope`
- `spendingLimit`
- `expiresAt`
- `sourceApp`
- `paymentPurpose`
- `riskLevel`
- `policyNote`

Current defaults keep behavior conservative:

- `createdBy = user`
- `riskLevel = low`
- `sourceApp = T Pay`

No autonomous agent payments are enabled. Circle Agent Stack, Gateway, and Nanopayments are marked as not connected until actually implemented.

## Testnet Safety

- T Pay is Arc Testnet only.
- No mainnet config should be added.
- Swap execution is not faked.
- Unified Balance values are not faked.
- Developer Debug reports redact secret-like values.
- Any prediction/market-style experiments are testnet experiments and require legal review before production.

## Recommended Grant Milestones

1. Harden Social USDC Payments: send/receive, contacts, split bill, merchant invoices, unified activity.
2. Complete App Kit same-chain stablecoin swaps for supported Arc Testnet rails.
3. Complete Unified Balance spend/bridge UX with honest fallback states.
4. Add hosted merchant dashboard/indexer for cross-device invoice status.
5. Explore user-approved Agent Stack payment proposals without autonomous execution by default.

