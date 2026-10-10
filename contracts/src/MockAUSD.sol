// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fallback test token (6 decimals, open mint). Used only if the real AUSD path breaks.
contract MockAUSD is ERC20 {
    constructor() ERC20("Mock AUSD", "AUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
