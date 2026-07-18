# T Pay Arc Testnet Validation Checklist

Use this checklist before sharing a GitHub repo, demo video, or Circle/Arc grant build. Keep T Pay on Arc Testnet only and never use mainnet funds.

## Repository / Demo Readiness

- [ ] README explains T Pay as a Social USDC Payment App on Arc Testnet.
- [ ] `.env.example` contains placeholders only, no real keys or addresses.
- [ ] `.env`, `.env.local`, and `contracts/.env` are not committed.
- [ ] Demo screenshots or placeholders are prepared in `docs/screenshots/`.
- [ ] Developer Debug copy report redacts seed phrases, private keys, API keys, and raw secret-like env values.

## Environment

- [ ] `.env` contains Arc Testnet RPC, chain id, explorer, and USDC address.
- [ ] App clearly shows `Arc Testnet` and `Testnet USDC only`.
- [ ] Developer Debug opens from Settings/Profile.
- [ ] Developer Debug shows RPC configured/missing correctly.
- [ ] Developer Debug shows Supabase configured/missing correctly.
- [ ] Developer Debug shows App Kit configured/missing correctly.
- [ ] Developer Debug shows Swap configured/missing correctly.
- [ ] Developer Debug shows Unified Balance configured/missing correctly.
- [ ] Developer Debug marks Gateway/Nanopayments as not connected unless actually implemented.

## Wallet

- [ ] Create wallet completes and stores the wallet locally.
- [ ] Import wallet works with a valid seed phrase or private key.
- [ ] Wallet session survives app restart.
- [ ] Security/PIN setting does not block normal navigation when disabled for testing.
- [ ] Seed/private-key export requires PIN/biometric and explicit confirmation.

## Faucet / Balance

- [ ] Faucet/testnet USDC instructions open correctly.
- [ ] Arc Testnet USDC balance loads from RPC.
- [ ] Balance refresh works from Home/Portfolio and Developer Debug.
- [ ] When RPC fails, the app shows the last cached balance with a clear cached/offline warning.
- [ ] No fake multichain balances are shown.

## Send / Receive

- [ ] Send USDC succeeds and creates one payment intent.
- [ ] Send USDC rejected by wallet marks intent/activity as failed, not confirmed.
- [ ] Send USDC failed onchain marks pending tx/activity as failed.
- [ ] Receive QR displays the correct wallet address.
- [ ] Receive screen has a copy wallet button and shows copied feedback.
- [ ] Scanning Receive QR opens the expected Send/Pay flow.

## Universal Pay / Arc Extensions

- [ ] Direct route is selected only when the chosen Arc token balance covers the amount.
- [ ] Onchain memo requires a reference and clearly warns that memo data is public.
- [ ] Memo payment confirms only when `BeforeMemo`, `Memo`, and token `Transfer` events match the reviewed payment.
- [ ] Unified Balance appears only when App Kit is configured, its confirmed balance source loaded, and USDC covers the amount.
- [ ] A Unified Balance receipt/RPC uncertainty remains Pending and does not invite a duplicate submit.
- [ ] Swap-first and bridge-first routes open their dedicated review screens and never auto-sign a follow-up payment.
- [ ] Batch payout rejects invalid/duplicate wallets, zero values, more than 20 recipients, and totals above the USDC balance.
- [ ] Batch payout simulates all calls before signing and uses all-or-nothing execution.
- [ ] Completed batch shows an event-verified badge only after every expected USDC `Transfer` event matches.
- [ ] Batch payout creates one payment intent and one unified activity item for its single transaction hash.

## Split Bill

- [ ] Create Split Bill with Total USDC, People, Note, Receiver Wallet, and Expiry.
- [ ] Amount per person is calculated correctly.
- [ ] Result screen shows Split QR, payment link, Copy Link, and Share.
- [ ] Split history filters All / Open / Partial / Complete / Expired work.
- [ ] Split cards show collected / total amount and progress bar.
- [ ] Split QR/payment link opens Send prefilled with receiver wallet, amount per person, note, and split ID.
- [ ] Split becomes Partial when collected amount > 0 and less than total.
- [ ] Split becomes Complete when collected amount >= total amount.
- [ ] Expired split cannot be paid.
- [ ] Cancelled split cannot be paid if cancellation is available.
- [ ] Duplicate split payment does not create duplicate activity/payment intent records.

## Merchant

- [ ] Create merchant invoice.
- [ ] Invoice QR/payment link opens Pay Invoice screen.
- [ ] Pay merchant invoice succeeds and marks invoice paid only after receipt confirmation.
- [ ] Failed/rejected payment does not mark invoice paid.
- [ ] Merchant payment intent ID is stable for `invoiceId + txHash`.
- [ ] Merchant CSV/export includes txHash and status data where available.

## Activity / History

- [ ] Unified Activity Feed shows send/pay as outgoing.
- [ ] Unified Activity Feed shows receive/merchant collection/split collection as incoming where applicable.
- [ ] Same txHash appears once, not duplicated across pending/activity/cache.
- [ ] Home shows only a compact Latest Activity preview.
- [ ] Full History remains available from Activity.
- [ ] Copy txHash / explorer link works where txHash exists.

## FX / Bridge

- [ ] FX screen says Same-chain swap / Arc Testnet / Testnet assets only.
- [ ] FX screen shows preview/missing-provider state if no live route is configured.
- [ ] Swap execution button does not create fake success states.
- [ ] Swap executes only when App Kit, StableFX backend, or Arc DEX route is truly configured.
- [ ] Bridge screen shows App Kit/CCTP availability clearly.
- [ ] Bridge failure shows an actionable error instead of blank loading.

## Developer Debug

- [ ] Refresh RPC status updates the current status.
- [ ] Refresh balance triggers a balance refetch.
- [ ] Copy debug report copies a support-safe report.
- [ ] Clear local cache clears pending txs/activity/intents without deleting wallet or contacts.
- [ ] Open latest tx in Arc Explorer works when a txHash exists.

## Final Smoke Test

- [ ] `npm run type-check` passes.
- [ ] `npm run lint` passes with zero warnings.
- [ ] `npm test` passes.
- [ ] `npx expo export --platform ios --clear` completes successfully.

## Lottie Motion - Physical iPhone Only

- [ ] Native splash shows the static T Pay mark before the React loading scene.
- [ ] React Lottie loading scene exits in under 2 seconds and falls back to the static T mark without a blank screen.
- [ ] Home balance coin loops smoothly for about 6-8 seconds per cycle and never covers the balance or eye control.
- [ ] A balance change runs the 600-800 ms count-up without shifting the surrounding layout.
- [ ] Home balance card tilt stays subtle (about +/-4 degrees) and stops when Reduce Motion is enabled.
- [ ] Pay / Request / Split / Swap icons react for about 200 ms with light haptic feedback.
- [ ] Send, Swap, Split, address entry, transaction review, and signing screens contain no heavy animation.
- [ ] Reduce Motion replaces looping/action animation with a clear static fallback.
- [ ] App remains responsive after backgrounding/foregrounding and repeatedly opening Home.

