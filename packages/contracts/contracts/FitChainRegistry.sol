// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract FitChainRegistry {

    address public admin;

    struct PeakHours {
        uint8 startHour;
        uint8 endHour;
        uint8 multiplier;
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

    function registerFacility(address _facility, string calldata _name, string calldata _vendor, string calldata _category) external onlyAdmin {
        require(_facility != address(0), "Invalid address");
        require(!facilities[_facility].exists, "Already registered");
        facilities[_facility] = Facility({ name: _name, vendor: _vendor, category: _category, isWhitelisted: true, exists: true, peakHours: PeakHours({ startHour: 0, endHour: 0, multiplier: 100, isSet: false }) });
        facilityList.push(_facility);
        emit FacilityRegistered(_facility, _name, _vendor, _category);
    }

    function removeFacility(address _facility) external onlyAdmin facilityExists(_facility) {
        facilities[_facility].isWhitelisted = false;
        emit FacilityRemoved(_facility);
    }

    function setPeakHours(uint8 _startHour, uint8 _endHour, uint8 _multiplier) external facilityExists(msg.sender) {
        require(facilities[msg.sender].isWhitelisted, "Facility not whitelisted");
        require(_startHour < 24 && _endHour < 24, "Invalid hour");
        require(_startHour < _endHour, "Start must be before end");
        require(_multiplier >= 100, "Multiplier must be >= 100");
        facilities[msg.sender].peakHours = PeakHours({ startHour: _startHour, endHour: _endHour, multiplier: _multiplier, isSet: true });
        emit PeakHoursSet(msg.sender, _startHour, _endHour, _multiplier);
    }

    function getCreditMultiplier(address _facility) external view facilityExists(_facility) returns (uint8) {
        PeakHours memory ph = facilities[_facility].peakHours;
        if (!ph.isSet) return 100;
        uint8 currentHour = uint8((block.timestamp % 86400) / 3600);
        if (currentHour >= ph.startHour && currentHour < ph.endHour) { return ph.multiplier; }
        return 100;
    }

    function isWhitelisted(address _facility) external view returns (bool) {
        return facilities[_facility].isWhitelisted;
    }

    function getFacility(address _facility) external view facilityExists(_facility) returns (string memory name, string memory vendor, string memory category, bool isWhitelistedStatus) {
        Facility memory f = facilities[_facility];
        return (f.name, f.vendor, f.category, f.isWhitelisted);
    }

    function getPeakHours(address _facility) external view facilityExists(_facility) returns (uint8 startHour, uint8 endHour, uint8 multiplier, bool isSet) {
        PeakHours memory ph = facilities[_facility].peakHours;
        return (ph.startHour, ph.endHour, ph.multiplier, ph.isSet);
    }

    function getAllFacilities() external view returns (address[] memory) {
        return facilityList;
    }
}