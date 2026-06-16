const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = require("hardhat");

function requireAnyEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required env var. Expected one of: ${names.join(", ")}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const usdcAddress = requireAnyEnv("ARC_USDC_ADDRESS", "EXPO_PUBLIC_ARC_USDC_ADDRESS");
  const owner = process.env.CONTRACT_OWNER || deployer.address;
  const recurringMinInterval = BigInt(process.env.RECURRING_MIN_INTERVAL || "86400");
  const invoiceMaxAmountUsdc = process.env.INVOICE_MAX_AMOUNT_USDC || "100000";
  const invoiceMaxAmountRaw = ethers.parseUnits(invoiceMaxAmountUsdc, 6);
  const marketsFeeRecipient = process.env.MARKETS_FEE_RECIPIENT || owner;
  const marketsFeeBps = BigInt(process.env.MARKETS_FEE_BPS || "100");
  const marketsMaxBetUsdc = process.env.MARKETS_MAX_BET_USDC || "1000";
  const marketsMaxBetRaw = ethers.parseUnits(marketsMaxBetUsdc, 6);

  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Owner: ${owner}`);
  console.log(`USDC: ${usdcAddress}`);

  const RecurringPayments = await ethers.getContractFactory("RecurringPayments");
  const recurring = await RecurringPayments.deploy(usdcAddress, owner, recurringMinInterval);
  await recurring.waitForDeployment();

  const InvoiceManager = await ethers.getContractFactory("InvoiceManager");
  const invoice = await InvoiceManager.deploy(usdcAddress, owner, invoiceMaxAmountRaw);
  await invoice.waitForDeployment();

  const TPayPredictionMarket = await ethers.getContractFactory("TPayPredictionMarket");
  const markets = await TPayPredictionMarket.deploy(usdcAddress, marketsFeeRecipient, marketsFeeBps, marketsMaxBetRaw);
  await markets.waitForDeployment();

  const PassportAnchor = await ethers.getContractFactory("PassportAnchor");
  const passportAnchor = await PassportAnchor.deploy(owner);
  await passportAnchor.waitForDeployment();

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    await recurring.transferOwnership(owner);
    await invoice.transferOwnership(owner);
    await markets.transferOwnership(owner);
  }

  const deployment = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    owner,
    usdcAddress,
    recurringPaymentsAddress: await recurring.getAddress(),
    invoiceManagerAddress: await invoice.getAddress(),
    predictionMarketAddress: await markets.getAddress(),
    passportAnchorAddress: await passportAnchor.getAddress(),
    recurringMinInterval: recurringMinInterval.toString(),
    invoiceMaxAmountRaw: invoiceMaxAmountRaw.toString(),
    invoiceMaxAmountUsdc,
    marketsFeeRecipient,
    marketsFeeBps: marketsFeeBps.toString(),
    marketsMaxBetRaw: marketsMaxBetRaw.toString(),
    marketsMaxBetUsdc,
  };

  const outputPath = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));

  console.log("RECURRING_PAYMENTS_ADDRESS=" + deployment.recurringPaymentsAddress);
  console.log("INVOICE_MANAGER_ADDRESS=" + deployment.invoiceManagerAddress);
  console.log("PREDICTION_MARKET_ADDRESS=" + deployment.predictionMarketAddress);
  console.log("PASSPORT_ANCHOR_ADDRESS=" + deployment.passportAnchorAddress);
  console.log(`Deployment file written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

