// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract FitChainRegistry {

    address public admin;                                                               //stores the address of the contract admin

    struct Facility {
        string name;
        string vendor;
        string category;
        bool isWhitelisted;
        bool exists;
    }

    mapping(address => Facility) private facilities;                                                    //stores the facility data by address
    address[] private facilityList;                                                                     //list of all facility addresses

    event FacilityRegistered(address indexed facility, string name, string vendor, string category);    //triggered to emit when a facility is added
    event FacilityRemoved(address indexed facility);                                                    //triggered to emit when a facility is removed

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not Admin");
        _;
    }

    modifier facilityExists(address _facility) {
        require(facilities[_facility].exists, "Facility not found!");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // US-A1: Register and whitelist a facility
    function registerFacility(address _facility, string calldata _name, string calldata _vendor, string calldata _category) external onlyAdmin{

        require(_facility != address(0), "Invalid address");
        require(!facilities[_facility].exists, "Already registered");

        facilities[_facility] = Facility({
            name: _name,
            vendor: _vendor,
            category: _category,
            isWhitelisted: true,
            exists: true
        });
        facilityList.push(_facility);
        emit FacilityRegistered(_facility, _name, _vendor, _category);
    }

    //US-A2: Remove a facility from the white list
    function removeFacility(address _facility) external onlyAdmin facilityExists(_facility) {
        facilities[_facility].isWhitelisted =false;
        emit FacilityRemoved(_facility);
    }

    function isWhitelisted(address _facility) external view returns (bool) {
        return facilities[_facility].isWhitelisted;
    }

    function getFacility (address _facility) external view facilityExists(_facility) returns (string memory name, string memory vendor, string memory category, bool iswhitelisted){
        Facility memory f = facilities[_facility];
        return (f.name, f.vendor, f.category, f.isWhitelisted);

    }

    function getAllFacilities () external view returns (address[] memory){
        return facilityList;
    }

}