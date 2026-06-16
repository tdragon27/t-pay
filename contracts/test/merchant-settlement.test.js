const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('TPayMerchantSettlement', function () {
  async function fixture() {
    const [owner, merchant, payer, stranger] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('MockUSDC');
    const usdc = await Token.deploy();
    await usdc.waitForDeployment();

    const Settlement = await ethers.getContractFactory('TPayMerchantSettlement');
    const settlement = await Settlement.deploy([await usdc.getAddress()], ethers.parseUnits('100000', 6));
    await settlement.waitForDeployment();

    await usdc.mint(payer.address, ethers.parseUnits('1000', 6));
    await usdc.connect(payer).approve(await settlement.getAddress(), ethers.parseUnits('1000', 6));

    return { owner, merchant, payer, stranger, usdc, settlement };
  }

  async function createOpenInvoice(settlement, merchant, usdc, idLabel = 'invoice-1', amount = '25') {
    const invoiceId = ethers.id(idLabel);
    const expiresAt = (await ethers.provider.getBlock('latest')).timestamp + 3600;

    await settlement
      .connect(merchant)
      .createInvoice(
        invoiceId,
        await usdc.getAddress(),
        ethers.parseUnits(amount, 6),
        expiresAt,
        `${idLabel}|POS sale`,
        'VND',
        ethers.ZeroHash,
      );

    return { invoiceId, expiresAt };
  }

  it('creates and pays a merchant invoice once', async function () {
    const { merchant, payer, usdc, settlement } = await fixture();
    const { invoiceId } = await createOpenInvoice(settlement, merchant, usdc);

    await expect(settlement.connect(payer).payInvoice(invoiceId))
      .to.emit(settlement, 'InvoicePaid')
      .withArgs(invoiceId, merchant.address, payer.address, await usdc.getAddress(), ethers.parseUnits('25', 6));

    const invoice = await settlement.getInvoice(invoiceId);
    expect(invoice.status).to.equal(2);
    expect(invoice.payer).to.equal(payer.address);
    expect(await usdc.balanceOf(merchant.address)).to.equal(ethers.parseUnits('25', 6));

    await expect(settlement.connect(payer).payInvoice(invoiceId)).to.be.revertedWithCustomError(settlement, 'InvoiceNotOpen');
  });

  it('rejects expired invoices before payment', async function () {
    const { merchant, payer, usdc, settlement } = await fixture();
    const { invoiceId, expiresAt } = await createOpenInvoice(settlement, merchant, usdc, 'expired-invoice', '10');

    await ethers.provider.send('evm_setNextBlockTimestamp', [expiresAt + 1]);
    await ethers.provider.send('evm_mine', []);

    await expect(settlement.connect(payer).payInvoice(invoiceId)).to.be.revertedWithCustomError(settlement, 'InvoiceExpired');
  });

  it('supports owner pause and token allowlist controls', async function () {
    const { owner, merchant, payer, usdc, settlement } = await fixture();
    const { invoiceId } = await createOpenInvoice(settlement, merchant, usdc, 'pause-invoice', '5');

    await settlement.connect(owner).pause();
    await expect(settlement.connect(payer).payInvoice(invoiceId)).to.be.revertedWithCustomError(settlement, 'EnforcedPause');

    await settlement.connect(owner).unpause();
    await expect(settlement.connect(payer).payInvoice(invoiceId)).to.emit(settlement, 'InvoicePaid');

    await settlement.connect(owner).setSupportedToken(await usdc.getAddress(), false);
    const nextInvoiceId = ethers.id('unsupported-token');
    const expiresAt = (await ethers.provider.getBlock('latest')).timestamp + 3600;
    await expect(
      settlement.connect(merchant).createInvoice(nextInvoiceId, await usdc.getAddress(), 1, expiresAt, 'blocked', 'USD', ethers.ZeroHash),
    ).to.be.revertedWithCustomError(settlement, 'UnsupportedToken');
  });
});
