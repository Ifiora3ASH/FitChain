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
    event Subscribed (address indexed member, uint256 tierID, uint256 expiry);
    event Renewed (address indexed member, uint256 tierID, uint256 newExpiry);
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
        require (_tierID >= 1 && _tierID <= 3, "Invalid tier");
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

        uint256 expiry = block.timestamp + 30 days;

        subscriptions[msg.sender] = Subscription({tierID: _tierID, expiry: expiry, active: true});

        //Mint ERC1155 credits to the memeber
        _mint(msg.sender, _tierID, tier.credits, "");

        emit Subscribed(msg.sender, _tierID, expiry);
    }

    //US-M2: renew subscription
    function renewSubscription() external payable {
        Subscription storage sub = subscriptions[msg.sender];
        require(sub.active || sub.expiry > 0 , "Not subscribed");

        Tier memory tier = tiers[sub.tierID];
        require(msg.value == tier.price, "Incorrect ETH amount");

        // Extend expiry by 30 days
        uint256 newExpiry;
        if (block.timestamp < sub.expiry) {
            newExpiry = sub.expiry + 30 days; // If expired, start from now
        } else {
            newExpiry = block.timestamp + 30 days; // If still active, extend
        }

        sub.expiry = newExpiry;
        sub.active = true;

        // Mint new credits for the renewed month
        _mint(msg.sender, sub.tierID, tier.credits, "");

        emit Renewed(msg.sender, sub.tierID, newExpiry);
    }

    // Called by FitChainLedger to burn credits when checking in
    function burnCredits(address _member, uint256 _tierId, uint256 _amount) external onlyLedger {
        require(balanceOf(_member, _tierId) >= _amount, "Not enough credits");
        _burn(_member, _tierId, _amount);
        emit CreditsSpent(_member, _amount);
    }

    // US-M3: Check if subscription is active
    function isActive(address _member) external view returns (bool) {
        Subscription memory sub = subscriptions[_member];
        return sub.active && block.timestamp < sub.expiry;
    }

    // US-M6: Shows credit balance AND subscription expiry together
    function getMemberStatus(address _member) external view returns (uint256 credits, uint256 expiry, bool active) {
        Subscription memory sub = subscriptions[_member];
        credits = sub.tierID == 0 ? 0 : balanceOf(_member, sub.tierID);
        expiry = sub.expiry;
        active = sub.active && block.timestamp < sub.expiry;
    }

    //get visit cap for a tier
    function getVisitCap(uint256 _tierID) external pure returns (uint256) {
        if (_tierID == BRONZE) return BRONZE_CAP;
        if (_tierID == SILVER) return SILVER_CAP;
        if (_tierID == GOLD) return GOLD_CAP;
        return 0;
    }

    //Admin withdraws collected ETH
    function withdraw() external onlyAdmin {
        payable(admin).transfer(address(this).balance);
    }
    
}