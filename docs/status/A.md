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

## 13:45 update (A): re-verified against B's vectors v2, nothing blocked

- Re-ran everything after B's vectors v2 (real-model scenarios, thousands of ticks): the one-test-per-file tick-by-tick replay hit forge's default test gas limit, so `contracts/foundry.toml` now sets `gas_limit = 9223372036854775807`. **52/52 tests green** including all vectors v2 scenarios.
- Live bank (read just now): Ready, level 0, runId 27, ledger hash `0x8f53…4036` = B's v1 (unchanged, no `LoadLedger` rerun needed), config hash = level 0, AUSD held 10,000.
- Fund / ledger / config / verify / ABI / gas model: nothing left to do.

### Blocked by
- Nothing technical. One coordination risk, filed below for C and F:
  - **Operator key has several writers.** My calibration run, C's `chain:smoke` and F's `live:e2e` all send from the same operator key on one bank; nonces collide ("EOA nonce changed unexpectedly") and a reset by one run interrupts another's. Not a contract bug. It needs a convention, so I asked C and F to agree on one (see their status files).


## Reply → A (from C, 14:05)

- Acknowledged your 13:45 request. C will add (1) an advisory lock (`/tmp/run-bank.lock`, plus refusing to start when the bank is `Running` with a recent event) and (2) fail-loud-on-nonce-drift to `chain:smoke` and `chain:fork`'s live mode. It is queued, not started: I'm holding until the human says go. Until then C sends **no** live transactions.
- Needed from A: nothing, except keeping your Foundry scripts off the live bank while someone else's `LIVE BANK:` line is up (see F.md).
- Gas: no formula-below-sample rows from C so far (every level-0 row sits under A's formula).

## REQUEST → A (from B, 13:45)
- B regenerated `app/src/engine/data/vectors/bank-vectors.json` (**v2: 10 scenarios**, was 8). Ledger and configs are unchanged, so no `LoadLedger` / `SetLevel` rerun is needed. The two new scenarios come from the real panic model: `real-model-bhau-W` (8 ticks, ends Failed) and `real-model-mutual-R` (34 ticks, ends Survived, includes empty ticks). Please run `forge test --match-contract BankVectors` and note pass/fail here. If any field differs, PRD §9 decides who is wrong; tell B the scenario, tick and field.

## REQUESTS → A (from F, 14:50)
1. **Single writer on the operator key.** F agrees to A's convention: F uses the **backup key** for `live:e2e` / rehearsals and will put `LIVE BANK: F until HH:MM` at the top of `status/F.md` while sending. Please keep Foundry scripts and calibration runs off the bank while any `LIVE BANK:` line is up, and write your own `LIVE BANK: A until HH:MM` line at the top of `status/A.md` when you do need to send. (Blocks F's replay re-records and rehearsals only until C's lock lands.)
2. **MonadVision shows a *partial* match** for RunBank/Street (metadata hash only). PRD §21 says "Contracts verified on MonadVision and Monadscan", and judges will open the explorer links from the proof panel. If you can get a **full** match on MonadVision (same compiler settings and `bytecode_hash`/metadata as the deployed build, or re-submit with the exact build-info), please do; otherwise note the exact wording to use in README/runbook so we don't over-claim. Owner: A. Not blocking.
3. Nothing else from F. Ledger/config/model hashes all match (B confirms `modelHash 0xebcb6f1f…` is final).

## 13:50 update (A): replies to B and F, nothing remaining

**Reply → B**: `forge test --match-contract BankVectors` on vectors v2 (10 scenarios, incl. `real-model-bhau-W` 8 ticks → Failed, `real-model-mutual-R` 34 ticks → Survived): **all pass**, tick by tick and batched, every field. No PRD discrepancy. (Needed `gas_limit` raised in `foundry.toml` for the long replays; committed.)

**Reply → F (1) single writer**: agreed. I send **no** transactions to the live bank; none are pending. If I ever need to, I'll put `LIVE BANK: A until HH:MM` at the top of this file first and stay off the primary key while another `LIVE BANK:` line is up. Last bank read: Ready, level 0, 10,000 AUSD, ledger/config hashes match B.

**Reply → F (2) MonadVision "partial"**: investigated; the contracts are fully matched, the word "partial" came from the devnads API wording.
- The deployed runtime bytecode equals the current build byte for byte, including the metadata hash (only the 8 immutable slots differ, as expected). So the source is exact.
- I re-submitted both contracts to MonadVision's Sourcify backend (`sourcify-api-monad.blockvision.org`). It reports **`runtimeMatch: exact_match`** for both (RunBank match id 2047526, Street 2047527) and "already verified, no better match possible". `creationMatch` is `null` (Sourcify has no creation-tx data for these), which is why the devnads API calls it "partially verified".
- **Wording to use in README / runbook / slide: "Verified on MonadVision (Sourcify exact match) and Monadscan."** Do not say "creation-bytecode match". Check: `curl https://sourcify-api-monad.blockvision.org/v2/contract/10143/0x2cD82EE2b3C19E996Fa9da80052e912A2E90F41D`.

**Still open, not mine to act on** (waiting for data, not blocked): level-1 gas rows from F's `live:e2e` `adapter.gasLog` once C's writer lock lands. The current level-1 envelope is already ≥ every measured sample; the refit only tightens it.

### Blocked by
- Nothing.
