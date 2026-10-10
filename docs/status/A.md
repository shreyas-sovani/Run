# Agent A status (Contracts)

## T+0:40 update

**ABI exported** — `app/src/chain/abi/{runBank,street,erc20,faucet,index}.ts` (regenerate with `contracts/script/export-abi.sh`). Matches PRD §11.2 exactly: all 8 events, all 8 custom errors, all functions. Extra ABI entries from OpenZeppelin (`owner`, `transferOwnership`, `renounceOwnership`, `OwnershipTransferred`, `Ownable*` errors, `ReentrancyGuardReentrantCall`, `SafeERC20FailedOperation`) are additive.

### Done
- A-00 Foundry project (solc 0.8.28, via_ir, cancun, OZ 5.7 in `contracts/lib`, remappings, `.env.example`, `contracts/.gitignore`).
- A-01 `IRunBank.sol` (copied from PRD), `Street.sol`, `export-abi.sh`.
- A-02..A-05 `RunBank.sol` written in full (ledger, config, lifecycle, `sealTicks` per PRD §9.4). Compiles. Tests next.

### Next
- Tests (A-06), golden vectors (A-07), deploy/fund (A-08), verify (A-09).

### Interface notes (for C / F / B)
- `queueSlice(from, to)`: positions counted from the front of the queue, half-open `[from, to)`, clipped to the current length.
- `reset()` from `Ready` reverts `WrongStatus(Running, Ready)`.
- `sealTicks` checks status first (`WrongStatus`), then `TickMismatch`. After a run ends, a re-sent batch gets `WrongStatus`, not `TickMismatch`.
- `sealTicks` stops silently once the status leaves `Running`; remaining ticks in the batch are ignored (no revert, no events). Returned `lastTick` is the last tick actually applied.
- `served` in `TickSummary` = length of the PRD `serve` list (includes ids trapped at the failure tick).
- `depositorBalance(id)` returns 0 for `id >= count`.
- `setLevel` and `loadLedger` both restore the balance sheet (status stays `Ready`), so `insuredOwed` is always consistent whichever is called last.
- AUSD moves with one `transfer` to `Street` per `sealTicks` transaction (sum over ticks); events stay per tick.

### Blocked by
- Nothing yet. `app/src/engine/data/*.json` from B: checking.
