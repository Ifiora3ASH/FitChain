// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./FitChainRegistry.sol";
import "./FitChainSubscription.sol";

contract FitChainLedger {

    address public admin;

    FitChainRegistry public registry;
    FitChainSubscription public subscription;

    uint256 public creditToEthRate; // how much ETH (in wei) one credit is worth

    struct FacilityAccount {
        uint256 sessionPrice; // cost in credits per check-in
        uint256 earnings;     // accumulated credits earned (mirrors actual token balance)
        uint256 vipDiscount;  // discount percentage for VIP badge holders (e.g. 20 = 20% off)
    }

    mapping(address => mapping(uint256 => uint256)) private monthlyVisits;                      // member => month => total visit count
    mapping(address => mapping(string => mapping(uint256 => uint256))) private categoryVisits;  // member => category => month => visit count
    mapping(address => FacilityAccount) public facilityAccounts;
    mapping(address => mapping(address => uint256)) private lastVisitWeek;                      // member => facility => last week number visited (Easa's cherry on top)
    mapping(address => mapping(address => uint256)) private consecutiveWeeks;                   // member => facility => consecutive weeks visited (Easa's cherry on top)

    event CheckIn(address indexed member, address indexed facility, uint256 timestamp, uint256 creditsSpent);
    event EarningsWithdrawn(address indexed facility, uint256 creditsWithdrawn, uint256 ethReceived);
    event SessionPriceUpdated(address indexed facility, uint256 newPrice);
    event CreditToEthRateUpdated(uint256 newRate);
    event VIPBadgeEarned(address indexed member, address indexed facility); // Easa's cherry on top
    event VIPDiscountSet(address indexed facility, uint256 discount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not Admin");
        _;
    }

    modifier onlyWhitelistedFacility() {
        require(registry.isWhitelisted(msg.sender), "Not a whitelisted facility");
        _;
    }

    constructor(address _registry, address _subscription, uint256 _creditToEthRate) {
        admin = msg.sender;
        registry = FitChainRegistry(_registry);
        subscription = FitChainSubscription(_subscription);
        creditToEthRate = _creditToEthRate;
    }

    // US-F1: Facility sets the credit price per session
    function setSessionPrice(uint256 _price) external onlyWhitelistedFacility {
        require(_price > 0, "Price must be greater than 0");
        facilityAccounts[msg.sender].sessionPrice = _price;
        emit SessionPriceUpdated(msg.sender, _price);
    }

    // Facility sets their VIP discount percentage (min 5%, max 50%)
    function setVIPDiscount(uint256 _discount) external onlyWhitelistedFacility {
        require(_discount >= 5 && _discount <= 50, "Discount must be between 5% and 50%");
        facilityAccounts[msg.sender].vipDiscount = _discount;
        emit VIPDiscountSet(msg.sender, _discount);
    }

    // Admin updates the credit to ETH conversion rate
    function updateCreditToEthRate(uint256 _newRate) external onlyAdmin {
        require(_newRate > 0, "Rate must be greater than 0");
        creditToEthRate = _newRate;
        emit CreditToEthRateUpdated(_newRate);
    }

    // US-M4: Member checks in at a facility, spending credits
    function checkIn(address _facility) external {

        // Check facility is whitelisted
        require(registry.isWhitelisted(_facility), "Facility not whitelisted");

        // Check member subscription is active (US-M3)
        require(subscription.isActive(msg.sender), "Subscription expired or inactive");

        // Get session price
        uint256 sessionPrice = facilityAccounts[_facility].sessionPrice;
        require(sessionPrice > 0, "Session price not set");

        // Check member has enough credits
        require(subscription.getBalance(msg.sender) >= sessionPrice, "Not enough credits");

        // Get member tier and caps (US-M5)
        uint256 tierID = subscription.getMemberTier(msg.sender);
        uint256 visitCap = subscription.getVisitCap(tierID);
        uint256 categoryCap = subscription.getCategoryCap(tierID);

        // Get current month and facility category
        uint256 currentMonth = block.timestamp / 30 days;
        (,, string memory category,) = registry.getFacility(_facility);

        // Layer 1: check total monthly visit cap
        require(monthlyVisits[msg.sender][currentMonth] < visitCap, "Monthly visit cap reached");

        // Layer 2: check monthly category cap
        require(categoryVisits[msg.sender][category][currentMonth] < categoryCap, "Category visit cap reached");

        // Apply peak hour multiplier if active (e.g. 150 = 1.5x cost)
        uint8 multiplier = registry.getCreditMultiplier(_facility);
        uint256 actualCost = (sessionPrice * multiplier) / 100;

        // Apply VIP discount if member holds the badge for this facility
        if (subscription.hasVIPBadge(msg.sender, _facility)) {
            uint256 discount = facilityAccounts[_facility].vipDiscount;
            if (discount > 0) {
                actualCost = actualCost - (actualCost * discount / 100);
            }
        }

        // Re-check member has enough credits after multiplier and discount are applied
        require(subscription.getBalance(msg.sender) >= actualCost, "Not enough credits");

        // Transfer credits from member wallet to facility wallet
        subscription.transferCredits(msg.sender, _facility, actualCost);

        // Update check-in streak
        subscription.updateCheckInStreak(msg.sender);

        // Record earnings in facility account
        facilityAccounts[_facility].earnings += actualCost;

        // Record visits
        monthlyVisits[msg.sender][currentMonth]++;
        categoryVisits[msg.sender][category][currentMonth]++;

        // Track consecutive weekly visits for VIP badge (Easa's cherry on top)
        uint256 currentWeek = block.timestamp / 7 days;
        if (lastVisitWeek[msg.sender][_facility] == currentWeek - 1) {
            // Visited last week too — increment streak
            consecutiveWeeks[msg.sender][_facility]++;
        } else if (lastVisitWeek[msg.sender][_facility] != currentWeek) {
            // Gap in visits — reset streak to 1
            consecutiveWeeks[msg.sender][_facility] = 1;
        }
        lastVisitWeek[msg.sender][_facility] = currentWeek;

        // Award VIP badge after 4 consecutive weeks
        if (consecutiveWeeks[msg.sender][_facility] >= 4) {
            subscription.mintVIPBadge(msg.sender, _facility);
            emit VIPBadgeEarned(msg.sender, _facility);
        }

        emit CheckIn(msg.sender, _facility, block.timestamp, actualCost);
    }

    // US-M7: Member views total visits used and remaining this month
    function getMonthlyVisitStatus(address _member) external view returns (uint256 used, uint256 remaining) {
        uint256 tierID = subscription.getMemberTier(_member);
        uint256 cap = subscription.getVisitCap(tierID);
        uint256 currentMonth = block.timestamp / 30 days;
        used = monthlyVisits[_member][currentMonth];
        remaining = cap > used ? cap - used : 0;
    }

    // US-M7: Member views category visits used and remaining this month
    function getCategoryVisitStatus(address _member, string calldata _category) external view returns (uint256 used, uint256 remaining) {
        uint256 tierID = subscription.getMemberTier(_member);
        uint256 cap = subscription.getCategoryCap(tierID);
        uint256 currentMonth = block.timestamp / 30 days;
        used = categoryVisits[_member][_category][currentMonth];
        remaining = cap > used ? cap - used : 0;
    }

    // US-F4: Facility views accumulated earnings in credits
    function getEarnings(address _facility) external view returns (uint256) {
        return facilityAccounts[_facility].earnings;
    }

    // US-F4: Facility views accumulated earnings in ETH value
    function getEarningsInEth(address _facility) external view returns (uint256) {
        return facilityAccounts[_facility].earnings * creditToEthRate;
    }

    // US-F3: Facility withdraws earnings — credits are burned and ETH is sent
    function withdrawEarnings() external onlyWhitelistedFacility {
        uint256 credits = facilityAccounts[msg.sender].earnings;
        require(credits > 0, "No earnings to withdraw");

        uint256 ethAmount = credits * creditToEthRate;

        // Reset earnings counter before any external calls to prevent reentrancy
        facilityAccounts[msg.sender].earnings = 0;

        // Burn the credits from the facility's wallet
        subscription.burnFacilityCredits(msg.sender, credits);

        // Send ETH to the facility from the subscription contract
        subscription.transferETH(msg.sender, ethAmount);

        emit EarningsWithdrawn(msg.sender, credits, ethAmount);
    }
}
