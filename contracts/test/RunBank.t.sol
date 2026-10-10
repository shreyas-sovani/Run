// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRunBank} from "../src/IRunBank.sol";
import {RunBank} from "../src/RunBank.sol";
import {Street} from "../src/Street.sol";
import {MockAUSD} from "../src/MockAUSD.sol";
import {Base} from "./Base.t.sol";

contract LedgerAndConfigTest is Base {
    function setUp() public {
        token = new MockAUSD();
        vm.prank(owner);
        bank = new RunBank(token, op);
        street = Street(bank.street());
    }

    function test_LoadLedger_ReadsBackEveryBalance_AndHashMatchesPackedKeccak() public {
        uint256[] memory packed = _ledger();
        assertEq(packed.length, 63);
        vm.prank(owner);
        bank.loadLedger(packed, uint16(N));
        for (uint16 i; i < N; ++i) {
            assertEq(bank.depositorBalance(i), bals[i], "balance");
        }
        assertEq(bank.depositorBalance(500), 0, "out of range reads 0");
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.ledgerHash, keccak256(abi.encodePacked(packed)));
        assertEq(s.deposits0, 9_500 * AUSD);
        assertEq(uint8(s.status), uint8(IRunBank.Status.Ready));
    }

    function test_LoadLedger_RejectsBadShapes() public {
        uint256[] memory packed = _ledger();
        vm.startPrank(owner);
        vm.expectRevert(IRunBank.BadConfig.selector);
        bank.loadLedger(packed, 0);
        vm.expectRevert(IRunBank.BadConfig.selector);
        bank.loadLedger(packed, 513);
        vm.expectRevert(IRunBank.BadConfig.selector);
        bank.loadLedger(packed, 400); // word count doesn't match ceil(400/8) = 50
        // a non-zero lane past `count` would hide money
        uint256[] memory dirty = _ledger();
        dirty[62] |= uint256(1) << 128; // lane 4 of the last word = id 500
        vm.expectRevert(IRunBank.BadConfig.selector);
        bank.loadLedger(dirty, uint16(N));
        vm.stopPrank();
    }

    function test_LoadLedger_OnlyOwner_OnlyWhenReady() public {
        uint256[] memory packed = _ledger();
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, op));
        bank.loadLedger(packed, uint16(N));

        vm.prank(owner);
        bank.loadLedger(packed, uint16(N));
        vm.prank(op);
        bank.setLevel(0, _config(0));
        token.mint(address(bank), 10_000 * AUSD);
        _start();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.WrongStatus.selector, IRunBank.Status.Ready, IRunBank.Status.Running));
        bank.loadLedger(packed, uint16(N));
    }

    function test_SetLevel_Validation() public {
        vm.prank(owner);
        bank.loadLedger(_ledger(), uint16(N));
        IRunBank.Config memory c = _config(0);

        c.haircutMaxBps = 10_000;
        vm.prank(op);
        vm.expectRevert(IRunBank.BadConfig.selector);
        bank.setLevel(0, c);

        c = _config(0);
        c.bonds0 = 0;
        vm.prank(op);
        vm.expectRevert(IRunBank.BadConfig.selector);
        bank.setLevel(0, c);

        c = _config(0);
        c.quietTicks = 0;
        vm.prank(op);
        vm.expectRevert(IRunBank.BadConfig.selector);
        bank.setLevel(0, c);

        vm.prank(rando);
        vm.expectRevert(IRunBank.NotOperator.selector);
        bank.setLevel(0, _config(0));
    }

    function test_SetLevel_ConfigHash_Event_AndInsuredOwed() public {
        vm.prank(owner);
        bank.loadLedger(_ledger(), uint16(N));

        IRunBank.Config memory c0 = _config(0);
        vm.expectEmit(true, false, false, true);
        emit IRunBank.LevelSet(0, keccak256(abi.encode(c0)), c0);
        vm.prank(op);
        bank.setLevel(0, c0);
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.configHash, keccak256(abi.encode(c0)));
        assertEq(s.insuredOwed, 0, "cap 0 insures nothing");
        assertEq(s.cash, 1500 * AUSD);
        assertEq(s.bonds, 8500 * AUSD);
        assertEq(s.depositsOwed, 9500 * AUSD);

        IRunBank.Config memory c1 = _config(1);
        vm.prank(op);
        bank.setLevel(1, c1);
        s = bank.snapshot();
        assertEq(s.level, 1);
        assertEq(s.configHash, keccak256(abi.encode(c1)));
        // 25 whales capped at 50 + 475 small at 10
        assertEq(s.insuredOwed, (25 * 50 + 475 * 10) * AUSD);
    }

    function test_LoadLedger_AfterSetLevel_RecomputesInsured() public {
        vm.prank(op);
        bank.setLevel(1, _config(1)); // no ledger yet
        assertEq(bank.snapshot().insuredOwed, 0);
        vm.prank(owner);
        bank.loadLedger(_ledger(), uint16(N));
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.insuredOwed, (25 * 50 + 475 * 10) * AUSD);
        assertEq(s.depositsOwed, 9500 * AUSD);
        assertEq(s.cash, 1500 * AUSD);
    }
}

