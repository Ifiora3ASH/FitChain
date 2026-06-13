import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("FitChainSubscription", function () {
    let subscription: any;
    let admin: any;
    let member: any;
    let stranger: any;
    let ledger: any;

    const CREDIT = 0;
    const BRONZE = 1;
    const SILVER = 2;
    const GOLD = 3;

    const BRONZE_PRICE = ethers.parseEther("0.05");
    const SILVER_PRICE = ethers.parseEther("0.09");
    const GOLD_PRICE   = ethers.parseEther("0.15");

    beforeEach(async function () {
        [admin, member, stranger, ledger] = await ethers.getSigners();
        const Subscription = await ethers.getContractFactory("FitChainSubscription");
        subscription = await Subscription.deploy();
    });

    // --- Deployment ---

    it("should set the deployer as admin", async function () {
        expect(await subscription.admin()).to.equal(admin.address);
    });

    it("should pre-configure bronze, silver and gold tiers", async function () {
        const bronze = await subscription.tiers(BRONZE);
        const silver = await subscription.tiers(SILVER);
        const gold   = await subscription.tiers(GOLD);

        expect(bronze.credits).to.equal(40);
        expect(bronze.price).to.equal(BRONZE_PRICE);

        expect(silver.credits).to.equal(80);
        expect(silver.price).to.equal(SILVER_PRICE);

        expect(gold.credits).to.equal(150);
        expect(gold.price).to.equal(GOLD_PRICE);
    });

    // --- Tier Management ---

    it("should allow admin to update a tier", async function () {
        await subscription.setTier(BRONZE, 50, ethers.parseEther("0.06"));
        const bronze = await subscription.tiers(BRONZE);
        expect(bronze.credits).to.equal(50);
        expect(bronze.price).to.equal(ethers.parseEther("0.06"));
    });

    it("should not allow non-admin to update a tier", async function () {
        await expect(
            subscription.connect(stranger).setTier(BRONZE, 50, ethers.parseEther("0.06"))
        ).to.be.revertedWith("Not admin");
    });

    it("should reject invalid tier ID in setTier", async function () {
        await expect(
            subscription.setTier(0, 50, ethers.parseEther("0.06"))
        ).to.be.revertedWith("Invalid tier");
        await expect(
            subscription.setTier(4, 50, ethers.parseEther("0.06"))
        ).to.be.revertedWith("Invalid tier");
    });

    it("should emit TierDefined event", async function () {
        await expect(
            subscription.setTier(BRONZE, 50, ethers.parseEther("0.06"))
        ).to.emit(subscription, "TierDefined");
    });

    // --- Ledger Contract Link ---

    it("should allow admin to set the ledger contract address", async function () {
        await subscription.setLedgerContract(ledger.address);
        expect(await subscription.ledgerContract()).to.equal(ledger.address);
    });

    it("should not allow non-admin to set the ledger contract", async function () {
        await expect(
            subscription.connect(stranger).setLedgerContract(ledger.address)
        ).to.be.revertedWith("Not admin");
    });

    // --- Subscribe ---

    it("should allow a member to subscribe to bronze tier", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        expect(await subscription.getBalance(member.address)).to.equal(40);
    });

    it("should allow a member to subscribe to silver tier", async function () {
        await subscription.connect(member).subscribe(SILVER, { value: SILVER_PRICE });
        expect(await subscription.getBalance(member.address)).to.equal(80);
    });

    it("should allow a member to subscribe to gold tier", async function () {
        await subscription.connect(member).subscribe(GOLD, { value: GOLD_PRICE });
        expect(await subscription.getBalance(member.address)).to.equal(150);
    });

    it("should mark subscription as active after subscribing", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        expect(await subscription.isActive(member.address)).to.equal(true);
    });

    it("should reject subscription with incorrect ETH amount", async function () {
        await expect(
            subscription.connect(member).subscribe(BRONZE, { value: ethers.parseEther("0.01") })
        ).to.be.revertedWith("Incorrect ETH amount");
    });

    it("should reject invalid tier ID in subscribe", async function () {
        await expect(
            subscription.connect(member).subscribe(0, { value: BRONZE_PRICE })
        ).to.be.revertedWith("Invalid tier");
    });

    it("should not allow subscribing again while already active", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        await expect(
            subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE })
        ).to.be.revertedWith("Already subscribed, please renew");
    });

    it("should add ETH to platformFees on subscribe", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        expect(await subscription.platformFees()).to.equal(BRONZE_PRICE);
    });

    it("should emit Subscribed event", async function () {
        await expect(
            subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE })
        ).to.emit(subscription, "Subscribed");
    });

    // --- Renew Subscription ---

    it("should allow a member to renew their subscription", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        const before = await subscription.getExpiry(member.address);
        await subscription.connect(member).renewSubscription({ value: BRONZE_PRICE });
        const after = await subscription.getExpiry(member.address);
        expect(after).to.be.greaterThan(before);
    });

    it("should mint additional credits on renewal", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        await subscription.connect(member).renewSubscription({ value: BRONZE_PRICE });
        expect(await subscription.getBalance(member.address)).to.equal(80);
    });

    it("should not allow renewing without a prior subscription", async function () {
        await expect(
            subscription.connect(stranger).renewSubscription({ value: BRONZE_PRICE })
        ).to.be.revertedWith("Not subscribed");
    });

    it("should reject renewal with incorrect ETH amount", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        await expect(
            subscription.connect(member).renewSubscription({ value: ethers.parseEther("0.01") })
        ).to.be.revertedWith("Incorrect ETH amount");
    });

    it("should emit Renewed event", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        await expect(
            subscription.connect(member).renewSubscription({ value: BRONZE_PRICE })
        ).to.emit(subscription, "Renewed");
    });

    // --- transferCredits (ledger only) ---

    it("should allow ledger to transfer credits from member to facility", async function () {
        await subscription.setLedgerContract(ledger.address);
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });

        await subscription.connect(ledger).transferCredits(member.address, stranger.address, 10);

        expect(await subscription.getBalance(member.address)).to.equal(30);
        expect(await subscription.balanceOf(stranger.address, CREDIT)).to.equal(10);
    });

    it("should not allow non-ledger to call transferCredits", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        await expect(
            subscription.connect(stranger).transferCredits(member.address, stranger.address, 10)
        ).to.be.revertedWith("Not ledger");
    });

    it("should emit CreditsSpent event on transferCredits", async function () {
        await subscription.setLedgerContract(ledger.address);
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        await expect(
            subscription.connect(ledger).transferCredits(member.address, stranger.address, 10)
        ).to.emit(subscription, "CreditsSpent");
    });

    // --- burnFacilityCredits (ledger only) ---

    it("should allow ledger to burn facility credits", async function () {
        await subscription.setLedgerContract(ledger.address);
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        await subscription.connect(ledger).transferCredits(member.address, stranger.address, 20);

        await subscription.connect(ledger).burnFacilityCredits(stranger.address, 20);
        expect(await subscription.balanceOf(stranger.address, CREDIT)).to.equal(0);
    });

    it("should not allow non-ledger to call burnFacilityCredits", async function () {
        await expect(
            subscription.connect(stranger).burnFacilityCredits(stranger.address, 10)
        ).to.be.revertedWith("Not ledger");
    });

    it("should revert if facility has insufficient credits to burn", async function () {
        await subscription.setLedgerContract(ledger.address);
        await expect(
            subscription.connect(ledger).burnFacilityCredits(stranger.address, 10)
        ).to.be.revertedWith("Facility has insufficient credits");
    });

    // --- transferETH (ledger only) ---

    it("should allow ledger to transfer ETH to a facility", async function () {
        await subscription.setLedgerContract(ledger.address);
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });

        const before = await ethers.provider.getBalance(stranger.address);
        await subscription.connect(ledger).transferETH(stranger.address, BRONZE_PRICE);
        const after = await ethers.provider.getBalance(stranger.address);

        expect(after - before).to.equal(BRONZE_PRICE);
    });

    it("should not allow non-ledger to call transferETH", async function () {
        await expect(
            subscription.connect(stranger).transferETH(stranger.address, BRONZE_PRICE)
        ).to.be.revertedWith("Not ledger");
    });

    it("should revert transferETH if insufficient platform fees", async function () {
        await subscription.setLedgerContract(ledger.address);
        await expect(
            subscription.connect(ledger).transferETH(stranger.address, BRONZE_PRICE)
        ).to.be.revertedWith("Insufficient ETH in contract");
    });

    // --- VIP Badge ---

    it("should allow ledger to mint a VIP badge for a member", async function () {
        await subscription.setLedgerContract(ledger.address);
        await subscription.connect(ledger).mintVIPBadge(member.address, stranger.address);
        expect(await subscription.hasVIPBadge(member.address, stranger.address)).to.equal(true);
    });

    it("should not mint a duplicate VIP badge", async function () {
        await subscription.setLedgerContract(ledger.address);
        await subscription.connect(ledger).mintVIPBadge(member.address, stranger.address);
        await subscription.connect(ledger).mintVIPBadge(member.address, stranger.address);
        const badgeId = BigInt(stranger.address);
        expect(await subscription.balanceOf(member.address, badgeId)).to.equal(1);
    });

    it("should not allow non-ledger to mint a VIP badge", async function () {
        await expect(
            subscription.connect(stranger).mintVIPBadge(member.address, stranger.address)
        ).to.be.revertedWith("Not ledger");
    });

    // --- View helpers ---

    it("should return correct member tier", async function () {
        await subscription.connect(member).subscribe(SILVER, { value: SILVER_PRICE });
        expect(await subscription.getMemberTier(member.address)).to.equal(SILVER);
    });

    it("should return subscription expiry roughly 30 days from now", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        const expiry = await subscription.getExpiry(member.address);
        const now = BigInt(Math.floor(Date.now() / 1000));
        expect(expiry).to.be.greaterThan(now);
    });

    it("should return correct visit and category caps per tier", async function () {
        expect(await subscription.getVisitCap(BRONZE)).to.equal(8);
        expect(await subscription.getVisitCap(SILVER)).to.equal(16);
        expect(await subscription.getVisitCap(GOLD)).to.equal(30);

        expect(await subscription.getCategoryCap(BRONZE)).to.equal(3);
        expect(await subscription.getCategoryCap(SILVER)).to.equal(6);
        expect(await subscription.getCategoryCap(GOLD)).to.equal(10);
    });

    // --- Admin withdraw ---

    it("should allow admin to withdraw platform fees", async function () {
        await subscription.connect(member).subscribe(BRONZE, { value: BRONZE_PRICE });
        const before = await ethers.provider.getBalance(admin.address);
        await subscription.withdraw();
        const after = await ethers.provider.getBalance(admin.address);
        expect(after).to.be.greaterThan(before);
    });

    it("should not allow non-admin to withdraw platform fees", async function () {
        await expect(
            subscription.connect(stranger).withdraw()
        ).to.be.revertedWith("Not admin");
    });

    it("should revert withdraw if no fees accumulated", async function () {
        await expect(subscription.withdraw()).to.be.revertedWith("No fees to withdraw");
    });
});
