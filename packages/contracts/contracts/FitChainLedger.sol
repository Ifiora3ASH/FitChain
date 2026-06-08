// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./FitChainRegistry.sol";
import "./FitChainSubscription.sol";

contract FitChainLedger {

    address public admin;

    FitChainRegistry public registry;
    FitChainSubscription public subscription;

    uint256 public creditToEthRate;             // conversion rate for credits to ETH (e.g., 100 credits = 0.01 ETH)
    uint256 public boncusCredits = 10;

    struct FacilityAccount {
        uint256 sessionPrice; // cost in credits per check in
        uint256 earnings; // accumulated credits earned
    }

    mapping(address => mapping(uint256 => uint256)) private monthlyVisits; // member address => month (timestamp) => visit count
    mapping(address => FacilityAccount) public facilityAccounts; // facility address to account details
    mapping(address => mapping(address => uint256)) private facilityVisits; // member address => facility address => visit count

    event CheckIn(address indexed member, address indexed facility, uint256 timestamp, uint256 creditsSpent);
    event EarningsWithdrawn(address indexed facility, uint256 creditsWithdrawn, uint256 ethReceived);
    event SessionPriceUpdated(address indexed facility, uint256 newPrice);
    event CreditToEthRateUpdated(uint256 newRate);
    event LoyaltyBonusAwarded(address indexed member, address indexed facility, uint256 bonusCredits);

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

    // Easa's Cherry on top: after 10 visits to any facility, member gets 10 bonus credits
    function setBoncusCredits(uint256 _boncusCredits) external onlyAdmin {
        boncusCredits = _boncusCredits;
    }

    //US-F1: Facility sets the price per session in credits
    function setSessionPrice(uint256 _price) external onlyWhitelistedFacility {
        require(_price > 0, "Price must be greater than 0");
        facilityAccounts[msg.sender].sessionPrice = _price;
        emit SessionPriceUpdated(msg.sender, _price);
    }

    //Admin updates the credit to ETH conversion rate
    function updateCreditToEthRate(uint256 _newRate) external onlyAdmin {
        require(_newRate > 0, "Rate must be greater than 0");
        creditToEthRate = _newRate;
        emit CreditToEthRateUpdated(_newRate);
    }

    //US-M4: Member checks in at a facility, spending credits
    function checkIn(address _facility) external {

        //check if facility is whitelisted
        require(registry.isWhitelisted(_facility), "Facility not whitelisted");

        //check if memeber subscription is active (US-M3)
        require(subscription.isActive(msg.sender), "Subscription expired or inactive");

        //get session price from facility account
        uint256 sessionPrice = facilityAccounts[_facility].sessionPrice;
        require(sessionPrice > 0, "Session price not set");

        // Check member subscription and credits
        require(subscription.getBalance(msg.sender) >= sessionPrice, "Not enough credits");

        //get member tier and visit cap (US-M5)
        uint256 tierID = subscription.getMemberTier(msg.sender);
        uint256 cap = subscription.getVisitCap(tierID);

        //get current month (using block timestamp)
        uint256 currentMonth = block.timestamp / 30 days;

        //check monthly visit cap
        require(monthlyVisits[msg.sender][currentMonth] < cap, "Monthly visit cap reached");

        // Burn credits from member subscription
        subscription.burnCredits(msg.sender, tierID, sessionPrice);

        // Add earnings to facility account
        facilityAccounts[_facility].earnings += sessionPrice;

        //record the visit
        monthlyVisits[msg.sender][currentMonth] ++;

        // Track visits per facility for loyalty bonuses (Easa's Cherry on top)
        facilityVisits[msg.sender][_facility]++;

        //every 10 visits to the same facility, member gets boncus credits
        if (facilityVisits[msg.sender][_facility] % 10 == 0) {
            subscription.mintBonus(msg.sender, tierID, boncusCredits);
            emit LoyaltyBonusAwarded(msg.sender, _facility, boncusCredits);
        }

        emit CheckIn(msg.sender, _facility, block.timestamp, sessionPrice);
    }

    //US-M7: member views visits used and remaining for the current month
    function getMonthlyVisitStatus(address _member) external view returns (uint256 used, uint256 remaining) {
        uint256 tierID = subscription.getMemberTier(_member);
        uint256 cap = subscription.getVisitCap(tierID);
        uint256 currentMonth = block.timestamp / 30 days;
        used = monthlyVisits[_member][currentMonth];
        remaining = cap > used ? cap - used : 0;
    }   

    //US-F4: facility view their accumulated earnings
    function getEarnings(address _facility) external view returns (uint256 credits) {
        credits = facilityAccounts[_facility].earnings;
    }

    //US-F3: facility withdraws earnings in ETH
    function withdrawEarnings() external onlyWhitelistedFacility {
        uint256 credits = facilityAccounts[msg.sender].earnings;
        require(credits > 0, "No earnings to withdraw");

        // Convert credits to ETH
        uint256 ethAmount = credits * creditToEthRate;
        require(address(this).balance >= ethAmount, "Contract has insufficient ETH");

        // Reset earnings before transfer to prevent reentrancy
        facilityAccounts[msg.sender].earnings = 0;

        // Transfer ETH to the facility
        payable(msg.sender).transfer(ethAmount);

        emit EarningsWithdrawn(msg.sender, credits, ethAmount);
    }

    //US-F4: Facility views their earnings in ETH value
    function getEarningsInEth(address _facility) external view returns (uint256 eth) {
        return facilityAccounts[_facility].earnings * creditToEthRate;
    }

    //Allow contract to receive ETH for withdrawals
    receive() external payable {}
    
}