contract LifecycleTest is Base {
    function setUp() public {
        _setUpBank();
    }

    function test_StartRumor_RequiresLedger() public {
        token = new MockAUSD();
        vm.prank(owner);
        bank = new RunBank(token, op);
        vm.prank(op);
        vm.expectRevert(IRunBank.LedgerNotLoaded.selector);
        bank.startRumor(0, 0, 1, bytes32(0));
    }

    function test_StartRumor_Underfunded() public {
        token = new MockAUSD();
        vm.prank(owner);
        bank = new RunBank(token, op);
        vm.prank(owner);
        bank.loadLedger(_ledger(), uint16(N));
        vm.prank(op);
        bank.setLevel(0, _config(0));
        token.mint(address(bank), 9_999 * AUSD);
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.Underfunded.selector, 10_000 * AUSD, 9_999 * AUSD));
        bank.startRumor(0, 0, 1, bytes32(0));
    }

    function test_StartRumor_BadInputs_AndGating() public {
        vm.startPrank(op);
        vm.expectRevert(IRunBank.BadConfig.selector);
        bank.startRumor(4, 0, 1, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(IRunBank.BadDepositor.selector, uint16(500)));
        bank.startRumor(0, 500, 1, bytes32(0));
        vm.stopPrank();
        vm.prank(rando);
        vm.expectRevert(IRunBank.NotOperator.selector);
        bank.startRumor(0, 0, 1, bytes32(0));
        vm.prank(owner); // owner is not automatically an operator
        vm.expectRevert(IRunBank.NotOperator.selector);
        bank.startRumor(0, 0, 1, bytes32(0));
    }

    function test_StartRumor_SetsRunning_EmitsEvent_AndIsReadyOnly() public {
        vm.roll(1234);
        vm.expectEmit(true, false, false, true);
        emit IRunBank.RumorStarted(1, 0, 3, 7, 99, bytes32(uint256(5)), 1234);
        vm.prank(op);
        bank.startRumor(3, 7, 99, bytes32(uint256(5)));
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(uint8(s.status), uint8(IRunBank.Status.Running));
        assertEq(s.runId, 1);
        assertEq(s.startBlock, 1234);

        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.WrongStatus.selector, IRunBank.Status.Ready, IRunBank.Status.Running));
        bank.startRumor(0, 0, 1, bytes32(0));
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.WrongStatus.selector, IRunBank.Status.Ready, IRunBank.Status.Running));
        bank.setLevel(1, _config(1));
    }

    function test_Reset_FromReady_Reverts() public {
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.WrongStatus.selector, IRunBank.Status.Running, IRunBank.Status.Ready));
        bank.reset();
    }

    function test_Reset_FromRunning_SweepsStreet_AndRestoresEverything() public {
        IRunBank.Snapshot memory before_ = bank.snapshot();
        _start();
        _seal(1, _range(0, 10));
        assertGt(token.balanceOf(address(street)), 0, "street has AUSD");
        assertLt(token.balanceOf(address(bank)), 10_000 * AUSD);

        vm.expectEmit(true, false, false, false);
        emit IRunBank.BankReset(1);
        vm.prank(op);
        bank.reset();

        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(uint8(s.status), uint8(IRunBank.Status.Ready));
        assertEq(s.tick, 0);
        assertEq(s.cash, before_.cash);
        assertEq(s.bonds, before_.bonds);
        assertEq(s.depositsOwed, before_.depositsOwed);
        assertEq(s.insuredOwed, before_.insuredOwed);
        assertEq(s.cumulativeLoss, 0);
        assertEq(s.withdrawnCount, 0);
        assertEq(s.queueLength, 0);
        assertEq(s.quietCount, 0);
        assertEq(s.lastHaircutBps, 0);
        assertEq(s.runId, 1, "runId only moves on startRumor");
        assertEq(s.ausdHeld, 10_000 * AUSD);
        assertEq(s.streetHeld, 0);
        uint256[2] memory bm = bank.withdrawnBitmap();
        assertEq(bm[0], 0);
        assertEq(bm[1], 0);
    }

    function test_Reset_AllowsASecondRun_WithIdenticalResults() public {
        _start();
        _seal(1, _range(0, 10));
        IRunBank.Snapshot memory a = bank.snapshot();
        vm.prank(op);
        bank.reset();
        _start();
        _seal(1, _range(0, 10));
        IRunBank.Snapshot memory b = bank.snapshot();
        assertEq(b.runId, 2);
        assertEq(b.cash, a.cash);
        assertEq(b.bonds, a.bonds);
        assertEq(b.depositsOwed, a.depositsOwed);
        assertEq(b.cumulativeLoss, a.cumulativeLoss);
        assertEq(b.streetHeld, a.streetHeld);
    }

    function test_Reset_AfterFailure_Works() public {
        _start();
        _seal(1, _range(0, 500));
        assertEq(uint8(bank.snapshot().status), uint8(IRunBank.Status.Failed));
        vm.prank(op);
        bank.reset();
        assertEq(uint8(bank.snapshot().status), uint8(IRunBank.Status.Ready));
        assertEq(token.balanceOf(address(bank)), 10_000 * AUSD);
    }

    function test_Ping_Operators_AndGating() public {
        vm.roll(777);
        vm.expectEmit(true, false, false, true);
        emit IRunBank.Ping(op, 777);
        vm.prank(op);
        bank.ping();
        vm.prank(backup);
        bank.ping();
        vm.prank(rando);
        vm.expectRevert(IRunBank.NotOperator.selector);
        bank.ping();
        assertTrue(bank.isOperator(op));
        assertTrue(bank.isOperator(backup));
        assertFalse(bank.isOperator(rando));
    }

    function test_SetOperator_OwnerOnly() public {
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, op));
        bank.setOperator(rando, true);
        vm.prank(owner);
        bank.setOperator(rando, true);
        assertTrue(bank.isOperator(rando));
        vm.prank(owner);
        bank.setOperator(rando, false);
        assertFalse(bank.isOperator(rando));
        vm.prank(owner);
        vm.expectRevert(IRunBank.BadConfig.selector);
        bank.setOperator(address(0), true);
    }

    function test_Rescue_OwnerOnly_ReadyOnly() public {
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, op));
        bank.rescue(address(token), op, 1);

        vm.prank(owner);
        bank.rescue(address(token), owner, 100 * AUSD);
        assertEq(token.balanceOf(owner), 100 * AUSD);

        token.mint(address(bank), 100 * AUSD);
        _start();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.WrongStatus.selector, IRunBank.Status.Ready, IRunBank.Status.Running));
        bank.rescue(address(token), owner, 1);
    }

    function test_Street_OnlyBankCanSweep() public {
        vm.prank(rando);
        vm.expectRevert(Street.NotBank.selector);
        street.sweep();
        assertEq(street.bank(), address(bank));
        assertEq(address(street.ausd()), address(token));
    }

    function test_SealTicks_OperatorOnly() public {
        _start();
        vm.prank(rando);
        vm.expectRevert(IRunBank.NotOperator.selector);
        bank.sealTicks(1, _one(_range(0, 1)));
        vm.prank(rando);
        vm.expectRevert(IRunBank.NotOperator.selector);
        bank.reset();
    }
}

