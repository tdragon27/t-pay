# Changelog

## 2026-07-11 - Production Readiness Sprint 1

### Security and correctness
- Removed the ambiguous App Kit-to-Viem send fallback that could submit a duplicate USDC transfer.
- Added successful-receipt enforcement across Send, invoices, merchant payments, recurring payments, and prediction-market writes.
- Changed bridge handling so source submission enters attestation/recovery state and only provider completion reports success.
- Disabled autonomous Send/Bridge execution in AutoFlow; transaction-specific review is required.
- Fixed Arc Testnet chain ID to `5042002` and rejected plaintext/malformed Arc RPC configuration.
- Replaced floating-point payment intent normalization with precision-preserving decimal strings.
- Disabled recovery phrase and private-key clipboard copy.
- Added URL scheme/length checks, redacted URL logs, and stricter payment request parsing.

### Tests and CI
- Expanded root behavior tests from 10 to 17.
- CI now runs app type-check, lint, tests, iOS export smoke test, contract compile, and contract tests with read-only permissions and concurrency cancellation.
- CI fails on new High/Critical production dependency advisories for both app and contracts.
- Applied non-force dependency patches; root audit has no Critical/High advisories and contract audit reports zero vulnerabilities.

### Documentation
- Added production baseline, security/correctness audit, and Sprints 2-6 roadmap.
- Documented unresolved Supabase authorization and reference-backend authentication blockers.


## 2026-05-17 - Full Improvement Sprint, phase 1

### Added
- Auto-lock foundation with PIN/biometric setup and lock screens.
- App-wide network state provider and persistent offline read-only banner.
- Address Book with add/edit/delete/search/export JSON and Send contact picker.
- Send hardening: PIN/biometric gate, offline guard, 3-second debounce, pending transaction persistence, and stuck-pending explorer CTA.
- Global fiat preference service for USD/VND/EUR with 5-minute CoinGecko cache and Settings toggle.
- Expo Notifications runtime service with push token storage, local notifications, and category preferences.
- Advanced Split Bill screen with participants, equal/custom shares, individual payment links, and local tracking.
- History Pro screen with filters, search, contact-name display, pending tx merge, and CSV export.
- PassportAnchor smart contract, deployment output, app ABI, and service for optional on-chain achievement anchoring.
- Key rotation diagnostics for public env placeholders and Settings warning banner.
- HTTPS/fail-closed secure network wrapper for future API integrations and pinning-required builds.
- QR scanner throttle and malformed QR try/catch handling.
- Merchant dashboard improvements: merchant-address lookup, live index refresh, CSV export, metrics, and CSS revenue chart.
- Next.js `/pay` fallback page for request-to-pay links.
- `BACKEND_API.md` documenting backend endpoints.

### Hardened
- Seed phrase reveal now requires PIN/biometric unlock.
- Private-key export now requires PIN/biometric unlock after the existing explicit confirmation.
- FX, Bridge, Invoice Pay/Cancel/Reminder, and Market actions now block while offline and require unlock before signing.

### Verified
- `npm run type-check` passes.
- `npm run lint` passes with 26 pre-existing warnings only.
- `npx expo export --platform ios --clear` succeeds.
- `contracts`: `npm run compile` succeeds after adding `PassportAnchor.sol`.

### Notes / TODO
- Native SSL certificate pinning requires a development build/native module; Expo Go can only enforce HTTPS and fail-closed when `EXPO_PUBLIC_PINNING_REQUIRED=true`.
- Backend dashboard build was not run because `backend-samples/next-app/node_modules` is not installed in this workspace.
- Gas sponsorship still depends on actual Arc/Circle paymaster readiness or a configured backend relay.
- Push notifications require APNs/FCM/EAS project configuration for production delivery.

