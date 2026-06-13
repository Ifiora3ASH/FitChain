// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract FitChainRegistry {

    address public admin;

    struct PeakHours {
        uint8 startHour;  // 0–23 UTC
        uint8 endHour;    // 0–23 UTC, exclusive
        uint8 multiplier; // e.g. 150 = 1.5x, stored as percentage (100 = 1x)
        bool isSet;
    }

    struct Facility {
        string name;
        string vendor;
        string category;
        bool isWhitelisted;
        bool exists;
        PeakHours peakHours;
    }

    mapping(address => Facility) private facilities;
    address[] private facilityList;

    event FacilityRegistered(address indexed facility, string name, string vendor, string category);
    event FacilityRemoved(address indexed facility);
    event PeakHoursSet(address indexed facility, uint8 startHour, uint8 endHour, uint8 multiplier);

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
    function registerFacility(
        address _facility,
        string calldata _name,
        string calldata _vendor,
        string calldata _category
    ) external onlyAdmin {
        require(_facility != address(0), "Invalid address");
        require(!facilities[_facility].exists, "Already registered");

        facilities[_facility] = Facility({
            name: _name,
            vendor: _vendor,
            category: _category,
            isWhitelisted: true,
            exists: true,
            peakHours: PeakHours({ startHour: 0, endHour: 0, multiplier: 100, isSet: false })
        });
        facilityList.push(_facility);
        emit FacilityRegistered(_facility, _name, _vendor, _category);
    }

    // US-A2: Remove a facility from the whitelist
    function removeFacility(address _facility) external onlyAdmin facilityExists(_facility) {
        facilities[_facility].isWhitelisted = false;
        emit FacilityRemoved(_facility);
    }

    // US-A1 (peak hours): Admin sets peak hours and credit multiplier for a facility
    function setPeakHours(
        address _facility,
        uint8 _startHour,
        uint8 _endHour,
        uint8 _multiplier
    ) external onlyAdmin facilityExists(_facility) {
        require(_startHour < 24 && _endHour < 24, "Invalid hour");
        require(_startHour < _endHour, "Start must be before end");
        require(_multiplier >= 100, "Multiplier must be >= 100");

        facilities[_facility].peakHours = PeakHours({
            startHour: _startHour,
            endHour: _endHour,
            multiplier: _multiplier,
            isSet: true
        });
        emit PeakHoursSet(_facility, _startHour, _endHour, _multiplier);
    }

    // Returns the credit multiplier (100 = normal, 150 = 1.5x) based on current time
    function getCreditMultiplier(address _facility) external view facilityExists(_facility) returns (uint8) {
        PeakHours memory ph = facilities[_facility].peakHours;
        if (!ph.isSet) return 100;

        uint8 currentHour = uint8((block.timestamp % 86400) / 3600);
        if (currentHour >= ph.startHour && currentHour < ph.endHour) {
            return ph.multiplier;
        }
        return 100;
    }

    function isWhitelisted(address _facility) external view returns (bool) {
        return facilities[_facility].isWhitelisted;
    }

    function getFacility(address _facility) external view facilityExists(_facility)
        returns (string memory name, string memory vendor, string memory category, bool isWhitelistedStatus)
    {
        Facility memory f = facilities[_facility];
        return (f.name, f.vendor, f.category, f.isWhitelisted);
    }

    function getPeakHours(address _facility) external view facilityExists(_facility)
        returns (uint8 startHour, uint8 endHour, uint8 multiplier, bool isSet)
    {
        PeakHours memory ph = facilities[_facility].peakHours;
        return (ph.startHour, ph.endHour, ph.multiplier, ph.isSet);
    }

    function getAllFacilities() external view returns (address[] memory) {
        return facilityList;
    }
}
