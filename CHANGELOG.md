# Changelog

## 2026-07-14 - Lottie motion pivot and P0 Home stabilization

### Fixed
- Removed duplicate Home asset send actions, duplicate Pay navigation, fixed bottom-tab overlap, and made Active Payments cards content-driven.
- Standardized Home action colors, Title Case headings, and T Pay branding across onboarding and Settings.
- Removed the nested Home notice button structure that could produce unstable web interactions.
- Removed the unsupported real-time Three.js/R3F rendering path and all GLB/debug artifacts after physical-device compositing failures.
- Replaced the last malformed recurring-payment separator with valid UTF-8 text.

### Added
- Added original project-owned Lottie artwork for the Home balance coin, Pay, Request, Split, Swap, and post-splash loading logo.
- Added static reduced-motion/failure fallbacks, balance count-up, action haptics, and a small gyroscope card tilt.
- Bundled General Sans, Inter, and Space Mono locally and applied them to core wallet surfaces.

### Safety and compatibility
- Kept amount, address, review, confirmation, and signing screens free of heavy animation.
- Removed `three`, `@react-three/fiber`, `@react-three/drei`, and `expo-gl` from the runtime dependency graph.
- Aligned NetInfo, Local Authentication, Notifications, Expo Router, and random-values packages with Expo SDK 54.
- Added physical-device validation steps for Lottie fallbacks, Reduce Motion, balance count-up, and gyroscope tilt.

## 2026-07-13 - Universal Pay and Arc transaction extensions

### Added
- Added Universal Pay with explicit route review for direct Arc transfers, public onchain memos, and configured Circle Unified Balance USDC spends.
- Integrated Arc Testnet's official `Memo` predeploy and verify its `Memo`, `BeforeMemo`, and ERC-20 `Transfer` receipt events.
- Added merchant USDC batch payouts using the official `Multicall3From` predeploy.
- Added all-or-nothing batch simulation, a 20-recipient safety cap, duplicate-address prevention, and post-confirmation transfer-event verification.
- Added payment-intent, pending-transaction, unified-activity, and local-notification lifecycle support for batch payouts.
- Added behavior tests for Universal Pay route gating and batch payout validation.

### UX
- Home and Pay Hub now open Universal Pay as the primary payment flow while preserving Direct Transfer.
- Business Hub includes a compact Batch Payout entry.
- New screens reuse the quiet-fintech theme and lightweight Reanimated entry transitions; no new animation or 3D dependency was added.

### Safety
- Swap/bridge prerequisite routes never auto-sign a second transaction.
- A submitted transaction remains pending when receipt status is uncertain; T Pay warns users not to resubmit.
- Onchain memo text is explicitly presented as public data.

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

