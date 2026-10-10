// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRunBank} from "../src/IRunBank.sol";
import {RunBank} from "../src/RunBank.sol";
import {Street} from "../src/Street.sol";

/// @notice Monad testnet fork: the real AUSD token, a short Bhau's run to failure, reset, then a Monad Mutual run.
///         Skipped when MONAD_RPC_URL is not set. Run: `set -a; source .env; set +a; forge test --match-contract Fork`
contract ForkTest is Test {
    address internal constant AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    uint256 internal constant U = 1e6;

    RunBank internal bank;
    Street internal street;
    address internal owner = makeAddr("owner");
    address internal op = makeAddr("operator");

    function setUp() public {
        string memory rpc = vm.envOr("MONAD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) vm.skip(true);
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 10143);

        vm.prank(owner);
        bank = new RunBank(IERC20(AUSD), op);
        street = Street(bank.street());

        uint256[] memory packed = _ledger();
        vm.prank(owner);
        bank.loadLedger(packed, 500);
        vm.prank(op);
        bank.setLevel(0, _cfg(0));
        _fundFromHolder(address(bank), 10_000 * U);
    }

    /// @dev `deal` can't write AUSD's storage layout, so borrow from a holder (fork only, nothing is broadcast).
    ///      The already-deployed testnet bank holds 10,000 AUSD; fall back to the testnet operator.
    function _fundFromHolder(address to, uint256 amount) internal {
        string memory dep = vm.readFile("../app/src/config/deployment.testnet.json");
        address[2] memory holders =
            [vm.parseJsonAddress(dep, ".runBank"), vm.parseJsonAddress(dep, ".operator")];
        for (uint256 i; i < holders.length; ++i) {
            if (IERC20(AUSD).balanceOf(holders[i]) >= amount) {
                vm.prank(holders[i]);
                IERC20(AUSD).transfer(to, amount);
                return;
            }
        }
        vm.skip(true);
    }

    function _ledger() internal pure returns (uint256[] memory packed) {
        packed = new uint256[](63);
        for (uint256 i; i < 500; ++i) {
            uint256 v = i < 25 ? 190 * U : 10 * U;
            packed[i >> 3] |= v << (32 * (i & 7));
        }
    }

    function _cfg(uint8 lvl) internal pure returns (IRunBank.Config memory c) {
        c = IRunBank.Config(uint64(1500 * U), uint64(8500 * U), 0, 0, 200, 6000, 9000, 8);
        if (lvl == 1) {
            c.speedBumpBps = 300;
            c.insuredCap = uint64(50 * U);
        }
    }

    function _range(uint256 a, uint256 b) internal pure returns (uint16[] memory r) {
        r = new uint16[](b - a);
        for (uint256 i = a; i < b; ++i) r[i - a] = uint16(i);
    }

    function _seal(uint32 first, uint16[] memory t) internal returns (IRunBank.Status st) {
        uint16[][] memory ts = new uint16[][](1);
        ts[0] = t;
        vm.prank(op);
        (, st) = bank.sealTicks(first, ts);
    }

    function test_Fork_AusdIsSixDecimals() public view {
        assertEq(IERC20(AUSD).balanceOf(address(bank)), 10_000 * U);
        (bool ok, bytes memory d) = AUSD.staticcall(abi.encodeWithSignature("decimals()"));
        assertTrue(ok);
        assertEq(abi.decode(d, (uint8)), 6);
    }

    function test_Fork_BhauFailsThenResetThenMonadMutualSurvives() public {
        // Bhau's: everyone runs at once -> the bank fails.
        vm.prank(op);
        bank.startRumor(0, 0, 1, bytes32(0));
        assertEq(uint8(_seal(1, _range(0, 500))), uint8(IRunBank.Status.Failed));
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.ausdHeld + s.streetHeld, 10_000 * U);
        assertGt(s.streetHeld, 0);

        // Reset sweeps Street back (AUSD returns to the bank).
        vm.prank(op);
        bank.reset();
        s = bank.snapshot();
        assertEq(s.streetHeld, 0);
        assertEq(s.ausdHeld, 10_000 * U);
        assertEq(uint8(s.status), uint8(IRunBank.Status.Ready));

        // Monad Mutual: speed bump + insurance, a small run, quiet ticks -> survives.
        vm.prank(op);
        bank.setLevel(1, _cfg(1));
        vm.prank(op);
        bank.startRumor(1, 0, 2, bytes32(0));
        assertEq(uint8(_seal(1, _range(25, 30))), uint8(IRunBank.Status.Running));
        IRunBank.Status st;
        for (uint32 t = 2; t < 20; ++t) {
            st = _seal(t, new uint16[](0));
            if (st != IRunBank.Status.Running) break;
        }
        assertEq(uint8(st), uint8(IRunBank.Status.Survived));
    }
}
