// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Frozen interface of the RUN! bank (PRD §11.2). Do not rename, reorder or retype.
interface IRunBank {
    enum Status { Ready, Running, Failed, Survived }

    struct Config {
        uint64 cash0; uint64 bonds0;
        uint16 speedBumpBps; uint64 insuredCap;
        uint16 haircutBaseBps; uint16 haircutSlopeBps; uint16 haircutMaxBps;
        uint16 quietTicks;
    }

    struct TickSummary {
        uint16 served; uint16 skipped; uint16 haircutBps; uint16 queueLengthAfter;
        uint64 paid; uint64 bondsSold; uint64 fireSaleLoss;
        uint64 cashAfter; uint64 bondsAfter; uint64 depositsOwedAfter;
    }

    struct Snapshot {
        Status status; uint8 level; uint32 runId; uint32 tick;
        uint64 cash; uint64 bonds; uint64 depositsOwed; uint64 insuredOwed; uint64 deposits0;
        uint64 cumulativeLoss; uint16 lastHaircutBps; uint16 queueLength; uint16 quietCount; uint16 withdrawnCount;
        uint64 startBlock; uint256 ausdHeld; uint256 streetHeld; bytes32 ledgerHash; bytes32 configHash;
    }

    error NotOperator();
    error WrongStatus(Status expected, Status actual);
    error TickMismatch(uint32 expected, uint32 got);
    error BadDepositor(uint16 id);
    error NotAscending(uint16 id);
    error Underfunded(uint256 need, uint256 have);
    error LedgerNotLoaded();
    error BadConfig();

    event LedgerLoaded(bytes32 ledgerHash, uint16 count, uint64 deposits0);
    event LevelSet(uint8 indexed level, bytes32 configHash, Config config);
    event RumorStarted(uint32 indexed runId, uint8 level, uint8 card, uint16 seedNode, uint64 modelSeed, bytes32 modelHash, uint64 startBlock);
    event TickSealed(uint32 indexed runId, uint32 tick, uint16[] requested, TickSummary summary);
    event BankFailed(uint32 indexed runId, uint32 tick, uint16 trappedCount, uint64 trappedAmount, uint64 uninsuredTrapped);
    event BankSurvived(uint32 indexed runId, uint32 tick);
    event BankReset(uint32 indexed runId);
    event Ping(address indexed operator, uint64 blockNumber);

    // operator (primary or backup)
    function setLevel(uint8 level, Config calldata cfg) external;                  // Ready only
    function startRumor(uint8 card, uint16 seedNode, uint64 modelSeed, bytes32 modelHash) external; // Ready only
    function sealTicks(uint32 firstTick, uint16[][] calldata ticks) external returns (uint32 lastTick, Status status); // Running only
    function reset() external;                                                     // any status except Ready
    function ping() external;

    // owner
    function loadLedger(uint256[] calldata packed, uint16 count) external;         // Ready only; count <= 512
    function setOperator(address who, bool allowed) external;
    function rescue(address token, address to, uint256 amount) external;           // Ready only

    // views
    function snapshot() external view returns (Snapshot memory);
    function depositorBalance(uint16 id) external view returns (uint64);
    function withdrawnBitmap() external view returns (uint256[2] memory);
    function queueSlice(uint16 from, uint16 to) external view returns (uint16[] memory);
    function isOperator(address who) external view returns (bool);
    function ausd() external view returns (address);
    function street() external view returns (address);
}
