const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = require("hardhat");

const DEPLOYMENTS_PATH = path.join(__dirname, "..", "deployments", "arcTestnet.json");
const OUTPUT_PATH = path.join(__dirname, "..", "deployments", "builderEvidence.json");
const EVIDENCE_AMOUNT = ethers.parseUnits("0.05", 6);
const GAS_FUNDING = ethers.parseEther("0.05");

async function waitForSuccess(transaction, label) {
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`${label} did not confirm successfully`);
  }
  return receipt;
}

async function main() {
  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;
  const network = await provider.getNetwork();

  if (network.chainId !== 5042002n) {
    throw new Error(`Builder evidence must run on Arc Testnet (5042002), received ${network.chainId}`);
  }

  const usdc = await ethers.getContractAt(
    [
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address,uint256) returns (bool)",
      "function approve(address,uint256) returns (bool)",
    ],
    deployment.usdcAddress,
    deployer
  );
  const invoice = await ethers.getContractAt("InvoiceManager", deployment.invoiceManagerAddress, deployer);
  const recurring = await ethers.getContractAt("RecurringPayments", deployment.recurringPaymentsAddress, deployer);
  const payer = ethers.Wallet.createRandom().connect(provider);

  const requiredTokenBalance = EVIDENCE_AMOUNT * 2n;
  const deployerTokenBalance = await usdc.balanceOf(deployer.address);
  if (deployerTokenBalance < requiredTokenBalance) {
    throw new Error("Deployer does not have enough Arc Testnet ERC-20 USDC for builder evidence");
  }

  const fundGasReceipt = await waitForSuccess(
    await deployer.sendTransaction({ to: payer.address, value: GAS_FUNDING }),
    "Payer gas funding"
  );
  const fundTokenReceipt = await waitForSuccess(
    await usdc.transfer(payer.address, EVIDENCE_AMOUNT),
    "Payer token funding"
  );

  const invoiceId = await invoice.nextInvoiceId();
  const dueAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const invoiceNumber = `TPAY-BUILDER-${Date.now()}`;
  const createInvoiceReceipt = await waitForSuccess(
    await invoice.createInvoice(
      payer.address,
      EVIDENCE_AMOUNT,
      dueAt,
      invoiceNumber,
      "tpay://builder-evidence/invoice"
    ),
    "Invoice creation"
  );

  const payerUsdc = usdc.connect(payer);
  const payerInvoice = invoice.connect(payer);
  const invoiceApproveReceipt = await waitForSuccess(
    await payerUsdc.approve(deployment.invoiceManagerAddress, EVIDENCE_AMOUNT),
    "Invoice approval"
  );
  const payInvoiceReceipt = await waitForSuccess(
    await payerInvoice.payInvoice(invoiceId),
    "Invoice payment"
  );

  const subscriptionId = await recurring.nextSubscriptionId();
  const recurringApproveReceipt = await waitForSuccess(
    await usdc.approve(deployment.recurringPaymentsAddress, EVIDENCE_AMOUNT),
    "Recurring approval"
  );
  const createSubscriptionReceipt = await waitForSuccess(
    await recurring.createSubscription(
      payer.address,
      EVIDENCE_AMOUNT,
      86400,
      0,
      0,
      "T Pay Builder evidence"
    ),
    "Recurring subscription creation"
  );
  const executeRecurringReceipt = await waitForSuccess(
    await recurring.executePayment(subscriptionId),
    "Recurring payment execution"
  );

  const evidence = {
    network: "Arc Testnet",
    chainId: Number(network.chainId),
    generatedAt: new Date().toISOString(),
    deployer: deployer.address,
    testPayer: payer.address,
    amountUsdc: "0.05",
    invoice: {
      contractAddress: deployment.invoiceManagerAddress,
      invoiceId: invoiceId.toString(),
      fundGasTx: fundGasReceipt.hash,
      fundTokenTx: fundTokenReceipt.hash,
      createTx: createInvoiceReceipt.hash,
      approveTx: invoiceApproveReceipt.hash,
      payTx: payInvoiceReceipt.hash,
    },
    recurring: {
      contractAddress: deployment.recurringPaymentsAddress,
      subscriptionId: subscriptionId.toString(),
      approveTx: recurringApproveReceipt.hash,
      createTx: createSubscriptionReceipt.hash,
      executeTx: executeRecurringReceipt.hash,
    },
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Builder evidence written to ${OUTPUT_PATH}`);
  console.log(`Invoice payment tx: ${payInvoiceReceipt.hash}`);
  console.log(`Recurring execution tx: ${executeRecurringReceipt.hash}`);
  console.log("No private key was written or printed.");
}

main().catch((error) => {
  console.error(error.shortMessage || error.message || error);
  process.exitCode = 1;
});
