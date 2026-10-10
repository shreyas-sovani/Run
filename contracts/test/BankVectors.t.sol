// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {IRunBank} from "../src/IRunBank.sol";
import {RunBank} from "../src/RunBank.sol";
import {MockAUSD} from "../src/MockAUSD.sol";

/// @notice Replays B's golden vectors (app/src/engine/data/vectors/bank-vectors.json, PRD 11.7) against the contract.
///         Every post-tick field is asserted, once with one `sealTicks` per tick and once with the whole scenario batched.
contract BankVectorsTest is Test {
    string internal constant DIR = "../app/src/engine/data/";
    address internal owner = makeAddr("owner");
    address internal op = makeAddr("operator");

    string internal vectors;
    string internal ledgerJson;

    function setUp() public {
        vectors = vm.readFile(string.concat(DIR, "vectors/bank-vectors.json"));
        ledgerJson = vm.readFile(string.concat(DIR, "ledger.json"));
    }

    function test_VectorsLedgerHashMatchesLedgerJson() public view {
        assertEq(vm.parseJsonBytes32(vectors, ".ledgerHash"), vm.parseJsonBytes32(ledgerJson, ".ledgerHash"));
    }

    function test_GoldenVectors_TickByTick() public {
        uint256 n = _scenarioCount();
        assertGt(n, 0, "no scenarios");
        for (uint256 s; s < n; ++s) {
            _runScenario(s, false);
        }
    }

    function test_GoldenVectors_WholeScenarioBatched() public {
        uint256 n = _scenarioCount();
        for (uint256 s; s < n; ++s) {
            _runScenario(s, true);
        }
    }

    // ───────────────────────────────────────────────────────────────────────

    function _scenarioCount() internal view returns (uint256) {
        return abi.decode(vm.parseJson(vectors, ".scenarios[*].name"), (string[])).length;
    }

    function _p(uint256 s) internal pure returns (string memory) {
        return string.concat(".scenarios[", vm.toString(s), "]");
    }

    function _config(string memory base) internal view returns (IRunBank.Config memory) {
        return IRunBank.Config({
            cash0: uint64(vm.parseJsonUint(vectors, string.concat(base, ".config.cash0"))),
            bonds0: uint64(vm.parseJsonUint(vectors, string.concat(base, ".config.bonds0"))),
            speedBumpBps: uint16(vm.parseJsonUint(vectors, string.concat(base, ".config.speedBumpBps"))),
            insuredCap: uint64(vm.parseJsonUint(vectors, string.concat(base, ".config.insuredCap"))),
            haircutBaseBps: uint16(vm.parseJsonUint(vectors, string.concat(base, ".config.haircutBaseBps"))),
            haircutSlopeBps: uint16(vm.parseJsonUint(vectors, string.concat(base, ".config.haircutSlopeBps"))),
            haircutMaxBps: uint16(vm.parseJsonUint(vectors, string.concat(base, ".config.haircutMaxBps"))),
            quietTicks: uint16(vm.parseJsonUint(vectors, string.concat(base, ".config.quietTicks")))
        });
    }

    function _deploy(string memory base) internal returns (RunBank bank, MockAUSD token) {
        token = new MockAUSD();
        vm.prank(owner);
        bank = new RunBank(token, op);
        vm.prank(owner);
        bank.loadLedger(
            vm.parseJsonUintArray(ledgerJson, ".packed"), uint16(vm.parseJsonUint(ledgerJson, ".count"))
        );
        IRunBank.Config memory c = _config(base);
        vm.prank(op);
        bank.setLevel(uint8(vm.parseJsonUint(vectors, string.concat(base, ".level"))), c);
        token.mint(address(bank), uint256(c.cash0) + c.bonds0);
        vm.prank(op);
        bank.startRumor(1, 0, 42, bytes32(uint256(7)));
    }

    function _runScenario(uint256 s, bool batched) internal {
        string memory base = _p(s);
        string memory name = vm.parseJsonString(vectors, string.concat(base, ".name"));
        (RunBank bank, MockAUSD token) = _deploy(base);
        assertEq(bank.snapshot().ledgerHash, vm.parseJsonBytes32(vectors, ".ledgerHash"), name);

        uint256 nTicks;
        while (vm.keyExistsJson(vectors, string.concat(base, ".ticks[", vm.toString(nTicks), "]"))) ++nTicks;
        assertGt(nTicks, 0, name);
        uint16[][] memory all = new uint16[][](nTicks);
        for (uint256 t; t < nTicks; ++t) {
            all[t] = _requested(base, t);
        }

        if (batched) {
            vm.prank(op);
            bank.sealTicks(1, all);
            // The batch stops at the first non-Running status, which is the last tick of every scenario.
            _expectSnapshot(bank, string.concat(base, ".ticks[", vm.toString(nTicks - 1), "].expect"), name);
            _funds(bank, token, name);
            return;
        }

        for (uint256 t; t < nTicks; ++t) {
            uint16[][] memory one = new uint16[][](1);
            one[0] = all[t];
            string memory e = string.concat(base, ".ticks[", vm.toString(t), "].expect");
            string memory label = string.concat(name, " tick ", vm.toString(t + 1));

            vm.recordLogs();
            vm.prank(op);
            (uint32 last, IRunBank.Status st) = bank.sealTicks(uint32(t + 1), one);
            Vm.Log[] memory logs = vm.getRecordedLogs();

            assertEq(last, t + 1, label);
            assertEq(uint8(st), vm.parseJsonUint(vectors, string.concat(e, ".status")), label);
            _expectSummary(logs, e, label);
            _expectSnapshot(bank, e, label);
            _funds(bank, token, label);

            if (st != IRunBank.Status.Running) {
                assertEq(t + 1, nTicks, string.concat(label, ": scenario must end at the first non-Running tick"));
            }
        }
    }

    function _requested(string memory base, uint256 t) internal view returns (uint16[] memory r) {
        uint256[] memory raw = vm.parseJsonUintArray(vectors, string.concat(base, ".ticks[", vm.toString(t), "].requested"));
        r = new uint16[](raw.length);
        for (uint256 i; i < raw.length; ++i) {
            r[i] = uint16(raw[i]);
        }
    }

    function _u(string memory e, string memory k) internal view returns (uint256) {
        return vm.parseJsonUint(vectors, string.concat(e, ".", k));
    }

    function _expectSnapshot(RunBank bank, string memory e, string memory label) internal view {
        IRunBank.Snapshot memory snap = bank.snapshot();
        assertEq(snap.cash, _u(e, "cash"), string.concat(label, " cash"));
        assertEq(snap.bonds, _u(e, "bonds"), string.concat(label, " bonds"));
        assertEq(snap.depositsOwed, _u(e, "depositsOwed"), string.concat(label, " depositsOwed"));
        assertEq(snap.insuredOwed, _u(e, "insuredOwed"), string.concat(label, " insuredOwed"));
        assertEq(snap.cumulativeLoss, _u(e, "cumulativeLoss"), string.concat(label, " cumulativeLoss"));
        assertEq(snap.queueLength, _u(e, "queueLength"), string.concat(label, " queueLength"));
        assertEq(uint8(snap.status), _u(e, "status"), string.concat(label, " status"));
        assertEq(snap.withdrawnCount, _u(e, "withdrawnCount"), string.concat(label, " withdrawnCount"));
        assertEq(snap.lastHaircutBps, _u(e, "haircutBps"), string.concat(label, " lastHaircutBps"));
    }

    /// @dev Decode the TickSealed event of this call and check the TickSummary fields.
    function _expectSummary(Vm.Log[] memory logs, string memory e, string memory label) internal view {
        bytes32 topic = IRunBank.TickSealed.selector;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] != topic) continue;
            (, , IRunBank.TickSummary memory sm) = abi.decode(logs[i].data, (uint32, uint16[], IRunBank.TickSummary));
            assertEq(sm.served, _u(e, "served"), string.concat(label, " served"));
            assertEq(sm.skipped, _u(e, "skipped"), string.concat(label, " skipped"));
            assertEq(sm.haircutBps, _u(e, "haircutBps"), string.concat(label, " haircutBps"));
            assertEq(sm.queueLengthAfter, _u(e, "queueLength"), string.concat(label, " queueLengthAfter"));
            assertEq(sm.paid, _u(e, "paid"), string.concat(label, " paid"));
            assertEq(sm.bondsSold, _u(e, "bondsSold"), string.concat(label, " bondsSold"));
            assertEq(sm.fireSaleLoss, _u(e, "fireSaleLoss"), string.concat(label, " fireSaleLoss"));
            assertEq(sm.cashAfter, _u(e, "cash"), string.concat(label, " cashAfter"));
            assertEq(sm.bondsAfter, _u(e, "bonds"), string.concat(label, " bondsAfter"));
            assertEq(sm.depositsOwedAfter, _u(e, "depositsOwed"), string.concat(label, " depositsOwedAfter"));
            return;
        }
        revert(string.concat(label, ": no TickSealed event"));
    }

    /// @dev AUSD is conserved: bank + Street always hold exactly what was funded.
    function _funds(RunBank bank, MockAUSD token, string memory label) internal view {
        IRunBank.Snapshot memory snap = bank.snapshot();
        assertEq(snap.ausdHeld + snap.streetHeld, token.totalSupply(), string.concat(label, " conservation"));
    }
}
