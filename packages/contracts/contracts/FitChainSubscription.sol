// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract FitChainSubscription is ERC1155 {

    address public admin;

    //Token IDs for each tier
    uint256 public constant BRONZE = 1;
    uint256 public constant SILVER = 2;
    uint256 public constant GOLD = 3;

    //Visit caps per tier per month
    uint256 public constant BRONZE_CAP = 4;
    uint256 public constant SILVER_CAP = 8;
    uint256 public constant GOLD_CAP = 12;

    // Struct to store tier details
    struct Tier {
        uint256 credits;    // how many credits minted per month
        uint256 price;      // price in ETH (wei)
        bool exists;
    }

    // Struct to store member subscription details
    struct Subscription {
        uint256 tierID;     // which tier (1, 2 or 3)
        uint256 expiry;     //timestamp when subscription expires
        bool active;
    }

    mapping(uint256 => Tier) public tiers;
    mapping(address => Subscription) public subscriptions;

    event TierDefined (uint256 tierID, uint256 credits, uint256 price);
    event Subscriped (address indexed member, uint256 tierID, uint256 expiry);
    event Renwed (address indexed member, uint256 tierID, uint256 newExpiry);
    event CreditsSpent (address indexed member, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyLedger() {
        require(msg.sender == ledgerContract, "Not ledger");
        _;
    }

    address public ledgerContract;

    constructor() ERC1155(""){
        admin = msg.sender;

        //default tiers
        tiers[BRONZE] = Tier({ credits: 50, price:0.01 ether, exists: true});
        tiers[SILVER] = Tier({ credits: 100, price:0.02 ether, exists: true});
        tiers[GOLD] = Tier({ credits: 150, price:0.03 ether, exists: true});
    }

    //US-A3: Admin can update tier settings
    function setTier(uint256 _tierID, uint256 _credits, uint256 _price) external onlyAdmin {
        require (tierID >= 1 && _tierID <= 3, "Invalid tier");
        tiers[_tierID] = Tier({ credits: _credits, price: _price, exists: true});
        emit TierDefined(_tierID, _credits, _price);
    }

    // set the ledger contract address
    function setLedgerContract(address _ledger) external onlyAdmin {
        ledgerContract = _ledger;
    }

    //US-M1: Member purchases a subscription
    function subscribe(uint256 _tierID) external payable {
        require(_tierID >= 1 && _tierID <= 3, "Invalid tier");
        require(!subscriptions[msg.sender].active, "Already subscribed, please renew");

        Tier memory tier = tiers[_tierID];
        require(msg.value == tier.price, "Incorrect ETH amount");

        uint256 expiry == block.timestamp + 30 days;

        subscriptions[msg.sender] = Subscription({tierID: _tierID, expiry: _expiry, active: true});

        //Mint ERC1155 credits to the memeber
        _mint(msg.sender, _tierID, tier.credits, "");

        emit Subscriped(msg.sender, _tierID, expiry);
    }

}