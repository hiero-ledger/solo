// File: `contracts/SimpleStorage.sol`
/* solidity */
pragma solidity ^0.8.19;

contract SimpleStorage {
    uint256 private value;
    event ValueChanged(uint256 indexed oldValue, uint256 indexed newValue, address indexed changer);

    constructor(uint256 initial) {
        value = initial;
    }

    function get() external view returns (uint256) {
        return value;
    }

    function set(uint256 newValue) external {
        uint256 old = value;
        value = newValue;
        emit ValueChanged(old, newValue, msg.sender);
    }
}
