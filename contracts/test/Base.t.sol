// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IRunBank} from "../src/IRunBank.sol";
import {RunBank} from "../src/RunBank.sol";
import {Street} from "../src/Street.sol";
import {MockAUSD} from "../src/MockAUSD.sol";

/// @dev Shared fixtures. Test ledger: 25 whales of 190 AUSD (ids 0-24) + 475 depositors of 10 AUSD (ids 25-499).
///      Total 9,500 AUSD, same shape as PRD 9.1 so the PRD 9.5 worked example applies exactly.
abstract contract Base is Test {
    uint256 internal constant AUSD = 1e6;
    uint256 internal constant N = 500;

    MockAUSD internal token;
    RunBank internal bank;
    Street internal street;
    address internal owner = makeAddr("owner");
    address internal op = makeAddr("operator");
    address internal backup = makeAddr("backup");
    address internal rando = makeAddr("rando");

    uint32[] internal bals;

    function _config(uint8 which) internal pure returns (IRunBank.Config memory c) {
        c = IRunBank.Config({
            cash0: uint64(1500 * AUSD),
            bonds0: uint64(8500 * AUSD),
            speedBumpBps: 0,
            insuredCap: 0,
            haircutBaseBps: 200,
            haircutSlopeBps: 6000,
            haircutMaxBps: 9000,
            quietTicks: 8
        });
        if (which == 1) {
            c.speedBumpBps = 300;
            c.insuredCap = uint64(50 * AUSD);
        }
    }

    function _ledger() internal returns (uint256[] memory packed) {
        delete bals;
        for (uint256 i; i < N; ++i) bals.push(i < 25 ? uint32(190 * AUSD) : uint32(10 * AUSD));
        packed = _pack(bals);
    }

    function _pack(uint32[] memory b) internal pure returns (uint256[] memory packed) {
        packed = new uint256[]((b.length + 7) / 8);
        for (uint256 i; i < b.length; ++i) packed[i >> 3] |= uint256(b[i]) << (32 * (i & 7));
    }

    function _setUpBank() internal {
        token = new MockAUSD();
        vm.prank(owner);
        bank = new RunBank(token, op);
        street = Street(bank.street());
        vm.prank(owner);
        bank.setOperator(backup, true);
        vm.prank(owner);
        bank.loadLedger(_ledger(), uint16(N));
        vm.prank(op);
        bank.setLevel(0, _config(0));
        token.mint(address(bank), 10_000 * AUSD);
    }

    // ── request helpers ──
    function _range(uint256 a, uint256 b) internal pure returns (uint16[] memory r) {
        r = new uint16[](b - a);
        for (uint256 i = a; i < b; ++i) r[i - a] = uint16(i);
    }

    function _cat(uint16[] memory x, uint16[] memory y) internal pure returns (uint16[] memory r) {
        r = new uint16[](x.length + y.length);
        for (uint256 i; i < x.length; ++i) r[i] = x[i];
        for (uint256 i; i < y.length; ++i) r[x.length + i] = y[i];
    }

    function _one(uint16[] memory t) internal pure returns (uint16[][] memory r) {
        r = new uint16[][](1);
        r[0] = t;
    }

    function _seal(uint32 first, uint16[] memory t) internal returns (uint32 last, IRunBank.Status st) {
        vm.prank(op);
        return bank.sealTicks(first, _one(t));
    }

    function _start() internal {
        vm.prank(op);
        bank.startRumor(1, 0, 42, bytes32(uint256(7)));
    }
}
