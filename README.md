# T Pay

T Pay is a Social USDC Payment App for Arc Testnet. It helps people coordinate simple stablecoin payments: pay, receive, split bills, create merchant invoices, scan QR links, and track activity in one mobile-first app.

T Pay is testnet-only. Do not use it with mainnet funds.

## Why T Pay

Most wallets feel like asset dashboards. T Pay is designed around payment moments:

- Send USDC to a person.
- Receive USDC with a QR/link.
- Split a bill with friends.
- Create and pay merchant invoices.
- Track payment status without reading a block explorer.
- Demo Circle/Arc readiness without pretending unfinished integrations are live.

## Main Features

- Self-custodial wallet creation/import with secure local storage.
- Arc Testnet balances for USDC, EURC, and cirBTC, plus receive QR, send flow, and cached balance fallback.
- Smart QR and payment links for wallet requests, split bills, and invoices.
- Split Bill MVP for simple group payments: total USDC, people count, note, receiver wallet, QR/link sharing, collected progress, and optional Supabase sync.
- Merchant payment requests with QR/payment links, status tracking, CSV/export surfaces, and optional backend/indexer readiness.
- Unified Activity feed for send, receive, split, merchant, bridge, swap, and passport events.
- App Kit Swap readiness for same-chain stablecoin swaps on Arc Testnet.
- Unified Balance readiness card in Portfolio / Debug with honest configured/missing states.
- Agent-ready payment metadata at the data layer, while execution remains user-controlled.
- Developer Debug screen for testnet demo checks with support-safe redacted reports.

## Current Product Focus

T Pay should feel like a payment coordination dashboard, not a generic trading wallet.

Primary flows:

- Pay
- Receive
- Split Bill
- Merchant invoices
- Activity tracking
- Portfolio overview

Secondary readiness surfaces:

- App Kit Swap readiness
- Unified Balance readiness
- Bridge readiness
- Agent-readable metadata

## Arc Testnet Notes

- T Pay is built for Arc Testnet.
- USDC is the payment asset and native gas experience on Arc.
- UI copy should always make testnet status clear.
- Unsupported features must be marked as missing, preview, demo, or not connected.
- The app must not fake swap execution, Unified Balance values, Gateway, Nanopayments, or autonomous agent payments.

## Project Structure

```text
app/                     Expo Router screens and tabs
components/              Shared UI and payment dashboard components
constants/               Arc chain, token, route, storage, and theme config
hooks/                   Wallet, balance, network, payment dashboard, split hooks
lib/                     Viem clients, wallet helpers, Circle App Kit adapter
services/                Payment intents, activity, FX, merchant, split, debug, security
store/                   Zustand wallet/app state
utils/                   Formatting, links, dashboard logic, safe URL helpers
contracts/               Hardhat contracts, deploy scripts, and tests
supabase/                Split Bill migrations
backend-samples/         Optional Next.js backend/indexer sample
docs/                    Demo, grant, validation, and integration notes
```

## Requirements

- Node.js 20+
- npm
- Expo Go or an Expo development build
- Arc Testnet assets for demos: USDC, EURC, and cirBTC
- Optional Circle App Kit project id/key for live App Kit-backed flows
- Optional Supabase project for cross-device Split Bill sync

## Environment Setup

Copy the example file:

```bash
cp .env.example .env
```

Fill placeholders only with testnet values:

```bash
EXPO_PUBLIC_APP_KIT_PROJECT_ID=
EXPO_PUBLIC_ARC_RPC_URL=
EXPO_PUBLIC_ARC_CHAIN_ID=
EXPO_PUBLIC_ARC_USDC_ADDRESS=
EXPO_PUBLIC_ARC_DEX_ROUTER_ADDRESS=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_UNIFIED_BALANCE_ENABLED=
EXPO_PUBLIC_SWAP_ENABLED=
```

Compatibility note: the app also accepts `EXPO_PUBLIC_CIRCLE_APP_KIT_KEY` as an App Kit key alias.

Never commit `.env`, `.env.local`, `contracts/.env`, seed phrases, private keys, or backend API secrets.

## Run The Mobile App

```bash
npm install --legacy-peer-deps
npm run type-check
npm run lint
npm test
npx expo start -c
```

For iPhone with Expo Go, keep the project SDK aligned with your installed Expo Go SDK.

## Build / Export Smoke Test

```bash
npx expo export --platform ios --clear
```

A successful export writes the static bundle to `dist/`.

## Optional Supabase Split Bill Sync

1. Create a Supabase project.
2. Run the SQL migration in `supabase/migrations/20260518_split_bills.sql`.
3. Add the Supabase URL and anon key to `.env`.
4. Restart Expo.

The app should still work locally if Supabase is missing; it must show a clear configured/missing state.

## Optional Contracts

```bash
cd contracts
npm install
cp .env.example .env
npm test
npm run deploy:arc-testnet
```

After deploying testnet contracts, copy the deployed addresses into the root `.env` placeholders. Do not commit deployer keys.

## Documentation

- `docs/DEMO_SCRIPT.md` - step-by-step demo flow for videos and grant review.
- `docs/CIRCLE_ARC_GRANT_NOTES.md` - Circle/Arc grant positioning and readiness notes.
- `docs/TESTNET_VALIDATION_CHECKLIST.md` - manual test checklist before sharing a build.
- `docs/PRODUCTION_READINESS_BASELINE.md` - verified pre-change engineering baseline.
- `docs/SECURITY_AND_CORRECTNESS_AUDIT.md` - findings, fixes, and residual risks.
- `docs/PRODUCTION_READINESS_ROADMAP.md` - dependency-aware Sprints 2-6.
- `BACKEND_API.md` - optional backend/indexer API notes.
- `CHANGELOG.md` - completed upgrade notes.

## Screenshots

Add screenshots or demo frames here before publishing the GitHub repository:

```text
docs/screenshots/home.png
docs/screenshots/split-bill.png
docs/screenshots/merchant-payment-request.png
docs/screenshots/activity.png
docs/screenshots/developer-debug.png
```

## Security Notes

- Wallet secrets are stored locally with `expo-secure-store`.
- Developer Debug and copied reports must never include seed phrases, private keys, API keys, or raw secret-like env values.
- `EXPO_PUBLIC_*` values are bundled into the mobile app. Never place backend-only secrets there.
- Recovery phrases/private keys are never copied to the system clipboard. Record recovery phrases offline.
- AutoFlow never signs Send or Bridge tasks; each asset-moving transaction requires its normal review screen.
- A transaction hash is submission evidence, not confirmation. T Pay requires a successful receipt or provider completion state.
- Supabase Split sync and the reference Next.js backend remain testnet/demo infrastructure; see the production-readiness audit before public deployment.
- Testnet Community Picks are not production/legal-ready and should remain clearly labelled as testnet experiments.

## Useful Commands

```bash
npm run type-check
npm run lint
npm test
npx expo export --platform ios --clear
cd contracts
npm run compile
npm test
```

## Arc / Circle References Used In Implementation Notes

- https://docs.arc.io/llms.txt
- https://docs.arc.io/integrate/connect-to-arc
- https://docs.arc.io/arc/references/contract-addresses
- https://docs.arc.io/app-kit
- https://docs.arc.io/app-kit/send
- https://docs.arc.io/app-kit/bridge
- https://docs.arc.io/app-kit/swap
- https://docs.arc.io/app-kit/unified-balance

## License

No open-source license has been selected yet. Until a license is added, all rights are reserved by default.

