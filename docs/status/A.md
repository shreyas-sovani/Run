# Agent A status (Contracts)

## Checkpoint: all P0, P1 and P2 done

**Testnet bank is live, verified, funded, and at level 0 / Ready** (chain 10143). Addresses in `app/src/config/deployment.testnet.json`:

| | |
|---|---|
| RunBank | `0x2cD82EE2b3C19E996Fa9da80052e912A2E90F41D` |
| Street | `0x7998f16710Ab81AD2D68d7C0B7F0fd296CC7927D` |
| AUSD | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` |
| deployBlock | 69764586 |

Last check: status Ready, level 0, `ledgerHash` = B's v1 `0x8f53…4036`, `configHash` = level 0, AUSD held 10,000, Street 0, backup operator set.

### Done
- **A-00..A-05** Foundry project, frozen `IRunBank`, `RunBank`, `Street`. ABI exported (`app/src/chain/abi/*`, regenerate with `contracts/script/export-abi.sh`).
- **A-06** `forge test`: 52 tests, all green: unit (ledger, config, lifecycle, tick maths, speed bump, insurance, PRD §9.5 worked example), invariants (AUSD conserved; `depositsOwed == Σ unwithdrawn`; `cash+bonds+loss+paid == cash0+bonds0`; Street holds `paid+loss`; both levels, 64 runs × 40 depth), and a Monad testnet fork test with the real AUSD (Bhau's fails, reset, Monad Mutual survives). The fork test skips itself when `MONAD_RPC_URL` is unset.
- **A-07** `test/BankVectors.t.sol` replays all 8 of B's golden-vector scenarios, asserting every post-tick field (snapshot and `TickSealed` summary), once tick by tick and once batched. **All pass.** Re-run `forge test --match-contract BankVectors` whenever B regenerates vectors.
- **A-08** Deployed, ledger v1 loaded (hash matches), level 0 set, funded 10,000 AUSD. Scripts: `Deploy`, `LoadLedger`, `SetLevel` (`LEVEL=0|1`), `Fund`, `Ping`, `Lifecycle` (`ACTION=start|seal|reset`).
- **A-09** Both contracts verified via the devnads API (`script/verify.sh`, repeatable). MonadVision reports a *partial* match (metadata-hash only; the deployed bytecode equals the current build apart from immutables and the metadata hash); Monadscan reports "already verified".
- **A-10** `app/src/chain/gasModel.ts`: `calibrated = true`, `gasLimitFor(ticks, opts?)`. Table below.
- **A-11** `MockAUSD.sol` + `script/DeployMock.s.sol` (second bank on MockAUSD, loaded, configured, funded; writes `deployment.testnet.mock.json`). Simulated against the testnet fork; nothing deployed. The app does not use it.
- **A-12 (P2)** `src/IRunTarget.sol` sketch for the business slide. CreateX deterministic addresses skipped on purpose: the bank is already deployed and verified, and a redeploy would invalidate everyone's config.

### Heads-up: someone else is driving the live bank
While I was calibrating, `runId` climbed from 2 to 10 and my operator nonce moved under me ("EOA nonce changed unexpectedly"), so another agent is sending transactions with the same operator key. My last reset attempt hit `WrongStatus` for that reason. I have stopped sending transactions; the bank was left Ready at level 0, as above. **If a rehearsal run was interrupted by a reset or a switch to level 1 that you didn't send, that may have been my calibration run. Sorry.** Only one writer at a time on the operator key, please.

### Gas table (Monad testnet, `eth_estimateGas`; receipts show `gasUsed == gasLimit`)

| Call | Measured | `callGas` limit |
|---|---|---|
| deploy (RunBank + Street) | 3.25M | n/a |
| `loadLedger` (500) | 1.52M | 1.8M |
| `setLevel` | 117k (warm) – 315k (first) | 380k |
| `startRumor` | 113k – 135k | 160k |
| `reset` (from Running) | 128k | 160k |
| `sealTicks` empty tick | 59k (+8k per extra tick) | |
| `sealTicks` 1 tick, 1 / 5 / 20 / 60 / 120 ids | 138k / 151k / 199k / 324k / 536k | |
| `sealTicks` 3 ticks × 20 ids | 340k | |
| real tx: level 1, 2 ticks × 20 ids | 421,801 (estimate = limit = used) | |

Fit (107 samples, levels 0 and 1):
- Level 0 (`opts.speedBump === false`): `60k + 8.5k·ticks` when no ids, else `150k + 8.5k·ticks + 3.8k·ids`. Satisfies `sample ≤ formula ≤ 1.15·sample + 20k` for every sample.
- Level 1 / default: `225k + 28k·ticks + 3.7k·(ids + queued) + 3.1k·distinctLedgerSlots`. At least the sample on all 107, but loose on dense batches (up to ~1.8× on the worst sample). Speed-bump cost depends on the queue, which `ticks` alone can't show, so pass `{ queued }` if you know it.
- **C: prefer `estimateGas + 10%`; use the formula as the fallback.** `gasLimitFor(ticks)` with no options is the safe envelope. Ledger slots barely matter at level 0 (≈0.3k per slot, not 8.1k), so that term is only in the level 1 branch.

### Interface notes (for C / F / B)
- `queueSlice(from, to)`: positions counted from the front of the queue, half-open `[from, to)`, clipped to the current length.
- `reset()` from `Ready` reverts `WrongStatus(Running, Ready)`.
- `sealTicks` checks status first (`WrongStatus`), then `TickMismatch`. After a run ends, a re-sent batch gets `WrongStatus`, not `TickMismatch`.
- `sealTicks` stops silently once the status leaves `Running`; remaining ticks in the batch are ignored (no revert, no events). Returned `lastTick` is the last tick actually applied.
- `served` in `TickSummary` = length of the PRD `serve` list (includes ids trapped at the failure tick).
- `depositorBalance(id)` returns 0 for `id >= count`.
- `setLevel` and `loadLedger` both restore the balance sheet (status stays `Ready`), so `insuredOwed` is always consistent whichever is called last.
- AUSD moves with one `transfer` to `Street` per `sealTicks` transaction (sum over ticks); events stay per tick.

### Next
- Nothing open. If B regenerates the ledger: `forge script script/LoadLedger.s.sol --rpc-url monad_testnet --broadcast --slow` (Ready only), then `forge test --match-contract BankVectors`.
- C's real rehearsal numbers (C-13) can refine the level 1 envelope.

### Blocked by
- Nothing.
