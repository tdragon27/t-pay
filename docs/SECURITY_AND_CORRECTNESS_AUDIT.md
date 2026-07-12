# Security And Correctness Audit

Date: 2026-07-11
Scope: Entire `t-pay` repository, Arc Testnet only

## Severity Summary

| Severity | Confirmed | Fixed in Sprint 1 | Remaining/blocker |
| --- | ---: | ---: | ---: |
| Critical | 0 | 0 | 0 |
| High | 5 | 3 | 2 |
| Medium | 5 | 5 | 0 |
| Low | 1 | 1 | 0 |

## Findings

### TPAY-001 - Ambiguous provider fallback could submit a payment twice

- **Severity:** High
- **Status:** Fixed
- **Location:** `hooks/useSend.ts`, `sendToken`
- **Evidence:** USDC attempted App Kit submission and caught every error by submitting the same ERC-20 transfer through Viem. A post-broadcast response failure could therefore produce two valid transactions.
- **Impact:** Duplicate payment and loss of testnet assets; the same pattern would be unsafe for any future production release.
- **Scenario:** Provider A broadcasts, its response fails, then provider B broadcasts the fallback transfer.
- **Remediation:** One deterministic ERC-20 submission path. No automatic cross-provider retry after an ambiguous broadcast.
- **Verification:** Type-check/lint pass; regression lifecycle tests pass; source search confirms fallback removal.

### TPAY-002 - Bridge submission was displayed as completed

- **Severity:** High
- **Status:** Fixed
- **Location:** `services/bridgeService.ts`, `hooks/useBridge.ts`, `app/bridge.tsx`
- **Evidence:** A source transaction hash immediately set local status to `success`, without requiring Circle bridge status `complete`.
- **Impact:** Users could believe destination funds arrived and repeat or continue a payment prematurely.
- **Scenario:** CCTP burn is submitted but attestation/mint is pending; UI shows completion.
- **Remediation:** Source hash moves to `attesting`; only Circle `complete` becomes success. Timeout becomes `recovery_required`, and jobs with a source hash cannot be blindly retried.
- **Verification:** Type-check/lint pass and source-state review.

### TPAY-003 - AutoFlow could autonomously sign Send and Bridge transactions

- **Severity:** High
- **Status:** Fixed
- **Location:** `services/taskEngine.ts`, `runTask`
- **Evidence:** The engine loaded the private key and executed Send/Bridge tasks in a sequence after one flow action.
- **Impact:** A planned or tampered workflow could move assets without a transaction-specific review boundary.
- **Scenario:** A flow containing faucet + send + bridge executes all steps with no separate confirmation for each asset-moving transaction.
- **Remediation:** Only faucet tasks may auto-execute. Send and Bridge fail closed and require their normal individual review screens.
- **Verification:** Regression test asserts faucet=true, send/bridge=false.

### TPAY-004 - Supabase anonymous clients can write authoritative Split Bill payment state

- **Severity:** High
- **Status:** Open, external architecture blocker
- **Location:** `supabase/migrations/20260518_split_bills.sql`; RPC functions and permissive anonymous RLS policies
- **Evidence:** Public clients can invoke payment-state mutations and policies do not cryptographically prove payer, merchant, transaction, or bill ownership.
- **Impact:** An attacker with the public anon key can mark participants paid or alter collected state without a verified on-chain payment.
- **Scenario:** A caller submits an arbitrary amount/tx hash to the SECURITY DEFINER function for a known split identifier.
- **Remediation:** Move authoritative mutation behind a wallet-signature-authenticated backend/indexer. Verify chain ID, receiver, token, amount, receipt status, log identity, and idempotency key before a server role updates rows. Restrict anonymous RLS to the minimum read surface.
- **Verification:** Static schema and trust-boundary review. Not safely patchable without the Sprint 2 backend/auth design; current Split sync must remain testnet-only.

### TPAY-005 - Reference invoice API lacks wallet authorization and durable storage

- **Severity:** High when configured; environment-dependent
- **Status:** Open, reference backend must not be treated as production
- **Location:** `backend-samples/next-app/app/api/invoices/**`, `invoiceMetadataStore.ts`
- **Evidence:** Invoice GET/POST/PATCH operations are not bound to a signed wallet identity, and metadata is held in an in-memory Map.
- **Impact:** Unauthorized reads/updates and loss of records on restart in any public deployment.
- **Scenario:** A caller guesses an invoice ID and patches its metadata/status without proving merchant ownership.
- **Remediation:** Add SIWE-style challenge/signature authentication, merchant authorization, schema validation, persistent Postgres storage, idempotency, and audit events before configuring this backend in a public app.
- **Verification:** Static route/data-store review. Tracked as Sprint 2 work.

### TPAY-006 - Reverted receipts could be recorded as success

- **Severity:** Medium
- **Status:** Fixed
- **Location:** `services/invoiceService.ts`, `merchantService.ts`, `predictionMarketService.ts`, `recurringService.ts`, `hooks/useSend.ts`
- **Evidence:** `waitForTransactionReceipt` results were awaited but `receipt.status` was not consistently asserted.
- **Impact:** Local invoice/payment/market state could report success for a mined revert.
- **Remediation:** Shared `waitForSuccessfulReceipt`/`assertSuccessfulReceipt`; every reviewed contract write now fails on a reverted receipt.
- **Verification:** Regression test covers success and revert; no direct `waitForTransactionReceipt` remains in app services/hooks.

