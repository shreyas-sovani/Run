// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Base} from "./Base.t.sol";
import {IRunBank} from "../src/IRunBank.sol";

/// @dev Drives random ticks (strictly ascending random id sets) and the occasional reset.
contract Handler is Base {
    uint256 public funded;
    uint256 public ticksSealed;
    uint256 public resets;

    constructor(uint8 level) {
        _setUpBank();
        if (level == 1) {
            vm.prank(op);
            bank.setLevel(1, _config(1));
        }
        funded = token.balanceOf(address(bank));
        _start();
    }

    function bankAddr() external view returns (address) {
        return address(bank);
    }

    /// @param seed random source; `density` is the chance (out of 256) that each id is requested
    function seal(uint256 seed, uint8 density) external {
        IRunBank.Snapshot memory s = bank.snapshot();
        if (s.status != IRunBank.Status.Running) {
            vm.prank(op);
            bank.reset();
            ++resets;
            _start();
            return;
        }
        uint16[] memory tmp = new uint16[](N);
        uint256 n;
        uint256 h = seed;
        for (uint256 i; i < N; ++i) {
            h = uint256(keccak256(abi.encode(h, i)));
            if (uint8(h) < density) tmp[n++] = uint16(i);
        }
        uint16[] memory req = new uint16[](n);
        for (uint256 i; i < n; ++i) req[i] = tmp[i];
        _seal(s.tick + 1, req);
        ++ticksSealed;
    }
}

abstract contract InvariantBase is StdInvariant {
    Handler internal handler;

    function _init(uint8 level) internal {
        handler = new Handler(level);
        targetContract(address(handler));
    }

    function _bank() internal view returns (IRunBank) {
        return IRunBank(handler.bankAddr());
    }

    function _sumUnwithdrawn(IRunBank b) internal view returns (uint256 sum) {
        uint256[2] memory wd = b.withdrawnBitmap();
        for (uint16 i; i < 500; ++i) {
            if ((wd[i >> 8] >> (i & 255)) & 1 == 0) sum += b.depositorBalance(i);
        }
    }

    function invariant_AusdIsConserved() public view {
        IRunBank.Snapshot memory s = _bank().snapshot();
        require(s.ausdHeld + s.streetHeld == handler.funded(), "AUSD not conserved");
    }

    function invariant_DepositsOwedEqualsUnwithdrawnBalances() public view {
        IRunBank b = _bank();
        require(b.snapshot().depositsOwed == _sumUnwithdrawn(b), "depositsOwed != sum(unwithdrawn)");
    }

    /// cash + bonds + loss + paid == cash0 + bonds0, and nobody is paid twice (paid == deposits0 - depositsOwed).
    function invariant_BalanceSheetAddsUp() public view {
        IRunBank.Snapshot memory s = _bank().snapshot();
        uint256 paidTotal = uint256(s.deposits0) - s.depositsOwed;
        require(
            uint256(s.cash) + s.bonds + s.cumulativeLoss + paidTotal == 10_000 * 1e6, "balance sheet does not add up"
        );
    }

    /// Everything the bank has paid or lost is on Street, and the bank still holds the rest.
    function invariant_StreetHoldsPaidPlusLoss() public view {
        IRunBank.Snapshot memory s = _bank().snapshot();
        uint256 paidTotal = uint256(s.deposits0) - s.depositsOwed;
        require(s.streetHeld == paidTotal + s.cumulativeLoss, "street != paid + loss");
        require(s.ausdHeld == uint256(s.cash) + s.bonds, "bank AUSD != cash + bonds");
    }
}

contract InvariantsBhauTest is InvariantBase {
    function setUp() public {
        _init(0);
    }
}

contract InvariantsMutualTest is InvariantBase {
    function setUp() public {
        _init(1);
    }
}
