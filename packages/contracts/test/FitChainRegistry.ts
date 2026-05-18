import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("FitChainRegistry", function () {
    let registry: any;
    let admin: any;
    let facility1: any;
    let stranger: any;

    // before each test deploy a fresh contract
    beforeEach(async function () {
        [admin, facility1, stranger] = await ethers.getSigners();
        const Registry = await ethers.getContractFactory("FitChainRegistry");
        registry = await Registry.deploy();
    });

    // test 1 check that the admin is set correctly
    it("should set the deployer as admin", async function(){
        expect(await registry.admin()).to.equal(admin.address);
    });

    // test 2 admin can register a facility
    it("should allw admin to register a facility", async function(){
        await registry.registerFacility(facility1.address, "City gym", "gymco", "climbing");
        const[name, vendor, category, whitelisted] = await registry.getFacility(facility1.address);
        expect(name).to.equal("City gym");
        expect(vendor).to.equal("gymco");
        expect(category).to.equal("climbing");
        expect(whitelisted).to.equal(true);
    })

    // test 3 only admin can register a facility
    it("should not allow a non-admin to register a facility", async function () {
        await expect(
            registry.connect(stranger).registerFacility(facility1.address, "City Climbing", "ClimbCo", "climbing")
        ).to.be.revertedWith("Not Admin");
        
    });

    // test 4 should not allow to register the same facility twice
    it("should not allow to register the same facility twice", async function(){
        await registry.registerFacility(facility1.address,"City Climbing", "ClimbCo", "climbing");
        await expect(registry.registerFacility(facility1.address,"City Climbing", "ClimbCo", "climbing")).to.be.revertedWith("Already registered");
    });

    // test 5 doesnt allow to register a 0 address
    it("should not allow registering a zero address", async function(){
        await expect(registry.registerFacility("0x0000000000000000000000000000000000000000", "Gym", "Vendor", "yoga")).to.be.revertedWith("Invalid address");
    });

    // test 6 admin can remove a facility
    it("should allow admin to remove a facility", async function(){
        await registry.registerFacility(facility1.address,"City Climbing", "ClimbCo", "climbing");
        await registry.removeFacility(facility1.address);
        expect(await registry.isWhitelisted(facility1.address)).to.equal(false);
    });

    // test 7 a non admin cannot remove a facility
    it("should not allow non-admin to remove a facility", async function(){
        await registry.registerFacility(facility1.address,"City Climbing", "ClimbCo", "climbing");
        await expect(registry.connect(stranger).removeFacility(facility1.address)).to.be.revertedWith("Not Admin");
    });

    // test 8 should return all registered facilities
    it("should return all registered facilities", async function(){
        await registry.registerFacility(facility1.address,"City Climbing", "ClimbCo", "climbing");
        const list = await registry.getAllFacilities();
        expect(list).to.include(facility1.address);
    });

    // test 9 should emit an even when a facility is registered
    it("should emit FacilityRegistered event", async function(){
        await expect(registry.registerFacility(facility1.address,"City Climbing", "ClimbCo", "climbing")).to.emit(registry, "FacilityRegistered");
    });

    // test 10 should emit an event when a facility is removed
    it("should emit FacilityRemoved event", async function(){
        await registry.registerFacility(facility1.address,"City Climbing", "ClimbCo", "climbing");
        await expect(registry.removeFacility(facility1.address)).to.emit(registry, "FacilityRemoved");
    });
});