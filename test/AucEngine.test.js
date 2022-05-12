const { expect, use } = require("chai");
const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");

use(solidity);

describe("AucEngine", function () {
  let owner;
  let seller;
  let buyer;
  let auct;

  beforeEach(async function() {
    [owner, seller, buyer] = await ethers.getSigners();
    
    const AucEngine = await ethers.getContractFactory("AucEngine", owner);
    auct = await AucEngine.deploy();
    await auct.deployed();
  });

  describe("init contract", function() {
    it("should be deployed", function () {
      return expect(auct.address).to.be.properAddress;
    });

    it("sets owner", async function() {
      const currentOwner = await auct.owner();
      expect(currentOwner).to.eq(owner.address);
    });
  });

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const duration = 60;
  const startingPrice = ethers.utils.parseEther("0.001");
  const morePrice = ethers.utils.parseEther("0.003");
  const incorrectStartingPrice = ethers.utils.parseEther("0.0000000000000001");
  const discount = 3;
  const item = "fake item";
  async function createCorrectAuct() {
    return await auct.connect(seller).createAuction(
      startingPrice,
      discount,
      item,
      duration
    );
  }
  async function createInCorrectAuct() {
    return await auct.connect(seller).createAuction(
      incorrectStartingPrice,
      discount,
      item,
      duration
    );
  }

  async function buyItem(value) {
    return await auct.connect(buyer).buy(0, { value });
  }

  async function getFirstAuct() {
    return await auct.auctions(0);
  }

  async function getTimestamp(bn) {
    const block = await ethers.provider.getBlock(bn);
    return block.timestamp;
  }

  describe("create Auction", function() {
    it("creates auction correctly", async function () {
      const tx = await createCorrectAuct();

      const cAuction = await getFirstAuct();
      expect(cAuction.item).to.eq(item);
      const ts = await getTimestamp(tx.blockNumber);
      expect(cAuction.endAt).to.eq(ts + duration);

      // Event & Emit, where tx - transaction
      await expect(tx)
        .to.emit(auct, "AuctionCreated")
        .withArgs(0, seller.address, "fake item", startingPrice, duration);
    });

    it("inccorect price", async function () {
      // Error handler 
      await expect(createInCorrectAuct()).to.be.revertedWith("incorrect starting price");
    });
  });

  describe("get price for auction", async () => {
    it("revert if auct is finished", async function () {
      await createCorrectAuct();
      await buyItem(startingPrice);

      const tx = async () => await auct.connect(buyer).getPriceFor(0);

      // Error handler
      await expect(tx()).to.be.revertedWith("stopped!");
    });
  });

  describe("buy", function() {
    it("allows to buy", async function () {
      await createCorrectAuct();

      // if you need wait 5s, you need create this.timeout(5000) or test will end
      this.timeout(5000);

      // wait transaction in duration 1s = 1000
      await delay(1000);

      const buyTx = await buyItem(startingPrice);
      const cAuction = await getFirstAuct();
      const finalPrice = cAuction.finalPrice;

      await expect(buyTx).to.changeEtherBalance(
        seller, 
        finalPrice - Math.floor((finalPrice * 10) / 100),
      );

      // Event & Emit, where buyTx - transaction
      await expect(buyTx)
        .to.emit(auct, "AuctionEnded")
        .withArgs(0, finalPrice, buyer.address);

      // Error handler 
      await expect(buyItem(startingPrice)).to.be.revertedWith("stopped!");
    });

    it("revert error if auct has finished", async function () {
      await createCorrectAuct();

      // increase time in the network
      await ethers.provider.send('evm_increaseTime', [duration + 10000]);
      await ethers.provider.send('evm_mine');

      // Error handler 
      await expect(buyItem(startingPrice)).to.be.revertedWith("ended!");
    });

    it("revert error if auct buyer has enough money", async function () {
      await createCorrectAuct();

      // Error handler 
      await expect(buyItem(incorrectStartingPrice)).to.be.revertedWith("not enough funds!");
    });

    it("if user has sent more money, a part should return", async function () {
      await createCorrectAuct();
      const tx = await buyItem(morePrice);

      const getItem = await getFirstAuct();
      
      await expect(tx).to.changeEtherBalances(
        [auct, buyer, seller], 
        [
          Math.floor(( getItem.finalPrice * 10) / 100),
          -getItem.finalPrice, 
          getItem.finalPrice - Math.floor(( getItem.finalPrice * 10) / 100)
        ]
      );
    });
  });
});