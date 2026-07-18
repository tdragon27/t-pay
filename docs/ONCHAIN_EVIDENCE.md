# T Pay Onchain Evidence

T Pay is an early-stage Social USDC Payment App deployed and tested on **Arc Testnet only**.

This page lists only contracts deployed as part of T Pay's own protocol footprint. Shared Arc and Circle infrastructure is intentionally excluded.

## Network

- Network: Arc Testnet
- Chain ID: `5042002`
- Explorer: <https://testnet.arcscan.app>
- Deployer: `0x248de490fCE3B639bCAb1A1E1bC96a0298D637F5`

## T Pay Contracts

### RecurringPayments

- Purpose: creates and executes user-authorized recurring USDC payments.
- Address: [`0x326774E87C37F65449ce509EE4872A58EFA4C64E`](https://testnet.arcscan.app/address/0x326774E87C37F65449ce509EE4872A58EFA4C64E#code)
- Creation transaction: [`0x0a68141796c66091150e38492d479b976ea0128026724313bced57b5d59aed42`](https://testnet.arcscan.app/tx/0x0a68141796c66091150e38492d479b976ea0128026724313bced57b5d59aed42)
- Verified source: yes.
- Test execution: [`0x607a9788e342b2ba686b254defe4af9a594202ea227124007680588e694bb4e1`](https://testnet.arcscan.app/tx/0x607a9788e342b2ba686b254defe4af9a594202ea227124007680588e694bb4e1)
- Evidence: a `0.05 USDC` subscription was created and its first payment was executed successfully.

### InvoiceManager

- Purpose: creates, pays, cancels, and tracks T Pay merchant invoices.
- Address: [`0x4F558D1BE50c32e599527b18c459353707E04707`](https://testnet.arcscan.app/address/0x4F558D1BE50c32e599527b18c459353707E04707#code)
- Creation transaction: [`0x3c1de82da6fa523e353e96bcf69802e38fcf54596e3033ccd473fe55dd748ef9`](https://testnet.arcscan.app/tx/0x3c1de82da6fa523e353e96bcf69802e38fcf54596e3033ccd473fe55dd748ef9)
- Verified source: yes.
- Test invoice creation: [`0x7f4ba8503345c2d12c5579b733b383b91bc61cfda18a93c0e7d2a134168a4519`](https://testnet.arcscan.app/tx/0x7f4ba8503345c2d12c5579b733b383b91bc61cfda18a93c0e7d2a134168a4519)
- Test invoice payment: [`0x52b1fbd7fd2c8d9b9deaed2fc7df40a8cb31b1ec3e8209568b9d74ad40c98754`](https://testnet.arcscan.app/tx/0x52b1fbd7fd2c8d9b9deaed2fc7df40a8cb31b1ec3e8209568b9d74ad40c98754)
- Evidence: a `0.05 USDC` invoice was created for a separate test payer and paid successfully.

### TPayPredictionMarket

- Purpose: creates T Pay testnet markets, accepts YES/NO USDC positions, resolves or cancels markets, and pays claims/refunds.
- Address: [`0x950c98E7F368E24EB5956e08688302E48A04E254`](https://testnet.arcscan.app/address/0x950c98E7F368E24EB5956e08688302E48A04E254#code)
- Creation transaction: [`0xcdffe276679bd582815a207f4bb01156605288fab4b524c95348f8e27d60bde7`](https://testnet.arcscan.app/tx/0xcdffe276679bd582815a207f4bb01156605288fab4b524c95348f8e27d60bde7)
- Verified source: yes.
- Example position transaction: [`0xa46239943090ffc0a7e02f8d513096c2f54e1cf62c8d76643a0990710c0a2422`](https://testnet.arcscan.app/tx/0xa46239943090ffc0a7e02f8d513096c2f54e1cf62c8d76643a0990710c0a2422)
- Evidence: multiple testnet market interactions and USDC token transfers are visible on the contract page.

## Not Claimed As T Pay Contracts

T Pay uses shared infrastructure but does **not** claim ownership or deployment of:

- Arc Testnet USDC, EURC, or cirBTC token contracts.
- Circle CCTP contracts or Circle App Kit infrastructure.
- Arc RPC, explorer, transaction memo, or Multicall predeploys.
- End-user EOAs or smart wallets.
- Supabase infrastructure.

## Current Stage

- Functional Arc Testnet prototype.
- Contracts and source code are public and verifiable.
- The transactions above are testnet validation evidence, not claims of production traction.
- `TPayMerchantSettlement.sol` and `PassportAnchor.sol` exist in the repository but are not listed here because the current canonical deployment record does not contain confirmed Arc Testnet addresses for them.

Machine-readable transaction evidence is stored in [`contracts/deployments/builderEvidence.json`](../contracts/deployments/builderEvidence.json).
