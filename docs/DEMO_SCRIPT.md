# T Pay Demo Script

T Pay is a Social USDC Payment App on Arc Testnet. This demo should stay honest: every payment is testnet-only, user-controlled, and clearly labeled.

## Demo Goal

Show that T Pay is not just a wallet dashboard. It coordinates USDC payment moments:

- Pay
- Receive
- Split Bill
- Merchant invoice
- Activity tracking
- Testnet readiness/debugging

## 1. Open T Pay

- Launch the Expo app.
- Show the Home screen title and Arc Testnet status.
- Point out `Testnet USDC only`.
- Copy the wallet address from the Home header if needed.

Talk track:

> T Pay is built for Arc Testnet USDC payments: social payments, split bills, and merchant invoices.

## 2. Show Home / Portfolio Clarity

- Show Balance Hero.
- Show primary actions: Pay, Receive, Split.
- Show Active Payments.
- Show Latest Activity preview.
- Avoid spending too much time on technical readiness cards from Home.

Talk track:

> The Home screen focuses on what needs action now, not a long transaction explorer.

## 3. Send USDC

- Tap Pay.
- Enter a test recipient and amount.
- Review the details before signing.
- Submit the transaction.
- Show pending/confirmed state.
- Open the explorer link if available.

Expected result:

- One payment intent.
- One activity item.
- Confirmed only after receipt confirmation.

## 4. Receive USDC

- Open Receive.
- Show QR code and copy wallet button.
- Explain that users can scan QR or copy the address directly.

## 5. Create Split Bill

- Open Split.
- Enter total USDC, people count, note, and receiver wallet.
- Use auto-divide for the simple demo.
- Create the split bill.

Show:

- Total amount.
- Amount per person.
- Split QR and payment link.
- Copy Link and Share actions.
- Progress card with collected / total amount.

## 6. Pay Split via QR / Link

- Open the split QR or payment link.
- Pay the prepared per-person USDC amount.
- Show split progress update.
- Explain completion modes:
  - complete by total received
  - complete by all participants paid

## 7. Create Merchant Invoice

- Open Merchant.
- Create an invoice with amount and label.
- Show QR/payment link.
- Keep the explanation testnet-only.

Talk track:

> This is useful for pop-up merchants, events, and small testnet checkout demos.

## 8. Pay Merchant Invoice

- Open invoice payment from QR/link.
- Review merchant, amount, and token.
- Submit payment.
- Show invoice status updates only after confirmed transaction.

## 9. Show Unified Activity

- Open Activity.
- Show that send, receive, split, merchant, FX/bridge readiness events can appear in one feed.
- Confirm Home only shows a compact preview.

## 10. Show FX / Swap Readiness

- Open FX / Swap.
- Show labels:
  - Same-chain swap
  - Arc Testnet
  - Testnet assets only
- If no live provider is configured, point out the preview/missing-provider state.
- Do not claim a live swap is available unless the app actually has App Kit, backend, or DEX route configured.

## 11. Show Developer Debug

- Open Developer Debug from Settings/Profile.
- Show configured/missing status for:
  - RPC
  - Supabase
  - App Kit
  - Swap
  - Unified Balance Kit
  - Agent-ready metadata
  - Gateway / Nanopayments not connected yet
- Copy debug report and mention it is support-safe and redacted.

## Demo Honesty Rules

- Do not claim mainnet readiness.
- Do not claim Circle Agent Stack is fully integrated.
- Do not claim Gateway or Nanopayments are live.
- Do not fake Unified Balance values.
- Do not fake swap execution.
- If something is missing, show the clear `configured/missing/not connected` state.

