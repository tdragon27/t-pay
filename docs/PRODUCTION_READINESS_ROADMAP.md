# Production Readiness Roadmap

Sprint 1 hardens the Arc Testnet application, tests payment-critical pure logic, and improves CI. The following work must remain incremental and must not introduce mainnet configuration.

## Sprint 2 - Durable Backend And Supabase/Postgres

| Item | Why / dependencies | Risk | Size | Acceptance criteria | Likely modules |
| --- | --- | --- | --- | --- | --- |
| Wallet-signature server auth | Required before authoritative invoice/split mutation | High | L | Nonce challenge, expiry, replay protection, recovered address authorization | backend auth middleware, mobile API client |
| Durable invoice/payment schema | Replaces in-memory metadata and client authority | High | L | Constraints, foreign keys, immutable payment events, migrations and rollback notes | Postgres/Supabase migrations, backend store |
| Strict RLS | Closes TPAY-004 | High | L | Anonymous writes denied; merchant/payer access tested | Supabase policies/tests |
| Idempotent chain indexer | Prevents duplicate payment events | High | XL | Unique chain+txHash+logIndex, confirmation policy, reorg reconciliation | backend worker/indexer |
| Webhook replay controls | Needed for notifications/provider callbacks | Medium | M | Signature validation, timestamp window, unique event ID | backend API |
| Offline reconciliation | Preserves current local-first UX | Medium | M | Local pending state reconciles without overriding verified server state | services, AsyncStorage adapters |

Do not prematurely enable public write APIs, server-role keys in Expo, or client-controlled paid/collected fields.

## Sprint 3 - Recoverable Cross-Chain Payment

| Item | Dependencies | Risk | Size | Acceptance criteria | Likely modules |
| --- | --- | --- | --- | --- | --- |
| Persisted bridge state machine | Circle status adapter and durable storage | High | L | Source submission, attestation, mint, failure, recovery states survive restart | bridgeService, backend/indexer |
| Finality/confirmation policy | Chain-specific confirmations | High | M | No tx hash alone equals completion | bridge status adapter |
| Resume/recovery UX | Persisted state | High | M | Relaunch resumes monitoring and never auto-resubmits a source burn | Bridge screens/hooks |
| Quote expiry and reconfirmation | Quote metadata | Medium | M | Stale quote blocked; final payment always separately reviewed | App Kit adapter, payment intents |
| Duplicate prevention | Server idempotency | High | M | One source action/payment per intent | backend + mobile intent store |

Do not implement automatic bridge-to-payment continuation or background signing.

## Sprint 4 - Push Notifications And Merchant Pro

| Item | Dependencies | Risk | Size | Acceptance criteria | Likely modules |
| --- | --- | --- | --- | --- | --- |
| Device token registration | Authenticated backend | Medium | M | Revocable per-device tokens; no wallet secrets in payloads/logs | notifications service/backend |
| Verified payment triggers | Indexer | High | M | Notification only after verified receipt/event | backend worker |
| Merchant roles | Server auth/database | High | L | Owner/member least privilege and audit log | backend/RLS/dashboard |
| Analytics and CSV | Durable payment records | Medium | M | Reproducible totals, escaped CSV, permission checks | dashboard/API |
| Expiry/refund policy | Contract/product decision | High | L | Explicit rules and tests; no fake refund capability | contracts/services/docs |

Do not send sensitive invoice metadata in push payloads or claim refunds until contract support exists.

## Sprint 5 - Safe Payment Copilot

| Item | Dependencies | Risk | Size | Acceptance criteria | Likely modules |
| --- | --- | --- | --- | --- | --- |
| Draft-only intent parser | Structured schemas and policy rules | High | M | Natural language can only produce validated drafts | isolated server/parser |
| Permission/policy validation | Payment intent schema | High | L | Token, chain, recipient, spending limit, expiry validated | policy service |
| Human confirmation UI | Existing transaction review | Critical | M | Every transaction requires explicit fresh user approval | Send/Swap/Bridge review screens |
| Prompt-injection boundary | Isolated untrusted context | High | L | External text cannot call signing or access secrets | copilot adapter/security tests |
| Audit log | Durable backend | Medium | M | Draft source and edits recorded without secrets | backend events |

Do not provide seed/private-key access, autonomous signing, background payments, or tool execution from untrusted text.

## Sprint 6 - Release Engineering

| Item | Dependencies | Risk | Size | Acceptance criteria | Likely modules |
| --- | --- | --- | --- | --- | --- |
| EAS profiles/channels | Stable CI and environment matrix | Medium | M | development/preview/testnet profiles, no mainnet profile | eas.json, app config |
| Android/iOS build checks | EAS credentials and runners | Medium | M | Signed preview builds install and pass smoke checklist | CI/EAS |
| Privacy-safe crash reporting | Redaction policy | High | M | No wallet secrets, raw links, or sensitive clipboard values | error boundary/reporting |
| Versioning/releases | Build pipeline | Low | S | Semantic tags, changelog, release notes | package/app config/docs |
| Store/demo assets | Stable UI | Low | M | Screenshots, privacy copy, Arc Testnet labels | assets/docs |
| Release checklist | All prior sprints | Medium | S | Testnet validation signed off on physical iOS/Android devices | docs/TESTNET_VALIDATION_CHECKLIST.md |

Do not publish a production/mainnet build, weaken testnet labels, or add secrets to EAS/GitHub configuration without a separate reviewed release plan.
