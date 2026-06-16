const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RecurringPayments", function () {
  async function fixture() {
    const [owner, payer, payee] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockUSDC");
    const usdc = await Token.deploy();
    await usdc.waitForDeployment();

    const Recurring = await ethers.getContractFactory("RecurringPayments");
    const recurring = await Recurring.deploy(await usdc.getAddress(), owner.address, 60);
    await recurring.waitForDeployment();

    await usdc.mint(payer.address, ethers.parseUnits("1000", 6));
    await usdc.connect(payer).approve(await recurring.getAddress(), ethers.MaxUint256);

    return { owner, payer, payee, usdc, recurring };
  }

  it("creates and executes a subscription", async function () {
    const { payer, payee, recurring, usdc } = await fixture();
    const startAt = (await ethers.provider.getBlock("latest")).timestamp + 120;
    await recurring.connect(payer).createSubscription(payee.address, ethers.parseUnits("25", 6), 3600, startAt, 0, "Payroll");

    const ids = await recurring.getPayerSubscriptions(payer.address);
    expect(ids.length).to.equal(1);
    expect(await recurring.isDue(ids[0])).to.equal(false);

    await ethers.provider.send("evm_setNextBlockTimestamp", [startAt + 1]);
    await ethers.provider.send("evm_mine", []);

    await expect(recurring.executePayment(ids[0])).to.emit(recurring, "PaymentExecuted");

    expect(await usdc.balanceOf(payee.address)).to.equal(ethers.parseUnits("25", 6));
  });

  it("pauses and resumes a subscription", async function () {
    const { payer, payee, recurring } = await fixture();
    const startAt = (await ethers.provider.getBlock("latest")).timestamp + 120;
    await recurring.connect(payer).createSubscription(payee.address, ethers.parseUnits("10", 6), 3600, startAt, 0, "Ops");

    const [id] = await recurring.getPayerSubscriptions(payer.address);
    await recurring.connect(payer).pauseSubscription(id);
    expect((await recurring.getSubscription(id)).active).to.equal(false);

    await recurring.connect(payer).resumeSubscription(id);
    expect((await recurring.getSubscription(id)).active).to.equal(true);
  });
});

describe("InvoiceManager", function () {
  async function fixture() {
    const [owner, creator, payer, stranger] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockUSDC");
    const usdc = await Token.deploy();
    await usdc.waitForDeployment();

    const InvoiceManager = await ethers.getContractFactory("InvoiceManager");
    const invoiceManager = await InvoiceManager.deploy(await usdc.getAddress(), owner.address, ethers.parseUnits("100000", 6));
    await invoiceManager.waitForDeployment();

    await usdc.mint(payer.address, ethers.parseUnits("500", 6));
    await usdc.connect(payer).approve(await invoiceManager.getAddress(), ethers.MaxUint256);

    return { owner, creator, payer, stranger, usdc, invoiceManager };
  }

  it("creates and pays an invoice", async function () {
    const { creator, payer, invoiceManager, usdc } = await fixture();
    const dueAt = (await ethers.provider.getBlock("latest")).timestamp + 86400;
    await invoiceManager.connect(creator).createInvoice(payer.address, ethers.parseUnits("50", 6), dueAt, "INV-1", "local_1");

    const ids = await invoiceManager.getCreatorInvoices(creator.address);
    expect(ids.length).to.equal(1);

    await invoiceManager.connect(payer).payInvoice(ids[0]);
    const invoice = await invoiceManager.getInvoice(ids[0]);

    expect(invoice.status).to.equal(1);
    expect(await usdc.balanceOf(creator.address)).to.equal(ethers.parseUnits("50", 6));
  });

  it("shows overdue status after due date passes", async function () {
    const { creator, payer, invoiceManager } = await fixture();
    const dueAt = (await ethers.provider.getBlock("latest")).timestamp + 10;
    await invoiceManager.connect(creator).createInvoice(payer.address, ethers.parseUnits("5", 6), dueAt, "INV-2", "local_2");

    const [id] = await invoiceManager.getCreatorInvoices(creator.address);
    await ethers.provider.send("evm_setNextBlockTimestamp", [dueAt + 5]);
    await ethers.provider.send("evm_mine", []);

    const invoice = await invoiceManager.getInvoice(id);
    expect(invoice.status).to.equal(3);
  });
});
