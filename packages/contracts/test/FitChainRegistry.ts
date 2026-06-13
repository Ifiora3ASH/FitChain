import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("FitChainRegistry", function () {
    let registry: any;
    let admin: any;
    let facility1: any;
    let stranger: any;

    beforeEach(async function () {
        [admin, facility1, stranger] = await ethers.getSigners();
        const Registry = await ethers.getContractFactory("FitChainRegistry");
        registry = await Registry.deploy();
    });

    // --- Admin & Registration ---

    it("should set the deployer as admin", async function () {
        expect(await registry.admin()).to.equal(admin.address);
    });

    it("should allow admin to register a facility", async function () {
        await registry.registerFacility(facility1.address, "City Gym", "GymCo", "climbing");
        const [name, vendor, category, whitelisted] = await registry.getFacility(facility1.address);
        expect(name).to.equal("City Gym");
        expect(vendor).to.equal("GymCo");
        expect(category).to.equal("climbing");
        expect(whitelisted).to.equal(true);
    });

    it("should not allow a non-admin to register a facility", async function () {
        await expect(
            registry.connect(stranger).registerFacility(facility1.address, "City Climbing", "ClimbCo", "climbing")
        ).to.be.revertedWith("Not Admin");
    });

    it("should not allow registering the same facility twice", async function () {
        await registry.registerFacility(facility1.address, "City Climbing", "ClimbCo", "climbing");
        await expect(
            registry.registerFacility(facility1.address, "City Climbing", "ClimbCo", "climbing")
        ).to.be.revertedWith("Already registered");
    });

    it("should not allow registering a zero address", async function () {
        await expect(
            registry.registerFacility("0x0000000000000000000000000000000000000000", "Gym", "Vendor", "yoga")
        ).to.be.revertedWith("Invalid address");
    });

    it("should allow admin to remove a facility", async function () {
        await registry.registerFacility(facility1.address, "City Climbing", "ClimbCo", "climbing");
        await registry.removeFacility(facility1.address);
        expect(await registry.isWhitelisted(facility1.address)).to.equal(false);
    });

    it("should not allow non-admin to remove a facility", async function () {
        await registry.registerFacility(facility1.address, "City Climbing", "ClimbCo", "climbing");
        await expect(
            registry.connect(stranger).removeFacility(facility1.address)
        ).to.be.revertedWith("Not Admin");
    });

    it("should return all registered facilities", async function () {
        await registry.registerFacility(facility1.address, "City Climbing", "ClimbCo", "climbing");
        const list = await registry.getAllFacilities();
        expect(list).to.include(facility1.address);
    });

    it("should emit FacilityRegistered event", async function () {
        await expect(
            registry.registerFacility(facility1.address, "City Climbing", "ClimbCo", "climbing")
        ).to.emit(registry, "FacilityRegistered");
    });

    it("should emit FacilityRemoved event", async function () {
        await registry.registerFacility(facility1.address, "City Climbing", "ClimbCo", "climbing");
        await expect(registry.removeFacility(facility1.address)).to.emit(registry, "FacilityRemoved");
    });

    // --- Peak Hours ---

    it("should allow admin to set peak hours for a facility", async function () {
        await registry.registerFacility(facility1.address, "City Gym", "GymCo", "climbing");
        await registry.setPeakHours(facility1.address, 7, 9, 150);
        const [start, end, multiplier, isSet] = await registry.getPeakHours(facility1.address);
        expect(start).to.equal(7);
        expect(end).to.equal(9);
        expect(multiplier).to.equal(150);
        expect(isSet).to.equal(true);
    });

    it("should not allow non-admin to set peak hours", async function () {
        await registry.registerFacility(facility1.address, "City Gym", "GymCo", "climbing");
        await expect(
            registry.connect(stranger).setPeakHours(facility1.address, 7, 9, 150)
        ).to.be.revertedWith("Not Admin");
    });

    it("should reject invalid peak hour range", async function () {
        await registry.registerFacility(facility1.address, "City Gym", "GymCo", "climbing");
        await expect(
            registry.setPeakHours(facility1.address, 9, 7, 150)
        ).to.be.revertedWith("Start must be before end");
    });

    it("should reject multiplier below 100", async function () {
        await registry.registerFacility(facility1.address, "City Gym", "GymCo", "climbing");
        await expect(
            registry.setPeakHours(facility1.address, 7, 9, 80)
        ).to.be.revertedWith("Multiplier must be >= 100");
    });

    it("should return multiplier 100 when peak hours not set", async function () {
        await registry.registerFacility(facility1.address, "City Gym", "GymCo", "climbing");
        expect(await registry.getCreditMultiplier(facility1.address)).to.equal(100);
    });

    it("should emit PeakHoursSet event", async function () {
        await registry.registerFacility(facility1.address, "City Gym", "GymCo", "climbing");
        await expect(
            registry.setPeakHours(facility1.address, 7, 9, 150)
        ).to.emit(registry, "PeakHoursSet");
    });
});
