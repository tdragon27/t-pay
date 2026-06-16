const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('TPayPredictionMarket', function () {
  async function fixture() {
    const [owner, creator, alice, bob, carol, feeRecipient] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('MockUSDC');
    const usdc = await Token.deploy();
    await usdc.waitForDeployment();

    const Markets = await ethers.getContractFactory('TPayPredictionMarket');
    const markets = await Markets.deploy(await usdc.getAddress(), feeRecipient.address, 100, ethers.parseUnits('1000', 6));
    await markets.waitForDeployment();

    for (const user of [alice, bob, carol]) {
      await usdc.mint(user.address, ethers.parseUnits('1000', 6));
      await usdc.connect(user).approve(await markets.getAddress(), ethers.MaxUint256);
    }

    return { owner, creator, alice, bob, carol, feeRecipient, usdc, markets };
  }

  async function createMarket(markets, creator, question = 'Will BTC close above 120k?') {
    const closeTime = (await ethers.provider.getBlock('latest')).timestamp + 3600;
    const tx = await markets.connect(creator).createMarket(question, 'Crypto', closeTime, 'ipfs://market');
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try { return markets.interface.parseLog(log); } catch { return null; }
      })
      .find((parsed) => parsed?.name === 'MarketCreated');

    return { marketId: event.args.marketId, closeTime };
  }

  it('creates a market, accepts YES/NO bets, resolves and pays winners', async function () {
    const { creator, alice, bob, feeRecipient, usdc, markets } = await fixture();
    const { marketId, closeTime } = await createMarket(markets, creator);

    await expect(markets.connect(alice).placeBet(marketId, 1, ethers.parseUnits('100', 6)))
      .to.emit(markets, 'BetPlaced')
      .withArgs(marketId, alice.address, 1, ethers.parseUnits('100', 6));
    await markets.connect(bob).placeBet(marketId, 2, ethers.parseUnits('100', 6));

    await ethers.provider.send('evm_setNextBlockTimestamp', [closeTime + 1]);
    await ethers.provider.send('evm_mine', []);

    await expect(markets.resolveMarket(marketId, 1)).to.emit(markets, 'MarketResolved').withArgs(marketId, 1);

    const expectedPayout = ethers.parseUnits('199', 6); // 100 stake + 99 losing pool after 1% fee
    await expect(markets.connect(alice).claim(marketId)).to.emit(markets, 'Claimed').withArgs(marketId, alice.address, expectedPayout);
    expect(await usdc.balanceOf(alice.address)).to.equal(ethers.parseUnits('1099', 6));
    expect(await usdc.balanceOf(feeRecipient.address)).to.equal(ethers.parseUnits('1', 6));

    await expect(markets.connect(bob).claim(marketId)).to.be.revertedWithCustomError(markets, 'NoPosition');
  });

  it('refunds all users when a market is cancelled', async function () {
    const { creator, alice, bob, usdc, markets } = await fixture();
    const { marketId } = await createMarket(markets, creator, 'Will testnet stay live?');

    await markets.connect(alice).placeBet(marketId, 1, ethers.parseUnits('10', 6));
    await markets.connect(bob).placeBet(marketId, 2, ethers.parseUnits('20', 6));
    await markets.cancelMarket(marketId);

    await markets.connect(alice).claim(marketId);
    await markets.connect(bob).claim(marketId);

    expect(await usdc.balanceOf(alice.address)).to.equal(ethers.parseUnits('1000', 6));
    expect(await usdc.balanceOf(bob.address)).to.equal(ethers.parseUnits('1000', 6));
  });

  it('enforces close time and max bet controls', async function () {
    const { creator, alice, markets } = await fixture();
    const { marketId, closeTime } = await createMarket(markets, creator);

    await expect(markets.connect(alice).placeBet(marketId, 1, ethers.parseUnits('1001', 6)))
      .to.be.revertedWithCustomError(markets, 'MaxBetAmountExceeded');

    await ethers.provider.send('evm_setNextBlockTimestamp', [closeTime + 1]);
    await ethers.provider.send('evm_mine', []);

    await expect(markets.connect(alice).placeBet(marketId, 1, ethers.parseUnits('1', 6)))
      .to.be.revertedWithCustomError(markets, 'MarketStillOpen');
  });
});