### TPAY-007 - Client environment could override the Arc chain and allow plaintext RPC

- **Severity:** Medium
- **Status:** Fixed
- **Location:** `constants/chains.ts`, `lib/viemClient.ts`, dependent chain defaults
- **Evidence:** Chain ID came from a public environment value and RPC validation accepted any string beginning with `http`.
- **Impact:** Operator misconfiguration could connect signing/reads to an unexpected chain or plaintext endpoint.
- **Remediation:** Chain ID is fixed to Arc Testnet `5042002`; RPC requires `https:` and WebSocket requires `wss:` with official fallbacks.
- **Verification:** Tests reject HTTP/malformed RPC values; type-check/lint pass.

### TPAY-008 - Wallet secrets were copied to the system clipboard

- **Severity:** Medium
- **Status:** Fixed
- **Location:** onboarding create-wallet, Settings recovery phrase, Security Backup private-key export
- **Evidence:** Seed phrase/private key values were passed to Expo Clipboard.
- **Impact:** Other apps, clipboard sync, screenshots, or later paste actions could expose wallet control material.
- **Remediation:** Secret clipboard copy/export is disabled. Recovery phrase remains visible only in the explicit authenticated backup flow and users are directed to write it down offline.
- **Verification:** Source search confirms no seed/private key clipboard write remains.

### TPAY-009 - Payment intent normalization lost decimal precision

- **Severity:** Medium
- **Status:** Fixed
- **Location:** `services/paymentIntentService.ts`, `utils/tpayLogic.ts`
- **Evidence:** Amounts were converted through JavaScript `Number` and rounded with `toFixed(6)`.
- **Impact:** High-precision assets such as cirBTC could be rounded or altered in persisted intent metadata.
- **Remediation:** Canonical decimal-string normalization without floating-point conversion.
- **Verification:** Tests preserve `0.00000001`, decimal comma input, and leading/trailing zero normalization.

### TPAY-010 - Payment intent status regressions were accepted

- **Severity:** Medium
- **Status:** Fixed
- **Location:** `utils/tpayLogic.ts`, `services/paymentIntentService.ts`, `hooks/useSend.ts`
- **Evidence:** Legacy broad status writes did not enforce a signing/submission/confirmation lifecycle.
- **Impact:** Confirmed or failed state could regress to pending/submitted, producing duplicate UX and inaccurate activity.
- **Remediation:** Typed legal transitions and terminal states; illegal updates throw; Send records hash only after submission and confirms only after successful receipt.
- **Verification:** Lifecycle and illegal-transition tests pass.

### TPAY-011 - Unsafe external URLs and oversized payment payloads

- **Severity:** Low
- **Status:** Fixed
- **Location:** `utils/safeOpenUrl.ts`, `services/paymentRequestService.ts`
- **Evidence:** External input handling needed explicit scheme and length boundaries.
- **Impact:** Unsafe scheme attempts, resource-heavy QR payloads, and sensitive query leakage in logs.
- **Remediation:** Scheme allowlist, 4096-character limit, hostile-scheme rejection before address extraction, and redacted URL logs.
- **Verification:** URL/QR regression tests pass.

## Smart Contract Review

`TPayMerchantSettlement`, `InvoiceManager`, `RecurringPayments`, `PredictionMarket`, and `PassportAnchor` use OpenZeppelin primitives and expected guards such as SafeERC20, ReentrancyGuard, Pausable, and Ownable where relevant. No confirmed Critical/High Solidity vulnerability was found in this pass. Prediction outcome resolution is owner-trusted and must be disclosed as a centralization assumption, not represented as trustless arbitration.

## Secret And Supply-Chain Review

- No tracked `.env` or confirmed private key/seed/API secret was found in the reviewed Git history and source scan.
- Root `.env.example` contains public placeholders only; backend secrets belong only in backend/server configuration.
- CI permissions are read-only and no secrets are embedded in the workflow.
- Dependency audit results are recorded in the final verification notes; dependency alerts still require normal update/triage discipline.
- Non-force dependency remediation updated compatible Expo, Circle App Kit, Viem, Ethers, Axios, and transitive packages. Root production audit now has no Critical/High findings; 28 Moderate and 7 Low remain in Expo/Circle/transitive chains where the reported automatic fix requires breaking major changes. Contract dependencies report zero vulnerabilities.
- Metro export still warns about package `exports` fallbacks for Noble hashes/curves and `rpc-websockets`; both iOS and Android bundles complete successfully. These warnings remain compatibility debt, not proof of a runtime vulnerability.

## Residual Risk

The repository is materially safer for public **testnet** demos, but not production/mainnet ready. The two open High findings require a durable authenticated backend/indexer and database authorization design. Mobile certificate pinning, robust secret-memory zeroization, bridge restart recovery, and formal contract review remain defense-in-depth work.
