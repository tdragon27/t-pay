# Recurring + Invoice Contracts Setup

This guide covers the new onchain modules behind the `Recurring` and `Invoices` tabs in the mobile app.

## 1. Prepare the contracts workspace

```powershell
cd C:\Users\HLC\Downloads\t-pay\contracts
Copy-Item .env.example .env
```

Fill `contracts/.env`:

```env
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
DEPLOYER_PRIVATE_KEY=0x...
ARC_USDC_ADDRESS=0x...
# or reuse EXPO_PUBLIC_ARC_USDC_ADDRESS if you already keep it in the root app env
CONTRACT_OWNER=0x...
RECURRING_MIN_INTERVAL=86400
INVOICE_MAX_AMOUNT_USDC=100000
```

## 2. Compile and test locally

```powershell
cd C:\Users\HLC\Downloads\t-pay\contracts
npm install
npm run compile
npm test
```

Expected result:

- `RecurringPayments` tests pass
- `InvoiceManager` tests pass

## 3. Deploy to Arc testnet

```powershell
cd C:\Users\HLC\Downloads\t-pay\contracts
npm run deploy:arc-testnet
```

After deploy, copy these values:

- `RECURRING_PAYMENTS_ADDRESS=...`
- `INVOICE_MANAGER_ADDRESS=...`

The script also writes:

- `contracts/deployments/arcTestnet.json`

## 4. Connect the mobile app

Open the root app `.env` and set:

```env
EXPO_PUBLIC_RECURRING_ADDRESS=0x...
EXPO_PUBLIC_INVOICE_ADDRESS=0x...
```

Then restart Expo:

```powershell
cd C:\Users\HLC\Downloads\t-pay
npx expo start -c
```

## 5. Test in the app

### Recurring tab

1. Open `Recurring`
2. Create a recurring payment
3. Approve USDC when prompted
4. Wait until `nextPaymentAt` becomes due
5. Tap `Pay Now`

### Invoices tab

1. Open `Invoices`
2. Create an invoice
3. Open the invoice detail page
4. If you are the payer, pay the invoice
5. If you are the creator, test reminder / cancel flows

## Important note

Invoice metadata is still stored locally on the device right now.  
That means the onchain invoice exists, but rich invoice details are not yet synced across devices until we add backend or IPFS sync.