contract TickMathTest is Base {
    event TickSealed(uint32 indexed runId, uint32 tick, uint16[] requested, IRunBank.TickSummary summary);

    function setUp() public {
        _setUpBank();
        _start();
    }

    function test_CashFirst_NoHaircut_NoBondSales() public {
        (uint32 last, IRunBank.Status st) = _seal(1, _range(0, 5)); // 5 whales = 950 AUSD < 1,500 cash
        assertEq(last, 1);
        assertEq(uint8(st), uint8(IRunBank.Status.Running));
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.cash, 550 * AUSD);
        assertEq(s.bonds, 8500 * AUSD);
        assertEq(s.depositsOwed, 8550 * AUSD);
        assertEq(s.cumulativeLoss, 0);
        assertEq(s.lastHaircutBps, 0);
        assertEq(s.withdrawnCount, 5);
        assertEq(s.streetHeld, 950 * AUSD);
        assertEq(s.ausdHeld, 9050 * AUSD);
        assertEq(bank.withdrawnBitmap()[0], 31);
    }

    function test_TickSealed_EventCarriesRequestedAndSummary() public {
        uint16[] memory req = _range(0, 5);
        IRunBank.TickSummary memory sum = IRunBank.TickSummary({
            served: 5,
            skipped: 0,
            haircutBps: 0,
            queueLengthAfter: 0,
            paid: uint64(950 * AUSD),
            bondsSold: 0,
            fireSaleLoss: 0,
            cashAfter: uint64(550 * AUSD),
            bondsAfter: uint64(8500 * AUSD),
            depositsOwedAfter: uint64(8550 * AUSD)
        });
        vm.expectEmit(true, false, false, true);
        emit TickSealed(1, 1, req, sum);
        _seal(1, req);
    }

    /// PRD 9.5: tick 1 serves 2,000 AUSD (haircut 552 bps), tick 2 serves 3,000 AUSD from bonds (haircut 2,317 bps) and fails the bank.
    /// Expected values from an independent Python reference of PRD 9.4.
    function test_PRD95_WorkedExample_ExactBaseUnits() public {
        uint16[] memory t1 = _cat(_range(0, 10), _range(25, 35)); // 10 whales + 10 small = 2,000 AUSD
        (, IRunBank.Status st) = _seal(1, t1);
        assertEq(uint8(st), uint8(IRunBank.Status.Running));
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.lastHaircutBps, 552);
        assertEq(s.cash, 0);
        assertEq(s.bonds, 7_970_787_462);
        assertEq(s.cumulativeLoss, 29_212_538);
        assertEq(s.depositsOwed, 7_500 * AUSD);
        assertEq(s.streetHeld, 2_000 * AUSD + 29_212_538);

        uint16[] memory t2 = _cat(_range(10, 25), _range(35, 50)); // 15 whales + 15 small = 3,000 AUSD
        vm.expectEmit(true, false, false, true);
        emit IRunBank.BankFailed(1, 2, 450, uint64(4_500 * AUSD), uint64(4_500 * AUSD));
        (, st) = _seal(2, t2);
        assertEq(uint8(st), uint8(IRunBank.Status.Failed));
        s = bank.snapshot();
        assertEq(s.lastHaircutBps, 2317);
        assertEq(s.bonds, 4_066_062_717);
        assertEq(s.cash, 0);
        assertEq(s.cumulativeLoss, 29_212_538 + 904_724_745);
        assertEq(s.depositsOwed, 4_500 * AUSD);
        assertEq(s.withdrawnCount, 50);
        assertEq(s.tick, 2);
        // conservation: bank + street == funded
        assertEq(s.ausdHeld + s.streetHeld, 10_000 * AUSD);
        assertEq(s.ausdHeld, s.cash + s.bonds);
    }

    function test_FailureMidServe_TrapsTheRest() public {
        // everyone asks in tick 1: bonds run out partway through the serve list
        vm.expectEmit(true, false, false, true);
        emit IRunBank.BankFailed(1, 1, 447, uint64(4_470 * AUSD), uint64(4_470 * AUSD));
        (, IRunBank.Status st) = _seal(1, _range(0, 500));
        assertEq(uint8(st), uint8(IRunBank.Status.Failed));
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.lastHaircutBps, 5847);
        assertEq(s.withdrawnCount, 53);
        assertEq(s.depositsOwed, 4_470 * AUSD);
        assertEq(s.bonds, 120_367);
        assertEq(s.cumulativeLoss, 4_969_879_633);
        assertEq(s.streetHeld, 5_030 * AUSD + 4_969_879_633);
        assertEq(s.ausdHeld + s.streetHeld, 10_000 * AUSD);
    }

    function test_StaysSolventWhileLossesAreBelowEquity() public {
        // Equity is 500 AUSD. Serve 1,600 AUSD (cash 1,500, 100 from bonds): the loss is far below equity.
        _seal(1, _cat(_range(0, 8), _range(25, 29))); // 8*190 + 4*10 = 1,560
        assertEq(uint8(bank.snapshot().status), uint8(IRunBank.Status.Running));
        IRunBank.Snapshot memory s = bank.snapshot();
        assertLt(s.cumulativeLoss, 500 * AUSD);
        assertGe(uint256(s.cash) + s.bonds, s.depositsOwed, "still solvent");
    }

    function test_Revert_TickMismatch() public {
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.TickMismatch.selector, uint32(1), uint32(2)));
        bank.sealTicks(2, _one(_range(0, 1)));
        _seal(1, _range(0, 1));
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.TickMismatch.selector, uint32(2), uint32(1)));
        bank.sealTicks(1, _one(_range(1, 2)));
    }

    function test_Revert_NotAscending_AndBadDepositor() public {
        uint16[] memory dup = new uint16[](2);
        dup[0] = 5;
        dup[1] = 5;
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.NotAscending.selector, uint16(5)));
        bank.sealTicks(1, _one(dup));

        uint16[] memory desc = new uint16[](2);
        desc[0] = 9;
        desc[1] = 3;
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.NotAscending.selector, uint16(3)));
        bank.sealTicks(1, _one(desc));

        uint16[] memory bad = new uint16[](1);
        bad[0] = 500;
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.BadDepositor.selector, uint16(500)));
        bank.sealTicks(1, _one(bad));
    }

    function test_BadTickInBatch_RevertsWholeBatch() public {
        uint16[][] memory batch = new uint16[][](2);
        batch[0] = _range(0, 3);
        batch[1] = new uint16[](2);
        batch[1][0] = 8;
        batch[1][1] = 8;
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.NotAscending.selector, uint16(8)));
        bank.sealTicks(1, batch);
        assertEq(bank.snapshot().tick, 0);
        assertEq(bank.snapshot().withdrawnCount, 0);
    }

    function test_AlreadyWithdrawn_IsSkipped() public {
        _seal(1, _range(0, 3));
        uint256 streetBefore = token.balanceOf(address(street));
        vm.recordLogs();
        _seal(2, _range(1, 5)); // 1 and 2 are already out; 3 and 4 are new
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (, , IRunBank.TickSummary memory sum) = abi.decode(logs[0].data, (uint32, uint16[], IRunBank.TickSummary));
        assertEq(sum.skipped, 2);
        assertEq(sum.served, 2);
        assertEq(token.balanceOf(address(street)) - streetBefore, 380 * AUSD);
        assertEq(bank.snapshot().withdrawnCount, 5);
    }

    function test_BatchOfTicks_EqualsSingleTicks_AndStopsWhenStatusLeavesRunning() public {
        uint16[][] memory batch = new uint16[][](3);
        batch[0] = _cat(_range(0, 10), _range(25, 35));
        batch[1] = _cat(_range(10, 25), _range(35, 50)); // fails the bank (PRD 9.5)
        batch[2] = _range(50, 60); // must be ignored
        vm.prank(op);
        (uint32 last, IRunBank.Status st) = bank.sealTicks(1, batch);
        assertEq(last, 2);
        assertEq(uint8(st), uint8(IRunBank.Status.Failed));
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.tick, 2);
        assertEq(s.withdrawnCount, 50);
        assertEq(s.depositsOwed, 4_500 * AUSD);
        assertEq(s.bonds, 4_066_062_717);
        // one transfer carried both ticks
        assertEq(s.streetHeld, 5_000 * AUSD + 29_212_538 + 904_724_745);
    }

    function test_AfterFailure_FurtherTicksRejected() public {
        _seal(1, _range(0, 500));
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.WrongStatus.selector, IRunBank.Status.Running, IRunBank.Status.Failed));
        bank.sealTicks(2, _one(_range(0, 1)));
    }

    function test_EmptyTick_CountsAsQuiet_AndBatchOfNothingIsANoop() public {
        vm.prank(op);
        (uint32 last, IRunBank.Status st) = bank.sealTicks(1, new uint16[][](0));
        assertEq(last, 0);
        assertEq(uint8(st), uint8(IRunBank.Status.Running));
        _seal(1, new uint16[](0));
        assertEq(bank.snapshot().quietCount, 1);
        assertEq(bank.snapshot().tick, 1);
    }

    function test_Survives_AfterQuietTicks() public {
        _seal(1, _range(0, 2)); // some activity first
        for (uint32 t = 2; t <= 8; ++t) {
            (, IRunBank.Status st) = _seal(t, new uint16[](0));
            assertEq(uint8(st), uint8(IRunBank.Status.Running), "not yet");
        }
        assertEq(bank.snapshot().quietCount, 7);
        vm.expectEmit(true, false, false, true);
        emit IRunBank.BankSurvived(1, 9);
        (, IRunBank.Status s2) = _seal(9, new uint16[](0));
        assertEq(uint8(s2), uint8(IRunBank.Status.Survived));
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(IRunBank.WrongStatus.selector, IRunBank.Status.Running, IRunBank.Status.Survived));
        bank.sealTicks(10, _one(new uint16[](0)));
    }

    function test_NewRequest_ResetsQuietCount() public {
        _seal(1, new uint16[](0));
        _seal(2, new uint16[](0));
        assertEq(bank.snapshot().quietCount, 2);
        _seal(3, _range(0, 1));
        assertEq(bank.snapshot().quietCount, 0);
        // a tick whose only requests are skipped still counts as quiet (newCount == 0)
        _seal(4, _range(0, 1));
        assertEq(bank.snapshot().quietCount, 1);
    }
}

