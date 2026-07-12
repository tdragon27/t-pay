# Contributing To T Pay

Thanks for helping improve T Pay. The project is currently focused on a polished Arc Testnet demo and grant-review-ready repository.

## Local Setup

```bash
npm install --legacy-peer-deps
cp .env.example .env
npm run type-check
npm run lint
npm test
npx expo start -c
```

Use testnet values only. Never commit `.env`, private keys, seed phrases, or backend secrets.

## Before Opening A Pull Request

Run:

```bash
npm run type-check
npm run lint
npm test
```

For mobile smoke testing, also run:

```bash
npx expo export --platform ios --clear
npx expo export --platform android --clear
cd contracts
npm run compile
npm test
```

## Product Direction

T Pay should stay focused on social USDC payments on Arc Testnet:

- Send and receive Arc Testnet assets.
- Split Bill for simple group payments.
- Merchant QR payment requests.
- Unified activity and portfolio overview.
- Honest readiness states for Circle App Kit, swap, bridge, and unified balance.

Do not add mainnet configuration or claim unsupported features are live.

## Transaction Safety Rules

- Do not retry a payment through another provider after an ambiguous broadcast error.
- Do not mark a transaction successful until its receipt status is successful.
- Do not mark a bridge complete until the bridge provider reports completion.
- Do not add autonomous signing or background transaction execution.
- Add a behavior-based regression test for every payment-state or parsing change.
