# Production Readiness Baseline

Date: 2026-07-11
Branch: `codex/production-readiness-sprint-1`
Target: Arc Testnet only (`chainId 5042002`)

## Architecture

- Expo/React Native application under `app/`, with Expo Router entry points.
- Wallet and chain integration under `lib/`, `hooks/`, `services/`, and `store/`.
- Payment surfaces: Send/Receive, QR/deep links, payment intents, Split Bill, merchant invoices, recurring payments, FX/Swap, Bridge, activity, and pending transactions.
- Self-custodial secrets are stored with Expo SecureStore; non-secret application state uses AsyncStorage.
- Optional Supabase Split Bill sync is defined in `supabase/migrations/`.
- Optional Next.js reference backend is under `backend-samples/next-app/`.
- Solidity contracts, Hardhat configuration, deployment scripts, and tests are under `contracts/`.

## Initial Verification

The following checks were executed before the Sprint 1 hardening changes:

| Command | Initial result |
| --- | --- |
| `npm run type-check` | Passed |
| `npm run lint` | Passed |
| `npm test` | Passed, 10 tests |
| `npx expo export --platform ios --clear` | Failed because `package.json` contained a UTF-8 BOM |
| `npx expo export --platform android --clear` | Passed |
| `npm run compile` in `contracts/` | Passed |
| `npm test` in `contracts/` | Passed, 10 tests |

The BOM was removed without changing package semantics. The final verification section in the audit records post-change results.

## Sprint 1 Final Verification

| Command | Final result |
| --- | --- |
| `npm run type-check` | Passed |
| `npm run lint` | Passed with zero warnings/errors |
| `npm test` | Passed, 17 tests |
| `npx expo export --platform ios --clear` | Passed; Metro emitted known package-export fallback warnings |
| `npx expo export --platform android --clear` | Passed; Metro emitted known package-export fallback warnings |
| `npm run compile` in `contracts/` | Passed |
| `npm test` in `contracts/` | Passed, 10 tests |
| `npm audit --omit=dev` in root | No Critical/High after non-force fixes; 28 Moderate and 7 Low remain |
| `npm audit --omit=dev` in `contracts/` | 0 vulnerabilities |

The first parallel iOS/Android export attempt failed with Windows `EPERM` because both processes competed for `dist/assets`. Sequential reruns passed; this was an invocation collision, not an application defect.

## Environment And Assumptions

- No production or mainnet credentials were used.
- Live Supabase, Circle App Kit, bridge attestation, and external RPC behavior cannot be fully proven by local static tests.
- `EXPO_PUBLIC_*` values are treated as public client configuration, never as secrets.
- `.env` is ignored and was not found in tracked Git history during the local secret review.
- Contract addresses supplied through environment variables remain operator-controlled; deploying or changing them requires independent verification.

## Initial Risk Areas

- Ambiguous send failures could trigger a second provider submission.
- Bridge source submission was treated as bridge completion.
- AutoFlow could load the private key and execute Send/Bridge without a separate review boundary.
- Mined-but-reverted receipts were not consistently rejected.
- Supabase anonymous clients could mutate authoritative Split Bill payment state.
- The reference invoice backend had no wallet authentication and used in-memory storage.
- Payment amounts were normalized through JavaScript `Number`, losing high precision.
- Seed phrases/private keys could be copied to the system clipboard.
- CI did not cover all app, Expo, and contract checks required for pull requests.