contract SpeedBumpAndInsuranceTest is Base {
    function setUp() public {
        _setUpBank();
        vm.prank(op);
        bank.setLevel(1, _config(1)); // Monad Mutual: 3% per tick (285 AUSD), insured 50 AUSD
        _start();
    }

    function _q(uint16 a, uint16 b) internal view returns (uint16[] memory) {
        return bank.queueSlice(a, b);
    }

    function test_CapPerTick_WithOvershoot_AndFifo() public {
        // five whales ask at once (950 AUSD). cap = 285: serve 190 (<285), then 190 more (380, overshoot), stop.
        (, IRunBank.Status st) = _seal(1, _range(3, 8));
        assertEq(uint8(st), uint8(IRunBank.Status.Running));
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.withdrawnCount, 2);
        assertEq(s.queueLength, 3);
        assertEq(s.streetHeld, 380 * AUSD);
        uint16[] memory q = _q(0, 3);
        assertEq(q.length, 3);
        assertEq(q[0], 5);
        assertEq(q[1], 6);
        assertEq(q[2], 7);
        assertEq(bank.withdrawnBitmap()[0], (uint256(1) << 3) | (uint256(1) << 4));

        // a newcomer joins the back of the queue
        _seal(2, _range(0, 1));
        q = _q(0, 10);
        assertEq(q.length, 2, "clipped to length");
        assertEq(q[0], 7);
        assertEq(q[1], 0);
        // served 5, 6 this tick
        assertEq(bank.snapshot().withdrawnCount, 4);
    }

    function test_QueuedIdsAreSkippedWhenRequestedAgain() public {
        _seal(1, _range(3, 8));
        vm.recordLogs();
        _seal(2, _range(5, 9)); // 5, 6, 7 are still queued or just got served; 8 is new
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (, , IRunBank.TickSummary memory sum) = abi.decode(logs[0].data, (uint32, uint16[], IRunBank.TickSummary));
        assertEq(sum.skipped, 3);
        assertEq(sum.queueLengthAfter, 2); // queue was [5,6,7] + 8 = 4, two served
    }

    function test_QueueDrainsOverTicks_ThenQuietTicksSurvive() public {
        _seal(1, _range(0, 10)); // 1,900 AUSD demand; ~285 per tick (2 whales per tick)
        uint32 t = 2;
        while (bank.snapshot().queueLength > 0) {
            _seal(t, new uint16[](0));
            ++t;
            assertLt(t, 30);
        }
        uint32 drainTick = t - 1;
        assertEq(bank.snapshot().withdrawnCount, 10);
        assertEq(uint8(bank.snapshot().status), uint8(IRunBank.Status.Running), "just drained: not quiet long enough");
        IRunBank.Status st = IRunBank.Status.Running;
        while (st == IRunBank.Status.Running && t < 60) {
            (, st) = _seal(t++, new uint16[](0));
        }
        assertEq(uint8(st), uint8(IRunBank.Status.Survived));
        // the tick that emptied the queue is the first quiet tick; survival at the 8th
        assertEq(bank.snapshot().tick, drainTick + 7);
    }

    function test_Insurance_ReducesInsuredOwedByMinBalanceCap() public {
        IRunBank.Snapshot memory s0 = bank.snapshot();
        assertEq(s0.insuredOwed, 6_000 * AUSD);
        _seal(1, _range(0, 1)); // whale 190: insured part 50
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.insuredOwed, 5_950 * AUSD);
        assertEq(s.depositsOwed, 9_310 * AUSD);
        _seal(2, _range(25, 26)); // small 10: fully insured
        s = bank.snapshot();
        assertEq(s.insuredOwed, 5_940 * AUSD);
    }

    function test_MonadMutual_SurvivesSmallRun_ZeroTrapped() public {
        // whales trickle out; speed bump keeps the haircut low; no failure
        uint16[] memory req = _range(0, 25);
        _seal(1, req);
        uint32 t = 2;
        IRunBank.Status st = IRunBank.Status.Running;
        while (st == IRunBank.Status.Running && t < 100) {
            (, st) = _seal(t++, new uint16[](0));
        }
        assertEq(uint8(st), uint8(IRunBank.Status.Survived));
        IRunBank.Snapshot memory s = bank.snapshot();
        assertEq(s.withdrawnCount, 25);
        assertLe(s.cumulativeLoss, 400 * AUSD, "80% of equity");
    }

    function test_FailureReportsTrappedAndUninsuredSplit() public {
        vm.prank(op);
        bank.reset();
        IRunBank.Config memory c = _config(1);
        c.cash0 = uint64(100 * AUSD);
        c.bonds0 = uint64(400 * AUSD);
        c.speedBumpBps = 0;
        vm.prank(op);
        bank.setLevel(1, c);
        // the ledger owes 9,500 AUSD but the bank holds 500: the first whale already can't be funded
        _start();
        vm.expectEmit(true, false, false, true);
        emit IRunBank.BankFailed(2, 1, 500, uint64(9_500 * AUSD), uint64(3_500 * AUSD)); // insured: 25*50 + 475*10 = 6,000
        (, IRunBank.Status st) = _seal(1, _range(0, 5));
        assertEq(uint8(st), uint8(IRunBank.Status.Failed));
        assertEq(bank.snapshot().withdrawnCount, 0);
    }
}
