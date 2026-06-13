import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("FitChainLedger", function () {
    let registry: any;
    let subscription: any;
    let ledger: any;
    let admin: any;
    let facility: any;
    let member: any;
    let stranger: any;

    const BRONZE_PRICE  = ethers.parseEther("0.05");
    const SESSION_PRICE = 10n;
    const CREDIT_RATE   = ethers.parseEther("0.001"); // 1 credit = 0.001 ETH

    async function deployAll() {
        [admin, facility, member, stranger] = await ethers.getSigners();

        const Registry     = await ethers.getContractFactory("FitChainRegistry");
        const Subscription = await ethers.getContractFactory("FitChainSubscription");
        const Ledger       = await ethers.getContractFactory("FitChainLedger");

        registry     = await Registry.deploy();
        subscription = await Subscription.deploy();
        ledger       = await Ledger.deploy(registry.target, subscription.target, CREDIT_RATE);

        await subscription.setLedgerContract(ledger.target);
    }

    async function setupFacilityAndMember() {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await ledger.connect(facility).setSessionPrice(SESSION_PRICE);
        await subscription.connect(member).subscribe(1, { value: BRONZE_PRICE }); // Bronze = 40 credits
    }

    beforeEach(async function () {
        await deployAll();
    });

    // --- Deployment ---

    it("should set the deployer as admin", async function () {
        expect(await ledger.admin()).to.equal(admin.address);
    });

    it("should store registry and subscription addresses", async function () {
        expect(await ledger.registry()).to.equal(registry.target);
        expect(await ledger.subscription()).to.equal(subscription.target);
    });

    it("should store the initial credit to ETH rate", async function () {
        expect(await ledger.creditToEthRate()).to.equal(CREDIT_RATE);
    });

    // --- Session Price ---

    it("should allow a whitelisted facility to set session price", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await ledger.connect(facility).setSessionPrice(SESSION_PRICE);
        const account = await ledger.facilityAccounts(facility.address);
        expect(account.sessionPrice).to.equal(SESSION_PRICE);
    });

    it("should not allow a non-whitelisted address to set session price", async function () {
        await expect(
            ledger.connect(stranger).setSessionPrice(SESSION_PRICE)
        ).to.be.revertedWith("Not a whitelisted facility");
    });

    it("should reject a session price of zero", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await expect(
            ledger.connect(facility).setSessionPrice(0)
        ).to.be.revertedWith("Price must be greater than 0");
    });

    it("should emit SessionPriceUpdated event", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await expect(
            ledger.connect(facility).setSessionPrice(SESSION_PRICE)
        ).to.emit(ledger, "SessionPriceUpdated");
    });

    // --- VIP Discount ---

    it("should allow a whitelisted facility to set a VIP discount", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await ledger.connect(facility).setVIPDiscount(20);
        const account = await ledger.facilityAccounts(facility.address);
        expect(account.vipDiscount).to.equal(20);
    });

    it("should not allow non-whitelisted address to set VIP discount", async function () {
        await expect(
            ledger.connect(stranger).setVIPDiscount(20)
        ).to.be.revertedWith("Not a whitelisted facility");
    });

    it("should reject VIP discount below 5%", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await expect(
            ledger.connect(facility).setVIPDiscount(4)
        ).to.be.revertedWith("Discount must be between 5% and 50%");
    });

    it("should reject VIP discount above 50%", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await expect(
            ledger.connect(facility).setVIPDiscount(51)
        ).to.be.revertedWith("Discount must be between 5% and 50%");
    });

    it("should emit VIPDiscountSet event", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await expect(
            ledger.connect(facility).setVIPDiscount(20)
        ).to.emit(ledger, "VIPDiscountSet");
    });

    // --- Credit Rate ---

    it("should allow admin to update the credit to ETH rate", async function () {
        await ledger.updateCreditToEthRate(ethers.parseEther("0.002"));
        expect(await ledger.creditToEthRate()).to.equal(ethers.parseEther("0.002"));
    });

    it("should not allow non-admin to update the rate", async function () {
        await expect(
            ledger.connect(stranger).updateCreditToEthRate(ethers.parseEther("0.002"))
        ).to.be.revertedWith("Not Admin");
    });

    it("should reject a rate of zero", async function () {
        await expect(
            ledger.updateCreditToEthRate(0)
        ).to.be.revertedWith("Rate must be greater than 0");
    });

    it("should emit CreditToEthRateUpdated event", async function () {
        await expect(
            ledger.updateCreditToEthRate(ethers.parseEther("0.002"))
        ).to.emit(ledger, "CreditToEthRateUpdated");
    });

    // --- Check-in ---

    it("should allow a member to check in at a whitelisted facility", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);
        expect(await subscription.getBalance(member.address)).to.equal(30n); // 40 - 10
    });

    it("should transfer credits to the facility on check-in", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);
        expect(await subscription.balanceOf(facility.address, 0)).to.equal(SESSION_PRICE);
    });

    it("should record earnings in the facility account", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);
        expect(await ledger.getEarnings(facility.address)).to.equal(SESSION_PRICE);
    });

    it("should not allow check-in at a non-whitelisted facility", async function () {
        await subscription.connect(member).subscribe(1, { value: BRONZE_PRICE });
        await expect(
            ledger.connect(member).checkIn(stranger.address)
        ).to.be.revertedWith("Facility not whitelisted");
    });

    it("should not allow check-in with an inactive subscription", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await ledger.connect(facility).setSessionPrice(SESSION_PRICE);
        await expect(
            ledger.connect(stranger).checkIn(facility.address)
        ).to.be.revertedWith("Subscription expired or inactive");
    });

    it("should not allow check-in if session price is not set", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await subscription.connect(member).subscribe(1, { value: BRONZE_PRICE });
        await expect(
            ledger.connect(member).checkIn(facility.address)
        ).to.be.revertedWith("Session price not set");
    });

    it("should not allow check-in with insufficient credits", async function () {
        await setupFacilityAndMember();
        await ledger.connect(facility).setSessionPrice(50n); // more than the 40 member has
        await expect(
            ledger.connect(member).checkIn(facility.address)
        ).to.be.revertedWith("Not enough credits");
    });

    it("should not allow check-in beyond the monthly visit cap", async function () {
        // Bronze: visit cap = 8, category cap = 3. Need 3 facilities (3+3+2=8) to reach the visit cap.
        const [,,, freshMember, facility2, facility3] = await ethers.getSigners();

        await registry.registerFacility(facility.address,  "City Gym",   "GymCo",   "gym");
        await registry.registerFacility(facility2.address, "Swim Club",  "AquaCo",  "swimming");
        await registry.registerFacility(facility3.address, "Yoga Space", "YogaCo",  "yoga");
        await ledger.connect(facility).setSessionPrice(1n);
        await ledger.connect(facility2).setSessionPrice(1n);
        await ledger.connect(facility3).setSessionPrice(1n);

        await subscription.connect(freshMember).subscribe(1, { value: BRONZE_PRICE });

        // 3 gym + 3 swimming + 2 yoga = 8 visits (hits monthly cap)
        for (let i = 0; i < 3; i++) await ledger.connect(freshMember).checkIn(facility.address);
        for (let i = 0; i < 3; i++) await ledger.connect(freshMember).checkIn(facility2.address);
        for (let i = 0; i < 2; i++) await ledger.connect(freshMember).checkIn(facility3.address);

        await expect(
            ledger.connect(freshMember).checkIn(facility3.address)
        ).to.be.revertedWith("Monthly visit cap reached");
    });

    it("should not allow check-in beyond the monthly category cap", async function () {
        await setupFacilityAndMember();
        const [,,, freshMember] = await ethers.getSigners();
        await subscription.connect(freshMember).subscribe(1, { value: BRONZE_PRICE }); // Bronze: category cap = 3

        await ledger.connect(facility).setSessionPrice(1n);

        for (let i = 0; i < 3; i++) {
            await ledger.connect(freshMember).checkIn(facility.address);
        }
        await expect(
            ledger.connect(freshMember).checkIn(facility.address)
        ).to.be.revertedWith("Category visit cap reached");
    });

    it("should emit CheckIn event", async function () {
        await setupFacilityAndMember();
        await expect(
            ledger.connect(member).checkIn(facility.address)
        ).to.emit(ledger, "CheckIn");
    });

    // --- Visit Status ---

    it("should track monthly visits correctly", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);
        const [used, remaining] = await ledger.getMonthlyVisitStatus(member.address);
        expect(used).to.equal(1);
        expect(remaining).to.equal(7); // Bronze cap = 8
    });

    it("should track category visits correctly", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);
        const [used, remaining] = await ledger.getCategoryVisitStatus(member.address, "gym");
        expect(used).to.equal(1);
        expect(remaining).to.equal(2); // Bronze category cap = 3
    });

    // --- VIP Badge ---

    it("should award a VIP badge after 4 consecutive weekly check-ins", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await ledger.connect(facility).setSessionPrice(1n);
        await subscription.connect(member).subscribe(3, { value: ethers.parseEther("0.15") }); // Gold: category cap = 10

        // Simulate 4 consecutive weeks by time-travelling
        for (let week = 0; week < 4; week++) {
            await ledger.connect(member).checkIn(facility.address);
            if (week < 3) {
                await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
                await ethers.provider.send("evm_mine", []);
            }
        }

        expect(await subscription.hasVIPBadge(member.address, facility.address)).to.equal(true);
    });

    it("should reset the consecutive week streak after a missed week", async function () {
        await setupFacilityAndMember();
        await ledger.connect(facility).setSessionPrice(1n);

        await ledger.connect(member).checkIn(facility.address);

        // Skip 2 weeks (gap in visits)
        await ethers.provider.send("evm_increaseTime", [14 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);

        await ledger.connect(member).checkIn(facility.address);

        // Streak should have reset to 1, so no VIP badge yet
        expect(await subscription.hasVIPBadge(member.address, facility.address)).to.equal(false);
    });

    it("should emit VIPBadgeEarned event", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await ledger.connect(facility).setSessionPrice(1n);
        await subscription.connect(member).subscribe(3, { value: ethers.parseEther("0.15") }); // Gold: category cap = 10

        for (let week = 0; week < 3; week++) {
            await ledger.connect(member).checkIn(facility.address);
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine", []);
        }

        await expect(
            ledger.connect(member).checkIn(facility.address)
        ).to.emit(ledger, "VIPBadgeEarned");
    });

    // --- Earnings & Withdrawal ---

    it("should return correct earnings in credits", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);
        expect(await ledger.getEarnings(facility.address)).to.equal(SESSION_PRICE);
    });

    it("should return correct earnings in ETH value", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);
        const expected = SESSION_PRICE * CREDIT_RATE;
        expect(await ledger.getEarningsInEth(facility.address)).to.equal(expected);
    });

    it("should allow a facility to withdraw earnings as ETH", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);

        const before = await ethers.provider.getBalance(facility.address);
        const tx = await ledger.connect(facility).withdrawEarnings();
        const receipt = await tx.wait();
        const gas = receipt.gasUsed * receipt.gasPrice;
        const after = await ethers.provider.getBalance(facility.address);

        const expected = SESSION_PRICE * CREDIT_RATE;
        expect(after - before + gas).to.equal(expected);
    });

    it("should reset earnings to zero after withdrawal", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);
        await ledger.connect(facility).withdrawEarnings();
        expect(await ledger.getEarnings(facility.address)).to.equal(0);
    });

    it("should burn facility credits after withdrawal", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);
        await ledger.connect(facility).withdrawEarnings();
        expect(await subscription.balanceOf(facility.address, 0)).to.equal(0);
    });

    it("should not allow withdrawal with no earnings", async function () {
        await registry.registerFacility(facility.address, "City Gym", "GymCo", "gym");
        await expect(
            ledger.connect(facility).withdrawEarnings()
        ).to.be.revertedWith("No earnings to withdraw");
    });

    it("should not allow non-whitelisted address to withdraw earnings", async function () {
        await expect(
            ledger.connect(stranger).withdrawEarnings()
        ).to.be.revertedWith("Not a whitelisted facility");
    });

    it("should emit EarningsWithdrawn event", async function () {
        await setupFacilityAndMember();
        await ledger.connect(member).checkIn(facility.address);
        await expect(
            ledger.connect(facility).withdrawEarnings()
        ).to.emit(ledger, "EarningsWithdrawn");
    });
});
