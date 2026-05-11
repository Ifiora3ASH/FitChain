pragma solidity ^0.8.28;

contract FitnessPassRegistry {

    address public admin;

    struct Facility {
        string name;
        string vendor;
        string category;
        bool isWhitelisted;
        bool exists;
    }
    
    
}