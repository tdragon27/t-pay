# Arc Payment Extensions in T Pay

T Pay remains Arc Testnet-only. This document records which payment routes are live, which are capability-gated, and what the app verifies before reporting success.

## Universal Pay

Universal Pay chooses a route from data that is actually available:

1. **Direct Arc payment** when the selected USDC, EURC, or cirBTC balance covers the amount.
2. **Onchain memo payment** when the user opts in and supplies a public reference.
3. **Circle Unified Balance USDC spend** only when App Kit is configured and confirmed Unified Balance data covers the amount.
4. **Swap first** or **fund Arc first** as a navigation recommendation only. T Pay does not automatically sign a second transaction.

Every executable route has an explicit review and confirmation step. Missing capabilities never fall back to fake balances, fake routes, or fake success.

## Transaction Memo

- Official Arc Testnet predeploy: `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`.
- The memo and reference are public onchain data.
- T Pay checks deployed bytecode, token balance, and simulation before signing.
- After confirmation it verifies exactly one `BeforeMemo`, one `Memo`, and the expected ERC-20 `Transfer` event.
- Sender, target, calldata hash, memo ID, memo bytes, recipient, and amount must match the reviewed payment.
- Arc's Memo route is EOA-only. T Pay's current self-custodial wallet is an EOA.

Official guide: <https://docs.arc.io/arc/tutorials/send-usdc-with-transaction-memo>

## Batch USDC Payout

- Official Arc Testnet predeploy: `0x522fAf9A91c41c443c66765030741e4AaCe147D0`.
- Every subcall targets the official Arc USDC ERC-20 interface.
- Every call uses `allowFailure: false`, so one failed transfer reverts the full batch.
- T Pay caps one mobile batch at 20 unique recipients.
- The total is checked against the wallet's Arc USDC balance before simulation.
- A confirmed result is marked verified only if every expected USDC `Transfer` event matches sender, recipient, and amount.

Official guide: <https://docs.arc.io/arc/tutorials/batch-usdc-transfers>

## Operational Notes

- Official addresses are centralized in `constants/chains.ts` and are not user-supplied.
- RPC uncertainty after broadcast leaves a payment in Pending state. Users are warned not to resubmit.
- Private keys stay in platform SecureStore and are loaded only for the explicit signing action.
- Memo and Multicall3From addresses must be included in future compliance/indexer monitoring because Arc preserves the original sender through these contracts.

Official address registry: <https://docs.arc.io/arc/references/contract-addresses>
