# FitChain — Fitness Subscription on the Blockchain

> One subscription. Every gym. Zero middlemen.

FitChain is a smart contract project we built for the TU Berlin Smart Contracts course. The idea is a city-wide fitness pass — you pay ETH, get credits in your wallet, and use them to check in at gyms, pools, climbing walls, whatever's registered on the platform. No backend, no database, just Solidity.

![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636?logo=solidity)
![Hardhat](https://img.shields.io/badge/Hardhat-3-yellow?logo=hardhat)
![ERC-1155](https://img.shields.io/badge/Token-ERC--1155-blueviolet)
![License](https://img.shields.io/badge/License-ISC-blue)
![Network](https://img.shields.io/badge/Network-Ethereum%20%2F%20Sepolia-3c3c3d?logo=ethereum)

---

## What's the Idea?

Think of it like a gym pass that works across multiple venues in a city. Instead of each gym having its own membership, they all register on the same smart contract platform. You buy one monthly subscription, get some credits, and spend them wherever you go.

When you check in, credits move from your wallet directly to the facility's wallet. When a facility wants their money, they withdraw and the credits get burned and converted back to ETH. No one in the middle, the contract handles it all.

---

## Why Blockchain?

Honestly the main reason this works on a blockchain is trust — nobody has to trust a company to handle their money correctly.

| Problem | How blockchain helps |
|---------|---------------------|
| Users have to trust platforms aren't taking hidden cuts | Payments go straight to the contract, everything visible on-chain |
| Membership fraud / fake check-ins | Every check-in is a transaction, can't be faked |
| Facilities waiting weeks for payouts | Credits land in their wallet on check-in, withdraw anytime |
| Visit caps need to be enforced fairly | The contract enforces them, not some server we control |


---

## Smart Contracts

We split the logic across three contracts:

### `FitChainRegistry.sol`
Keeps a list of whitelisted facilities (name, vendor, category). Admin adds and removes them. Facilities can also set peak hours here — a time range where check-ins cost more credits (like 1.5× during 17:00–21:00).

### `FitChainSubscription.sol`
The ERC-1155 token contract. Handles subscribe, renew, credit minting, and transfers. Also has the referral system, leaderboard, and streaks baked in.

### `FitChainLedger.sol`
Where check-ins happen. It checks the facility is whitelisted, the member's sub is active, they haven't hit their monthly cap, then moves the credits. Facilities withdraw from here too.

```
Admin
  └─► Registry (whitelist facilities)
  └─► Subscription (set tiers, referral bonus)
  └─► Ledger (set credit-to-ETH rate)

Member
  └─► Subscription (subscribe, renew, referral)
  └─► Ledger (check in)

Facility
  └─► Registry (set peak hours)
  └─► Ledger (set session price, withdraw earnings)
```

---

## Default Subscription Tiers

| Tier | Credits/Month | Total Visits | Per-Category Cap | Price |
|------|--------------|--------------|-----------------|-------|
| 🥉 Bronze | 40 | 8 | 3 | 0.05 ETH |
| 🥈 Silver | 80 | 16 | 6 | 0.09 ETH |
| 🥇 Gold | 150 | 30 | 10 | 0.15 ETH |

The caps are enforced by the contract — you literally can't check in once you've hit the limit for the month.

---

## Extra Features (Cherry on Top)

The assignment asked each group member to add one extra feature. Here's what we came up with:

### Friend Referral System
When you sign up using a friend's referral code (first 2 bytes of their wallet address), both of you get bonus credits. The admin sets how many. You can only be referred once and can't refer yourself.

```solidity
function subscribeWithReferral(uint256 _tierID, bytes2 _referralCode) external payable
```

### VIP Badge System
Go to the same facility 4 weeks in a row and you earn a VIP badge — an ERC-1155 token specific to that venue. Facilities can set a discount (5–50%) for badge holders, so loyal regulars pay less per session.

```solidity
// Minted automatically after 4 consecutive weeks
subscription.mintVIPBadge(msg.sender, _facility);
```

### Peak Hour Pricing
Facilities can set a time window and a multiplier (e.g. 150 = 1.5×). The contract checks `block.timestamp` to figure out the current hour and applies the multiplier automatically at check-in.

### Leaderboard & Daily Streak
Members set a username and build a streak by checking in on consecutive days. Miss a day and it resets. The whole leaderboard lives on-chain — no off-chain database needed.

```solidity
function setUsername(string calldata _username) external
function getActiveStreak(address _member) public view returns (uint256)
function getLeaderboard() external view returns (LeaderboardEntry[] memory)
```

---

## Business Process (Simplified)

```
1. Admin registers a facility on the Registry
2. Facility logs in and sets their session price (+ optional peak hours)
3. Member buys a subscription → credits minted to wallet
4. Member checks in at a facility → credits transferred to facility
5. Facility withdraws → credits burned, ETH sent to their wallet
6. Admin can update tiers, exchange rate, referral bonus anytime
```

---

## Frontend

Three portals built with Vite + TypeScript + ethers.js. Nothing fancy, just functional:

- **`/index.html`** — Landing page with links to each portal
- **`/member.html`** — Subscribe, renew, check in, view stats, use referral codes
- **`/admin.html`** — Register/remove facilities, update tiers, set exchange rate, set referral bonus
- **`/facility.html`** — Set session price, configure peak hours, withdraw earnings

Connect MetaMask and each page loads your data from the contracts automatically.

---

## Running Locally

### Prerequisites
- Node.js 18+
- MetaMask browser extension
- Hardhat for local blockchain

### 1. Install dependencies
```bash
npm install
```

### 2. Start a local Hardhat node
```bash
cd packages/contracts
npx hardhat node
```

### 3. Deploy contracts
```bash
npx hardhat ignition deploy ./ignition/modules/FitChain.ts --network localhost
```
Copy the deployed addresses into `packages/frontend/src/addresses.json`.

### 4. Start the frontend
```bash
cd packages/frontend
npm run dev
```
Open `http://localhost:5173`, connect MetaMask to localhost and you're good.

---

## Tech Stack

| Layer | What we used |
|-------|-------------|
| Smart Contracts | Solidity 0.8.28 |
| Token Standard | ERC-1155 (OpenZeppelin) |
| Dev Framework | Hardhat 3 + Ignition |
| Frontend | Vite + TypeScript |
| Wallet | MetaMask |
| Networks | Hardhat local / Sepolia testnet |

---

## Project Structure

```
FitChain/
├── packages/
│   ├── contracts/
│   │   ├── contracts/
│   │   │   ├── FitChainRegistry.sol      # Facility whitelist + peak hours
│   │   │   ├── FitChainSubscription.sol  # ERC-1155 tokens + tiers + referrals + streaks
│   │   │   └── FitChainLedger.sol        # Check-ins + caps + withdrawals + VIP
│   │   ├── ignition/                     # Deployment scripts
│   │   ├── test/                         # Contract tests
│   │   └── hardhat.config.ts
│   └── frontend/
│       ├── src/
│       │   ├── admin.ts
│       │   ├── member.ts
│       │   ├── facility.ts
│       │   ├── config.ts                 # ABI + contract addresses
│       │   └── shared.css
│       ├── index.html
│       ├── admin.html
│       ├── member.html
│       └── facility.html
└── package.json
```

---

## Team

Built as part of the TU Berlin Smart Contracts course.  
GitHub: [github.com/BlackFDog/fitchain](https://github.com/BlackFDog/fitchain)

---

*© 2026 FitChain*
