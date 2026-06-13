// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract FitChainSubscription is ERC1155 {

    address public admin;
    address public ledgerContract;

    // Single universal credit token ID
    uint256 public constant CREDIT = 0;

    // Tier IDs (used for subscription tracking only, not token IDs)
    uint256 public constant BRONZE = 1;
    uint256 public constant SILVER = 2;
    uint256 public constant GOLD   = 3;

    // Total visit caps per tier per month
    uint256 public constant BRONZE_CAP          = 8;
    uint256 public constant SILVER_CAP          = 16;
    uint256 public constant GOLD_CAP            = 30;

    // Category visit caps per tier per month
    uint256 public constant BRONZE_CATEGORY_CAP = 3;
    uint256 public constant SILVER_CATEGORY_CAP = 6;
    uint256 public constant GOLD_CATEGORY_CAP   = 10;

    struct Tier {
        uint256 credits; // credits minted per month
        uint256 price;   // price in ETH (wei)
        bool exists;
    }

    struct Subscription {
        uint256 tierID;  // which tier the member is on (1, 2 or 3)
        uint256 expiry;  // timestamp when subscription expires
        bool active;
    }

    mapping(uint256 => Tier) public tiers;
    mapping(address => Subscription) public subscriptions;

    uint256 public platformFees; // tracks ETH available for admin to withdraw

    event TierDefined(uint256 tierID, uint256 credits, uint256 price);
    event Subscribed(address indexed member, uint256 tierID, uint256 expiry);
    event Renewed(address indexed member, uint256 tierID, uint256 newExpiry);
    event CreditsSpent(address indexed member, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyLedger() {
        require(msg.sender == ledgerContract, "Not ledger");
        _;
    }

    constructor() ERC1155("") {
        admin = msg.sender;

        tiers[BRONZE] = Tier({ credits: 40,  price: 0.05 ether, exists: true });
        tiers[SILVER] = Tier({ credits: 80,  price: 0.09 ether, exists: true });
        tiers[GOLD]   = Tier({ credits: 150, price: 0.15 ether, exists: true });
    }

    // US-A3: Admin can update tier settings
    function setTier(uint256 _tierID, uint256 _credits, uint256 _price) external onlyAdmin {
        require(_tierID >= 1 && _tierID <= 3, "Invalid tier");
        tiers[_tierID] = Tier({ credits: _credits, price: _price, exists: true });
        emit TierDefined(_tierID, _credits, _price);
    }

    // Links the ledger contract address so only it can call restricted functions
    function setLedgerContract(address _ledger) external onlyAdmin {
        ledgerContract = _ledger;
    }

    // US-M1: Member purchases a subscription
    function subscribe(uint256 _tierID) external payable {
        require(_tierID >= 1 && _tierID <= 3, "Invalid tier");
        Subscription storage existing = subscriptions[msg.sender];
        // Block if subscription is active AND not yet expired
        require(!existing.active || block.timestamp >= existing.expiry, "Already subscribed, please renew");

        Tier memory tier = tiers[_tierID];
        require(msg.value == tier.price, "Incorrect ETH amount");

        uint256 expiry = block.timestamp + 30 days;
        subscriptions[msg.sender] = Subscription({ tierID: _tierID, expiry: expiry, active: true });

        // Track ETH paid as platform fee
        platformFees += msg.value;

        // Mint universal credits to the member
        _mint(msg.sender, CREDIT, tier.credits, "");

        emit Subscribed(msg.sender, _tierID, expiry);
    }

    // US-M2: Member renews their subscription
    function renewSubscription() external payable {
        Subscription storage sub = subscriptions[msg.sender];
        require(sub.active || sub.expiry > 0, "Not subscribed");

        Tier memory tier = tiers[sub.tierID];
        require(msg.value == tier.price, "Incorrect ETH amount");

        uint256 newExpiry;
        if (block.timestamp < sub.expiry) {
            newExpiry = sub.expiry + 30 days;
        } else {
            newExpiry = block.timestamp + 30 days;
        }

        sub.expiry = newExpiry;
        sub.active = true;

        // Track ETH paid as platform fee
        platformFees += msg.value;

        // Mint universal credits for the new month
        _mint(msg.sender, CREDIT, tier.credits, "");

        emit Renewed(msg.sender, sub.tierID, newExpiry);
    }

    // Called by ledger at check-in: transfers universal credits from member to facility
    function transferCredits(address _member, address _facility, uint256 _amount) external onlyLedger {
        _safeTransferFrom(_member, _facility, CREDIT, _amount, "");
        emit CreditsSpent(_member, _amount);
    }

    // Called by ledger at withdrawal: burns credits from facility wallet
    function burnFacilityCredits(address _facility, uint256 _amount) external onlyLedger {
        require(balanceOf(_facility, CREDIT) >= _amount, "Facility has insufficient credits");
        _burn(_facility, CREDIT, _amount);
    }

    // Called by ledger at withdrawal: sends ETH to facility and deducts from platform fees
    function transferETH(address _facility, uint256 _amount) external onlyLedger {
        require(platformFees >= _amount, "Insufficient ETH in contract");
        platformFees -= _amount;
        payable(_facility).transfer(_amount);
    }

    // Called by ledger to mint a VIP badge for a specific facility (Easa's cherry on top)
    // Uses the facility address as the token ID so each facility has a unique badge
    function mintVIPBadge(address _member, address _facility) external onlyLedger {
        uint256 badgeId = uint256(uint160(_facility));
        // Only mint if member doesn't already have the badge
        if (balanceOf(_member, badgeId) == 0) {
            _mint(_member, badgeId, 1, "");
        }
    }

    // Returns true if a member holds the VIP badge for a specific facility
    function hasVIPBadge(address _member, address _facility) external view returns (bool) {
        uint256 badgeId = uint256(uint160(_facility));
        return balanceOf(_member, badgeId) > 0;
    }

    // US-M3: Check if a member's subscription is currently active
    function isActive(address _member) external view returns (bool) {
        Subscription memory sub = subscriptions[_member];
        return sub.active && block.timestamp < sub.expiry;
    }

    // US-M6: Get a member's current credit balance
    function getBalance(address _member) external view returns (uint256) {
        return balanceOf(_member, CREDIT);
    }

    // US-M6: Get a member's subscription expiry timestamp
    function getExpiry(address _member) external view returns (uint256) {
        return subscriptions[_member].expiry;
    }

    // US-M6: Get which tier a member is on
    function getMemberTier(address _member) external view returns (uint256) {
        return subscriptions[_member].tierID;
    }

    // Returns total monthly visit cap for a tier
    function getVisitCap(uint256 _tierID) external pure returns (uint256) {
        if (_tierID == BRONZE) return BRONZE_CAP;
        if (_tierID == SILVER) return SILVER_CAP;
        if (_tierID == GOLD)   return GOLD_CAP;
        return 0;
    }

    // Returns monthly category visit cap for a tier
    function getCategoryCap(uint256 _tierID) external pure returns (uint256) {
        if (_tierID == BRONZE) return BRONZE_CATEGORY_CAP;
        if (_tierID == SILVER) return SILVER_CATEGORY_CAP;
        if (_tierID == GOLD)   return GOLD_CATEGORY_CAP;
        return 0;
    }

    // Admin withdraws platform fees
    function withdraw() external onlyAdmin {
        uint256 amount = platformFees;
        require(amount > 0, "No fees to withdraw");
        platformFees = 0;
        payable(admin).transfer(amount);
    }
}
