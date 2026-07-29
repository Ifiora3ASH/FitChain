# FitChain — Fitness Subscription on the Blockchain

> One subscription. Every gym. Zero middlemen.

FitChain is a smart contract project we built for the TU Berlin Smart Contracts course. The idea is a city-wide fitness pass — you pay ETH, get credits in your wallet, and use them to check in at gyms, pools, climbing walls, whatever's registered on the platform. No backend, no database, just Solidity.

When you check in, credits move from your wallet directly to the facility's wallet. When a facility wants their money, they withdraw and the credits get burned and converted back to ETH. No one in the middle — the contract handles it all.

![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636?logo=solidity)
![ERC-1155](https://img.shields.io/badge/Token-ERC--1155-blueviolet)
![Tests](https://img.shields.io/badge/Tests-76%2F77%20passing-brightgreen)
![Network](https://img.shields.io/badge/Network-Ethereum%20%2F%20Sepolia-3c3c3d?logo=ethereum)

---

## Running Locally

> **Prerequisites:** Node.js 18+, MetaMask

**One-liner — install, test, and deploy** (deploys to an in-process Hardhat network):

```bash
npm install && cd packages/contracts && npx hardhat test && npx hardhat run scripts/deploy.ts
```

**To use the frontend**, you need a persistent node, so two terminals:

```bash
# Terminal 1 — local blockchain
cd packages/contracts && npx hardhat node

# Terminal 2 — deploy, then start the frontend
cd packages/contracts && npx hardhat run scripts/deploy.ts --network localhost
cd ../frontend && npm install && npm run dev
```

Open `http://localhost:5173` and connect MetaMask to **localhost:8545** (chain ID 31337). The deploy script writes the contract addresses into `packages/frontend/src/addresses.json` automatically — no manual copying needed, but **redeploy after any contract change** or the frontend will be calling old bytecode.

---

##  Smart Contracts

We split the logic across three contracts, each with one clear responsibility:

### `FitChainRegistry.sol` — who may participate
Keeps a list of whitelisted facilities (name, vendor, category). Admins add and remove them, and can promote other admins. Facilities set their peak hours here — a time range where check-ins cost more credits (e.g. 1.5× during 17:00–21:00).

### `FitChainSubscription.sol` — what the money is
The ERC-1155 token contract. Handles subscribe, renew, credit minting and transfers, and custodies all ETH. The referral system, leaderboard and streaks live here too.

### `FitChainLedger.sol` — what the rules are
Where check-ins happen. It checks the facility is whitelisted, the member's subscription is active, and they haven't hit their monthly cap, then moves the credits. Facilities withdraw their earnings from here.

```
Admin
  └─► Registry (whitelist facilities, manage admins)
  └─► Subscription (set tiers, referral bonus)
  └─► Ledger (set credit-to-ETH rate)

Member
  └─► Subscription (subscribe, renew, referral)
  └─► Ledger (check in)

Facility
  └─► Registry (set peak hours)
  └─► Ledger (set session price, withdraw earnings)
```

**The key design rule:** the Subscription contract holds all the tokens and ETH, but only the Ledger is allowed to move them (`onlyLedger`). Every mint, transfer, burn and payout goes through that one guarded door, so the pricing and cap rules can't be skipped by calling the token contract directly.

---

## Default Subscription Tiers

| Tier | Credits/Month | Total Visits | Per-Category Cap | Price |
|------|--------------|--------------|-----------------|-------|
| 🥉 Bronze | 40 | 8 | 3 | 0.05 ETH |
| 🥈 Silver | 80 | 16 | 6 | 0.09 ETH |
| 🥇 Gold | 150 | 30 | 10 | 0.15 ETH |

The caps are enforced by the contract — you literally can't check in once you've hit the limit for the month. Default rate: 1 credit = 0.0002 ETH.

---

## Extra Features (Cherry on Top)

The assignment asked each group member to add one extra feature. They're all tied to real user-retention ideas rather than being random additions:

### Friend Referral System
Sign up with a friend's referral code (first 2 bytes of their wallet address) and you both get bonus credits. The admin sets the amount, and can disable the feature by setting it to zero — no redeployment needed. You can only be referred once, and can't refer yourself.

```solidity
function subscribeWithReferral(uint256 _tierID, bytes2 _referralCode) external payable
```

### VIP Badge System
Go to the same facility 4 weeks in a row and you earn a VIP badge — an ERC-1155 token whose ID *is* that venue's address. Facilities set a discount (5–50%) for badge holders, so regulars pay less per session.

```solidity
// Minted automatically after 4 consecutive weeks
subscription.mintVIPBadge(msg.sender, _facility);
```

### Peak Hour Pricing
Facilities set a time window and a multiplier (e.g. 150 = 1.5×). The contract reads `block.timestamp` to work out the current hour and applies the multiplier automatically at check-in.

### Leaderboard & Daily Streak
Members set a username and build a streak by checking in on consecutive days. Miss a day and it resets. The whole leaderboard lives on-chain — no off-chain database.

```solidity
function setUsername(string calldata _username) external
function getActiveStreak(address _member) public view returns (uint256)
function getLeaderboard() external view returns (LeaderboardEntry[] memory)
```

---

## Frontend

Three portals built with Vite + TypeScript + ethers.js. Connect MetaMask and each page loads your data from the contracts automatically.

- **`/index.html`** — Landing page with links to each portal
- **`/member.html`** — Subscribe, renew, check in, view stats, use referral codes
- **`/admin.html`** — Register/remove facilities, manage admins, update tiers, set exchange rate and referral bonus
- **`/facility.html`** — Set session price, configure peak hours, withdraw earnings

---

## Tests

```bash
cd packages/contracts && npx hardhat test
```

**77 tests, 76 passing, 1 known failure** (see Known Issues). `REPORT_GAS=true` is set in `.env`, so the run also prints a gas table — a full check-in averages ~193k gas, ranging from ~117k for a routine repeat visit up to ~268k in the week a VIP badge is minted.

---

## Known Issues

We'd rather list these than have them found for us:

1. **Facilities can't be re-registered after removal.** `removeFacility()` clears `isWhitelisted` but not `exists`, so `registerFacility()` reverts with *"Already registered"* forever after. This is the 1 failing test — we left it in because it documents the expected behaviour.
2. **`setPeakHours` access control.** It checks that the *caller* is whitelisted but writes to the `_facility` parameter, so one whitelisted facility could set another's peak-hour pricing.
3. **Stuck earnings.** Removing a facility that still has unwithdrawn earnings locks those funds, since `withdrawEarnings()` requires whitelisted status.
4. **One ETH pool backs both fees and payouts.** `withdraw()` sends the whole `platformFees` balance to the admin, but that same pool funds facility payouts — an admin withdrawal could leave facilities unable to cash out.

---

## What are we most proud of?

The **cherry on top features** — mainly because they're not throwaway additions. They're all tied to real user retention ideas:

- **Referral system** — people bring friends, friends get rewarded, both stick around longer
- **VIP badges** — loyalty to a specific gym gets recognised on-chain, feels like a real membership perk
- **Streaks + leaderboard** — makes it slightly competitive and gives people a reason to keep checking in

Technically, we're proudest of the **`onlyLedger` boundary**. It means we can state our security model in one sentence and actually defend it: *credits can move like any ERC-1155 token, but they only become a gym visit or ETH through the Ledger — and the Ledger checks everything.*

---

##  Who worked on what?

| Area | Who |
|------|-----|
| Smart contract codebase (initial) | Easa |
| Business logic & process modeling | Alaaddin & Easa |
| Cherry on tops | Alaaddin & Easa |
| Contract tests | Easa & Alpay |
| Frontend (main responsible) | Alpay |
| Poster & presentation | Everyone |

In reality a lot of it was mixed — reviewing each other's code, discussing design decisions, and pair-debugging when something broke.

---

## Statement on the Use of AI

We used **Claude Code (Anthropic)** during the project. Concretely:

- **Test suite for `FitChainLedger`** — the 31 tests covering the check-in flow, visit caps, peak-hour pricing, VIP badge minting over four simulated weeks, withdrawals and the `onlyLedger` boundary were largely AI-written, after we'd finished the contract itself.
- **Multi-admin feature** — `addAdmin`/`removeAdmin` in the Registry, the admin-portal section for it, and its tests.
- **Adversarial review** — we asked it to attack our own contracts. All four bugs in Known Issues came out of that, plus the re-entrancy ordering check in `withdrawEarnings`.
- **Frontend refinement** — getting the UI to behave correctly with ethers.js and fixing edge cases.
- **Documentation and learning** — wording for the poster and this README, and understanding ERC-1155 fungibility, gas reports and Solidity patterns we hadn't used before.

**What we wrote ourselves:** the three contracts and their whole architecture — the credit/badge token design, tiers, caps, pricing and payout logic — plus the Registry and Subscription test suites and the Vite/TypeScript frontend.

---

## Reflections

**Splitting into 3 contracts was the right call.** Registry, Subscription and Ledger each have a clear responsibility, so when we added peak hours or VIP badges it was obvious which contract they belonged in. It does cost cross-contract gas and a wiring step (`setLedgerContract`) we forgot more than once — a real trade, but worth it.

**One ERC-1155 contract instead of ERC-20 + ERC-721.** Credits are fungible (token ID 0); VIP badges are non-fungible per member (ID = the facility's address). ERC-1155 hosts both in one contract — one deployment, one approval surface, less gas. This is the decision that shaped the project most.

**The fixed credit-to-ETH rate is our weakest point.** The admin can just change it, and because there's no per-period snapshot, a change instantly reprices every facility's already-earned balance. In a real system you'd want an oracle or at least transparent governance. This undermines some of the trustlessness we claim elsewhere.

**Gas costs add up.** Every check-in is a transaction (~193k gas). For a daily gym visit that's real friction. We acknowledged this but didn't solve it — an L2 deployment would be the answer.

**Testing the Ledger last was a mistake.** Our most important contract had no automated tests for most of the project, and we only noticed because the gas report had no `checkIn` row. Three of the four Known Issues turned up within an hour of finally writing those tests.

### Poster session feedback

The main comments were around the **visit cap logic** — specifically whether the per-category caps are intuitive to a user.



---

## Tech Stack

| Layer | What we used |
|-------|-------------|
| Smart Contracts | Solidity 0.8.28 |
| Token Standard | ERC-1155 (OpenZeppelin 5) |
| Dev Framework | Hardhat |
| Testing | Hardhat + Chai + ethers.js v6 |
| Frontend | Vite + TypeScript |
| Wallet | MetaMask |
| Networks | Hardhat local / Sepolia testnet |

---

## Team

Built by **Easa Jiryes**, **Alaaddin Gülmüş** and **Alpay Aliosmanov** for the TU Berlin Smart Contracts course.

---

*© 2026 FitChain*
