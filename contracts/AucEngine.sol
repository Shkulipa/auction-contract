//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract AucEngine {
    address public owner;
    uint constant DURATION = 2 days; // 2 * 24 * 60 * 60
    uint constant FEE = 10; // 10%

    struct Auction {
      address payable seller;
      uint stratingPrice;
      uint finalPrice;
      uint startAt;
      uint endAt;
      uint discountRate;
      string item;
      bool stopped;
    }

    Auction[] public auctions;

    event AuctionCreated(uint index, address creator, string item, uint startingPrice, uint duration);
    event AuctionEnded(uint index, uint finalPrice, address winner);

    constructor() {
      owner = msg.sender;
    }

    function createAuction(uint _startingPrice, uint _discountRate, string calldata _item, uint _duration) external {
      uint duration = _duration == 0 ? DURATION : _duration;
      require(_startingPrice >= _discountRate * duration, "incorrect starting price");

      Auction memory newAuction = Auction({
        seller: payable(msg.sender),
        stratingPrice: _startingPrice,
        finalPrice: _startingPrice,
        discountRate: _discountRate,
        startAt: block.timestamp,
        endAt: block.timestamp + _duration,
        item: _item,
        stopped: false
      });

      auctions.push(newAuction);

      emit AuctionCreated(auctions.length - 1, msg.sender, _item, _startingPrice, _duration);
    }

    function getPriceFor(uint index) public view returns(uint) {
      Auction memory cAuction = auctions[index];
      require(!cAuction.stopped, "stopped!");
      uint elapsed = block.timestamp - cAuction.startAt;
      uint discount = cAuction.discountRate * elapsed;
      return cAuction.stratingPrice - discount;
    }

    function buy(uint index) external payable {
      Auction storage cAuction = auctions[index];
      require(!cAuction.stopped, "stopped!");
      require(block.timestamp < cAuction.endAt, "ended!");
      uint cPrice = getPriceFor(index);
      require(msg.value >= cPrice, "not enough funds!");
      cAuction.stopped = true;
      cAuction.finalPrice = cPrice;
      uint refund = msg.value - cPrice;
      if(refund > 0) {
        payable(msg.sender).transfer(refund);
      }
      cAuction.seller.transfer(
        cPrice - ((cPrice * FEE) / 100)
      ); //500
      // 500 - ((500 * 10) / 100) = 500 - 50 = 450

      emit AuctionEnded(index, cPrice, msg.sender);
    }
}
