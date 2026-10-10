// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IRunBank} from "./IRunBank.sol";
import {Street} from "./Street.sol";

/// @title RunBank
/// @notice The onchain bank behind RUN!. A 500-entry deposit ledger, a cash + bonds balance sheet,
///         optional speed bump (FIFO queue) and deposit insurance. Depositor *decisions* are made offchain;
///         the contract pays, prices the fire sale, and decides when the bank fails or survives.
///         Bank maths: docs/PRD.md section 9 (integer maths only, BPS = 10_000).
/// @dev Storage is packed for Monad, where a cold SLOAD costs 8,100 gas:
///      core (4 x uint64) | meta (counters, status) | info (deposits0, startBlock, ...) | cfg (2 slots)
///      | ledger (8 x uint32 per word) | bitmaps (2 words each) | queue ring (16 x uint16 per word).
contract RunBank is IRunBank, Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // ─────────────────────────────── constants ───────────────────────────────
    uint256 internal constant BPS = 10_000;
    uint256 internal constant MAX_IDS = 512;
    uint256 internal constant N_CARDS = 4;

    // ─────────────────────────────── storage ────────────────────────────────
    struct Core {
        uint64 cash;
        uint64 bonds;
        uint64 depositsOwed;
        uint64 insuredOwed;
    }

    struct Meta {
        uint32 tick;
        uint32 runId;
        uint64 cumulativeLoss;
        uint16 lastHaircutBps;
        uint16 quietCount;
        uint16 withdrawnCount;
        uint16 head;
        uint16 tail;
        Status status;
        uint8 level;
    }

    struct Info {
        uint64 deposits0;
        uint64 startBlock;
        uint64 insuredOwed0; // sum of min(balance, insuredCap) for the loaded ledger and current config
        uint16 count; // number of depositors in the ledger (0 = not loaded)
    }

    IERC20 internal immutable _ausd;
    Street internal immutable _street;

    Core internal core;
    Meta internal meta;
    Info internal info;
    Config internal cfg;
    bytes32 internal ledgerHash;
    bytes32 internal configHash;

    uint256[64] internal ledger; // id i lives in word i >> 3, bits 32 * (i & 7) .. +31
    uint256[2] internal withdrawnBits;
    uint256[2] internal queuedBits;
    uint256[32] internal queueBuf; // ring buffer of 512 uint16 ids, 16 per word

    mapping(address => bool) internal _operators;

    // ─────────────────────────────── modifiers ──────────────────────────────
    modifier onlyOperator() {
        if (!_operators[msg.sender]) revert NotOperator();
        _;
    }

    modifier inStatus(Status expected) {
        Status actual = meta.status;
        if (actual != expected) revert WrongStatus(expected, actual);
        _;
    }

    // ───────────────────────────── construction ─────────────────────────────
    constructor(IERC20 ausd_, address operator_) Ownable(msg.sender) {
        if (address(ausd_) == address(0) || operator_ == address(0)) revert BadConfig();
        _ausd = ausd_;
        _street = new Street(ausd_);
        _operators[operator_] = true;
    }

    // ─────────────────────────────── owner ──────────────────────────────────
    /// @inheritdoc IRunBank
    function loadLedger(uint256[] calldata packed, uint16 count) external onlyOwner inStatus(Status.Ready) {
        if (count == 0 || count > MAX_IDS || packed.length != (uint256(count) + 7) / 8) revert BadConfig();

        uint256 total;
        for (uint256 w; w < packed.length; ++w) {
            uint256 word = packed[w];
            ledger[w] = word;
            for (uint256 lane; lane < 8; ++lane) {
                uint256 v = (word >> (32 * lane)) & 0xffffffff;
                if (w * 8 + lane < count) total += v;
                else if (v != 0) revert BadConfig(); // nothing hidden beyond `count`
            }
        }
        bytes32 h = keccak256(abi.encodePacked(packed));
        ledgerHash = h;
        info.deposits0 = uint64(total);
        info.count = count;
        info.insuredOwed0 = _insuredTotal(cfg.insuredCap, count);
        _restore();
        emit LedgerLoaded(h, count, uint64(total));
    }

    /// @inheritdoc IRunBank
    function setOperator(address who, bool allowed) external onlyOwner {
        if (who == address(0)) revert BadConfig();
        _operators[who] = allowed;
    }

    /// @inheritdoc IRunBank
    function rescue(address token, address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
        inStatus(Status.Ready)
    {
        if (to == address(0)) revert BadConfig();
        IERC20(token).safeTransfer(to, amount);
    }

    // ─────────────────────────────── operator ───────────────────────────────
    /// @inheritdoc IRunBank
    function setLevel(uint8 level, Config calldata c) external onlyOperator inStatus(Status.Ready) {
        if (c.haircutMaxBps >= BPS || c.bonds0 == 0 || c.quietTicks == 0 || c.speedBumpBps > BPS) revert BadConfig();
        cfg = c;
        bytes32 h = keccak256(abi.encode(c));
        configHash = h;
        meta.level = level;
        info.insuredOwed0 = _insuredTotal(c.insuredCap, info.count);
        _restore();
        emit LevelSet(level, h, c);
    }

    /// @inheritdoc IRunBank
    function startRumor(uint8 card, uint16 seedNode, uint64 modelSeed, bytes32 modelHash)
        external
        onlyOperator
        inStatus(Status.Ready)
    {
        Info memory inf = info;
        if (inf.count == 0) revert LedgerNotLoaded();
        Config memory k = cfg;
        if (k.bonds0 == 0 || card >= N_CARDS) revert BadConfig();
        if (seedNode >= inf.count) revert BadDepositor(seedNode);
        uint256 need = uint256(k.cash0) + k.bonds0;
        uint256 have = _ausd.balanceOf(address(this));
        if (have < need) revert Underfunded(need, have);

        Meta memory m = meta;
        m.runId += 1;
        m.status = Status.Running;
        meta = m;
        uint64 sb = uint64(block.number);
        info.startBlock = sb;
        emit RumorStarted(m.runId, m.level, card, seedNode, modelSeed, modelHash, sb);
    }

    /// @inheritdoc IRunBank
    function sealTicks(uint32 firstTick, uint16[][] calldata ticks)
        external
        onlyOperator
        nonReentrant
        returns (uint32 lastTick, Status status)
    {
        Meta memory m = meta;
        if (m.status != Status.Running) revert WrongStatus(Status.Running, m.status);
        if (firstTick != m.tick + 1) revert TickMismatch(m.tick + 1, firstTick);

        Core memory c = core;
        Config memory k = cfg;
        Info memory inf = info;
        uint256[2] memory wd = withdrawnBits;
        uint256[2] memory qd = queuedBits;

        uint256 outflow;
        for (uint256 i; i < ticks.length; ++i) {
            if (m.status != Status.Running) break;
            outflow += _applyTick(m, c, k, inf, wd, qd, ticks[i]);
        }

        // effects
        core = c;
        meta = m;
        withdrawnBits = wd;
        if (k.speedBumpBps != 0) queuedBits = qd;

        // interaction: one AUSD transfer per transaction
        if (outflow != 0) _ausd.safeTransfer(address(_street), outflow);
        return (m.tick, m.status);
    }

    /// @inheritdoc IRunBank
    function reset() external onlyOperator nonReentrant {
        Meta memory m = meta;
        if (m.status == Status.Ready) revert WrongStatus(Status.Running, Status.Ready);
        _street.sweep();
        withdrawnBits = [uint256(0), 0];
        queuedBits = [uint256(0), 0];
        _restore();
        emit BankReset(m.runId);
    }

    /// @inheritdoc IRunBank
    function ping() external onlyOperator {
        emit Ping(msg.sender, uint64(block.number));
    }

    // ─────────────────────────────── views ──────────────────────────────────
    /// @inheritdoc IRunBank
    function snapshot() external view returns (Snapshot memory s) {
        Core memory c = core;
        Meta memory m = meta;
        Info memory inf = info;
        s.status = m.status;
        s.level = m.level;
        s.runId = m.runId;
        s.tick = m.tick;
        s.cash = c.cash;
        s.bonds = c.bonds;
        s.depositsOwed = c.depositsOwed;
        s.insuredOwed = c.insuredOwed;
        s.deposits0 = inf.deposits0;
        s.cumulativeLoss = m.cumulativeLoss;
        s.lastHaircutBps = m.lastHaircutBps;
        s.queueLength = m.tail - m.head;
        s.quietCount = m.quietCount;
        s.withdrawnCount = m.withdrawnCount;
        s.startBlock = inf.startBlock;
        s.ausdHeld = _ausd.balanceOf(address(this));
        s.streetHeld = _ausd.balanceOf(address(_street));
        s.ledgerHash = ledgerHash;
        s.configHash = configHash;
    }

    /// @inheritdoc IRunBank
    function depositorBalance(uint16 id) external view returns (uint64) {
        if (id >= info.count) return 0;
        return uint64(_bal(id));
    }

    /// @inheritdoc IRunBank
    function withdrawnBitmap() external view returns (uint256[2] memory) {
        return withdrawnBits;
    }

    /// @notice Queued ids, front of the queue first. `from`/`to` are positions counted from the front
    ///         (half-open `[from, to)`), clipped to the current queue length.
    function queueSlice(uint16 from, uint16 to) external view returns (uint16[] memory out) {
        Meta memory m = meta;
        uint256 len = m.tail - m.head;
        if (to > len) to = uint16(len);
        if (from >= to) return new uint16[](0);
        out = new uint16[](to - from);
        for (uint256 i = from; i < to; ++i) {
            uint256 pos = (uint256(m.head) + i) & (MAX_IDS - 1);
            out[i - from] = uint16(queueBuf[pos >> 4] >> ((pos & 15) * 16));
        }
    }

    /// @inheritdoc IRunBank
    function isOperator(address who) external view returns (bool) {
        return _operators[who];
    }

    /// @inheritdoc IRunBank
    function ausd() external view returns (address) {
        return address(_ausd);
    }

    /// @inheritdoc IRunBank
    function street() external view returns (address) {
        return address(_street);
    }

    // ───────────────────────────── bank maths ───────────────────────────────
    /// @dev One tick, PRD section 9.4. Mutates the in-memory state; the caller persists it.
    /// @return outflow AUSD that leaves the bank this tick (paid + fire-sale loss)
    function _applyTick(
        Meta memory m,
        Core memory c,
        Config memory k,
        Info memory inf,
        uint256[2] memory wd,
        uint256[2] memory qd,
        uint16[] calldata req
    ) internal returns (uint256 outflow) {
        m.tick += 1;
        TickSummary memory s;

        // 1. intake: queue the new requests (speed bump) or serve them directly
        uint16[] memory serve = new uint16[](req.length + (m.tail - m.head));
        uint256 sc;
        uint256 newCount;
        {
            uint256 prev;
            for (uint256 i; i < req.length; ++i) {
                uint16 id = req[i];
                if (id >= inf.count) revert BadDepositor(id);
                if (i != 0 && id <= prev) revert NotAscending(id);
                prev = id;
                uint256 w = id >> 8;
                uint256 bit = uint256(1) << (id & 255);
                if ((wd[w] & bit) != 0 || (qd[w] & bit) != 0) {
                    ++s.skipped;
                    continue;
                }
                ++newCount;
                if (k.speedBumpBps == 0) {
                    serve[sc++] = id;
                } else {
                    _qPush(m, id);
                    qd[w] |= bit;
                }
            }
        }

        // 2. speed bump: drain the queue up to the per-tick cap (the last one served may overshoot)
        if (k.speedBumpBps != 0) {
            uint256 cap = uint256(inf.deposits0) * k.speedBumpBps / BPS;
            uint256 used;
            while (m.head != m.tail && used < cap) {
                uint16 id = _qPop(m);
                qd[id >> 8] &= ~(uint256(1) << (id & 255));
                serve[sc++] = id;
                used += _bal(id);
            }
        }

        // 3. demand, shortfall, haircut
        uint256[] memory amt = new uint256[](sc);
        uint256 demand;
        for (uint256 j; j < sc; ++j) {
            uint256 b = _bal(serve[j]);
            amt[j] = b;
            demand += b;
        }
        uint256 haircutBps;
        if (demand > c.cash) {
            uint256 shortfall = demand - c.cash;
            haircutBps = uint256(k.haircutBaseBps) + uint256(k.haircutSlopeBps) * shortfall / k.bonds0;
            if (haircutBps > k.haircutMaxBps) haircutBps = k.haircutMaxBps;
        }

        // 4. pay in order: cash first, then sell bonds at the haircut; stop at the first one we can't fund
        uint256 paid;
        uint256 bondsSold;
        uint256 loss;
        bool failedNow;
        for (uint256 j; j < sc; ++j) {
            uint256 b = amt[j];
            if (c.cash >= b) {
                c.cash -= uint64(b);
            } else {
                uint256 need = b - c.cash;
                uint256 sell = (need * BPS + (BPS - haircutBps) - 1) / (BPS - haircutBps); // ceilDiv
                if (sell > c.bonds) {
                    failedNow = true;
                    break;
                }
                c.bonds -= uint64(sell);
                bondsSold += sell;
                loss += sell - need;
                c.cash = 0;
            }
            uint16 id = serve[j];
            wd[id >> 8] |= uint256(1) << (id & 255);
            ++m.withdrawnCount;
            paid += b;
            c.depositsOwed -= uint64(b);
            c.insuredOwed -= uint64(b < k.insuredCap ? b : k.insuredCap);
        }

        m.cumulativeLoss += uint64(loss);
        m.lastHaircutBps = uint16(haircutBps);
        outflow = paid + loss;

        // 5. verdict
        if (failedNow || uint256(c.cash) + c.bonds < c.depositsOwed) {
            m.status = Status.Failed;
        } else if (newCount == 0 && m.head == m.tail) {
            if (++m.quietCount >= k.quietTicks) m.status = Status.Survived;
        } else {
            m.quietCount = 0;
        }

        s.served = uint16(sc);
        s.haircutBps = uint16(haircutBps);
        s.queueLengthAfter = m.tail - m.head;
        s.paid = uint64(paid);
        s.bondsSold = uint64(bondsSold);
        s.fireSaleLoss = uint64(loss);
        s.cashAfter = c.cash;
        s.bondsAfter = c.bonds;
        s.depositsOwedAfter = c.depositsOwed;
        emit TickSealed(m.runId, m.tick, req, s);

        if (m.status == Status.Failed) {
            emit BankFailed(m.runId, m.tick, inf.count - m.withdrawnCount, c.depositsOwed, c.depositsOwed - c.insuredOwed);
        } else if (m.status == Status.Survived) {
            emit BankSurvived(m.runId, m.tick);
        }
    }

    /// @dev Balance of depositor `id` in AUSD base units.
    function _bal(uint256 id) internal view returns (uint256) {
        return (ledger[id >> 3] >> ((id & 7) * 32)) & 0xffffffff;
    }

    function _qPush(Meta memory m, uint16 id) internal {
        uint256 pos = uint256(m.tail) & (MAX_IDS - 1);
        uint256 sh = (pos & 15) * 16;
        uint256 v = queueBuf[pos >> 4];
        queueBuf[pos >> 4] = (v & ~(uint256(0xffff) << sh)) | (uint256(id) << sh);
        ++m.tail;
    }

    function _qPop(Meta memory m) internal view returns (uint16 id) {
        uint256 pos = uint256(m.head) & (MAX_IDS - 1);
        id = uint16(queueBuf[pos >> 4] >> ((pos & 15) * 16));
        ++m.head;
    }

    /// @dev Sum over the ledger of min(balance, cap). The only full-ledger loop (setLevel / loadLedger).
    function _insuredTotal(uint64 cap, uint16 count) internal view returns (uint64) {
        if (cap == 0 || count == 0) return 0;
        uint256 total;
        uint256 words = (uint256(count) + 7) / 8;
        for (uint256 w; w < words; ++w) {
            uint256 word = ledger[w];
            for (uint256 lane; lane < 8; ++lane) {
                if (w * 8 + lane >= count) break;
                uint256 v = (word >> (32 * lane)) & 0xffffffff;
                total += v < cap ? v : cap;
            }
        }
        return uint64(total);
    }

    /// @dev Restore the balance sheet and counters for the current config (PRD 9.4 `reset`). Never touches the ledger.
    function _restore() internal {
        Config memory k = cfg;
        Info memory inf = info;
        core = Core({cash: k.cash0, bonds: k.bonds0, depositsOwed: inf.deposits0, insuredOwed: inf.insuredOwed0});
        Meta memory m = meta;
        m.tick = 0;
        m.cumulativeLoss = 0;
        m.lastHaircutBps = 0;
        m.quietCount = 0;
        m.withdrawnCount = 0;
        m.head = 0;
        m.tail = 0;
        m.status = Status.Ready;
        meta = m;
    }
}
