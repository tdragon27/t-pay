# T Pay Contracts

This folder is a standalone Hardhat workspace for the onchain modules used by the mobile app.

## Contracts

- `src/RecurringPayments.sol`
- `src/InvoiceManager.sol`
- `src/TPayMerchantSettlement.sol`

## Setup

```bash
cd contracts
# Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
# cp .env.example .env

npm install
npm run compile
npm test
```

## Deploy to Arc testnet

Fill `.env` first:

```env
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
DEPLOYER_PRIVATE_KEY=0x...
ARC_USDC_ADDRESS=0x...
# or reuse EXPO_PUBLIC_ARC_USDC_ADDRESS from the root app env
CONTRACT_OWNER=0x...
RECURRING_MIN_INTERVAL=86400
INVOICE_MAX_AMOUNT_USDC=100000
```

Then deploy:

```bash
npm run deploy:arc-testnet
```

This writes deployment metadata to `deployments/arcTestnet.json` and prints:

- `RECURRING_PAYMENTS_ADDRESS=...`
- `INVOICE_MANAGER_ADDRESS=...`

## Mobile app integration

Copy the deployed addresses into the root app `.env`:

```env
EXPO_PUBLIC_RECURRING_ADDRESS=0x...
EXPO_PUBLIC_INVOICE_ADDRESS=0x...
```

Then restart the Expo app:

```bash
cd ..
npx expo start -c
```
