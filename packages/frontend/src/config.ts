import addressesJson from "./addresses.json";

// contract addresses – filled in by the deploy script
export const CONTRACT_ADDRESSES = {
  registry:     (addressesJson as any).registry     as string,
  subscription: (addressesJson as any).subscription as string,
  ledger:       (addressesJson as any).ledger       as string,
};

// tier names, colours, categories
export const TIER_NAMES   = ["None", "Bronze", "Silver", "Gold"] as const;
export const TIER_COLORS  = ["", "#cd7f32", "#c0c0c0", "#ffd700"] as const;
export const CATEGORY_NAMES = [
  "Climbing", "Yoga", "Swimming", "Martial Arts", "Tennis", "Other",
] as const;

// Registry ABI
export const REGISTRY_ABI = [
  "function admin() view returns (address)",
  "function registerFacility(address _facility, string _name, string _vendor, string _category)",
  "function removeFacility(address _facility)",
  "function isWhitelisted(address _facility) view returns (bool)",
  "function getFacility(address _facility) view returns (string name, string vendor, string category, bool isWhitelistedStatus)",
  "function getAllFacilities() view returns (address[])",
  "function setPeakHours(address _facility, uint8 _startHour, uint8 _endHour, uint8 _multiplier)",
  "function getCreditMultiplier(address _facility) view returns (uint8)",
  "function getPeakHours(address _facility) view returns (uint8 startHour, uint8 endHour, uint8 multiplier, bool isSet)",
  "event FacilityRegistered(address indexed facility, string name, string vendor, string category)",
  "event FacilityRemoved(address indexed facility)",
  "event PeakHoursSet(address indexed facility, uint8 startHour, uint8 endHour, uint8 multiplier)",
] as const;

// Subscription ABI
export const SUBSCRIPTION_ABI = [
  "function admin() view returns (address)",
  "function ledgerContract() view returns (address)",
  "function CREDIT() view returns (uint256)",
  "function BRONZE() view returns (uint256)",
  "function SILVER() view returns (uint256)",
  "function GOLD() view returns (uint256)",
  "function BRONZE_CAP() view returns (uint256)",
  "function SILVER_CAP() view returns (uint256)",
  "function GOLD_CAP() view returns (uint256)",
  "function BRONZE_CATEGORY_CAP() view returns (uint256)",
  "function SILVER_CATEGORY_CAP() view returns (uint256)",
  "function GOLD_CATEGORY_CAP() view returns (uint256)",
  "function tiers(uint256) view returns (uint256 credits, uint256 price, bool exists)",
  "function subscriptions(address) view returns (uint256 tierID, uint256 expiry, bool active)",
  "function platformFees() view returns (uint256)",
  "function referralBonus() view returns (uint256)",
  "function alreadyReferred(address) view returns (bool)",
  "function setLedgerContract(address _ledger)",
  "function setReferralBonus(uint256 _bonus)",
  "function setTier(uint256 _tierID, uint256 _credits, uint256 _price)",
  "function subscribe(uint256 _tierID) payable",
  "function subscribeWithReferral(uint256 _tierID, address _referrer) payable",
  "function renewSubscription() payable",
  "function isActive(address _member) view returns (bool)",
  "function getBalance(address _member) view returns (uint256)",
  "function getExpiry(address _member) view returns (uint256)",
  "function getMemberTier(address _member) view returns (uint256)",
  "function getVisitCap(uint256 _tierID) view returns (uint256)",
  "function getCategoryCap(uint256 _tierID) view returns (uint256)",
  "function hasVIPBadge(address _member, address _facility) view returns (bool)",
  "function withdraw()",
  "event TierDefined(uint256 tierID, uint256 credits, uint256 price)",
  "event Subscribed(address indexed member, uint256 tierID, uint256 expiry)",
  "event Renewed(address indexed member, uint256 tierID, uint256 newExpiry)",
  "event CreditsSpent(address indexed member, uint256 amount)",
  "event ReferralBonusUpdated(uint256 referralBonus)",
  "event ReferralBonusAwarded(address indexed recipient, address indexed partner, uint256 amount, bool isReferrer)",
] as const;

// Ledger ABI
export const LEDGER_ABI = [
  "function admin() view returns (address)",
  "function creditToEthRate() view returns (uint256)",
  "function facilityAccounts(address) view returns (uint256 sessionPrice, uint256 earnings, uint256 vipDiscount)",
  "function setSessionPrice(uint256 _price)",
  "function setVIPDiscount(uint256 _discount)",
  "function updateCreditToEthRate(uint256 _newRate)",
  "function checkIn(address _facility)",
  "function getMonthlyVisitStatus(address _member) view returns (uint256 used, uint256 remaining)",
  "function getCategoryVisitStatus(address _member, string _category) view returns (uint256 used, uint256 remaining)",
  "function getEarnings(address _facility) view returns (uint256)",
  "function getEarningsInEth(address _facility) view returns (uint256)",
  "function withdrawEarnings()",
  "event CheckIn(address indexed member, address indexed facility, uint256 timestamp, uint256 creditsSpent)",
  "event EarningsWithdrawn(address indexed facility, uint256 creditsWithdrawn, uint256 ethReceived)",
  "event SessionPriceUpdated(address indexed facility, uint256 newPrice)",
  "event CreditToEthRateUpdated(uint256 newRate)",
  "event VIPBadgeEarned(address indexed member, address indexed facility)",
  "event VIPDiscountSet(address indexed facility, uint256 discount)",
] as const;
