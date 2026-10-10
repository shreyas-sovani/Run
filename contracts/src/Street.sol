// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Holds the AUSD that has left the bank (withdrawals and fire-sale losses).
///         Created by `RunBank`'s constructor. Only the bank can sweep it back.
contract Street {
    using SafeERC20 for IERC20;

    error NotBank();

    IERC20 public immutable ausd;
    address public immutable bank;

    constructor(IERC20 ausd_) {
        ausd = ausd_;
        bank = msg.sender;
    }

    /// @notice Return everything to the bank. Callable only by the bank.
    function sweep() external {
        if (msg.sender != bank) revert NotBank();
        uint256 bal = ausd.balanceOf(address(this));
        if (bal != 0) ausd.safeTransfer(bank, bal);
    }
}
