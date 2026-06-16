# T Pay Testnet User Readiness

This checklist is for preparing T Pay before inviting external testnet users.

## Must Have Before Public Testnet

1. Wallet safety
   - Keep private keys and seed phrases only in SecureStore.
   - Add a backup confirmation step before allowing the first deposit.
   - Add a clear reset wallet flow with one final confirmation.

2. Network safety
   - Show the active chain name and chain id on the home screen.
   - Add a small RPC health indicator.
   - Keep demo fallbacks for FX, but label demo quotes clearly.

3. Testnet funding
   - Add a guided faucet screen with status, retry, and explorer link.
   - Detect when the user has zero USDC and surface the faucet action.

4. Transaction confidence
   - Show pending, confirmed, and failed states for every send, invoice payment, and recurring payment.
   - Add explorer links to transaction rows.
   - Store recent transactions locally and refresh from onchain events.

5. Merchant testing
   - Add a POS mode with a large QR code, amount lock, expiry countdown, and paid confirmation.
   - Add invoice sharing with a tpay:// deep link and fallback web link.
   - Export CSV with tx hash, paid time, amount, token, status, and customer note.

6. Guardrails
   - Add max send and max invoice limits for testnet.
   - Avoid unlimited ERC-20 approvals.
   - Add warnings when a contract address or token address is missing.

## High Value Next Upgrades

1. Testnet onboarding checklist
   - Create wallet
   - Backup seed
   - Claim test USDC
   - Send a small payment
   - Create and pay an invoice

2. User feedback loop
   - Add a simple feedback form in Settings.
   - Add a copy-debug-info button with app version, chain id, wallet address, and last error.

3. Merchant analytics
   - Daily volume
   - Payment success rate
   - Pending invoices
   - Average settlement time

4. Backend indexing
   - Persist invoices and payments outside the phone.
   - Add event listener endpoints for invoices, payments, and recurring payment executions.

5. Safer FX
   - Keep slippage and deadline protection on every live quote.
   - Disable live execution when router or StableFX backend is unavailable.
   - Show source labels: StableFX, DEX, or Demo.

## Testnet Release Gate

- `npm run type-check` passes.
- `npx expo export --platform ios --clear` passes.
- Contract tests pass in `contracts/`.
- A fresh wallet can claim test USDC.
- A fresh wallet can send USDC.
- A merchant can create an invoice.
- A payer can pay an invoice.
- The invoice status updates after payment.
- Transaction history shows the payment with an explorer link.

