# Agent A status (Contracts) — full handover

> **Read this top to bottom and you can take over Workstream A with no other context.**
> Scope: `contracts/**`, `app/src/chain/abi/**`, `app/src/chain/gasModel.ts`, `app/src/config/deployment.testnet.json` (+ this file). Nothing else. Other agents (B engine, C chain adapter, D stage, E panels/brand, F app shell) edit the rest of the repo at the same time: never revert, reformat or "fix" their files.
> Last updated 14:20 IST, Sat 10 Oct 2026. Testnet only (Monad testnet, chain id 10143). No mainnet anything.

LIVE BANK (A): **none**. A has no pending transactions and sends none unless it first writes `LIVE BANK: A until HH:MM` here (see §7).

---

## 0. TL;DR

- All of Workstream A (BACKLOG A-00 … A-12, P0, P1, P2) is **done, committed and live**. The bank is deployed, verified, loaded, configured and funded on Monad testnet.
- `forge test`: **52 tests, all green** (unit, golden vectors v2, invariants, testnet fork).
- Live bank, last read 14:18 IST: status `Ready`, level 0, tick 0, `runId` 31, 10,000 AUSD held, Street 0, `ledgerHash` = B's v1, `configHash` = level 0.
- **One small open item** (owner: A, not blocking anyone): the level-0 gas formula in `app/src/chain/gasModel.ts` is ~5% *below* one real sample C reported (a tick that fails Bhau's). Fix is one constant, §6.3. C and F currently use the safe envelope (default options), which is **not** affected, so nothing is broken.
- Nothing else is pending. Nothing blocks any other agent on A.

---

## 1. What this project is, in one paragraph

RUN! is a Monad Blitz demo: start a rumor, watch 500 depositors run an onchain bank dry in seconds. The bank is the `RunBank` contract. **Depositor decisions happen offchain** (B's deterministic engine decides who tries to withdraw each tick); the contract only holds the ledger, pays, prices the fire sale, and decides when the bank fails or survives. The app (C's chain adapter) submits batches of ticks to `RunBank.sealTicks`, and F's controller + D/E UI show it. The maths is PRD §9 (source of truth); B's TypeScript mirror (`app/src/engine/bank.ts`) must match the contract field-for-field, and that is checked by golden vectors.

Docs: `docs/PRD.md` (§0, §8 network/addresses, §9 bank maths, §11 contracts, §16.3 chain barrel, §17 workstreams), `docs/BACKLOG.md` ("Workstream A").

---

## 2. Live deployment (chain 10143)

Source of truth for the app: `app/src/config/deployment.testnet.json`.

| | Address / value |
|---|---|
| RunBank | `0x2cD82EE2b3C19E996Fa9da80052e912A2E90F41D` |
| Street (created by RunBank's constructor) | `0x7998f16710Ab81AD2D68d7C0B7F0fd296CC7927D` |
| AUSD (real Monad testnet stablecoin, 6 decimals) | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` |
| AUSD faucet proxy (not used by the contracts) | `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`, `requestFunds(address)`, 10,000 AUSD per claim, **global** 60 s cooldown (PRD §8) |
| Owner of RunBank (can `loadLedger`, `setOperator`, `rescue`) and primary operator | `0x85db51Abac83F8B1DF2E674c29f8D68527Bf6b10` (key = `OPERATOR_PK` in `contracts/.env`) |
| Backup operator (operator only, not owner) | `0xFeAf5C921996FC53f4DEf35e181E766e6D74690A` (`BACKUP_ADDRESS`) |
| deployBlock | 69764586 |
| tokenKind | `"AUSD"` |

Deployment transactions (all by the owner):

| Step | Tx | Gas | Block |
|---|---|---|---|
| Deploy `RunBank` (creates `Street`) | `0x2eafbb7a135a77cb03dab2bdd7feb4dc71d2d1bcb080b40be0c63698b5e0a440` | 3,250,009 | 69764586 |
| `setOperator(backup, true)` | `0x419563479c23dd56692e3973b4abc11471cf0b4e7358201f0d6c9479cf34b4dc` | 64,839 | 69764590 |
| `loadLedger` (ledger v1, 500 depositors) | `0xb995d7d86a83a5030bdb0c0eefb1325c4808e8782fbdff7255263def2d4683bf` | 1,519,271 | 69764835 |
| `setLevel(0, …)` | `0x6d612b2ad8053314b8b0b39c3df63d7da70ff6e7e289397b55624b2f0c6643f9` | 116,872 | 69764889 |
| `AUSD.transfer(bank, 10_000e6)` | `0x16e378c575233690e1dfff82e01908c52132c0f74db841f80729ce4a02220a25` | 80,223 | 69764938 |

Explorers: `https://testnet.monadvision.com/address/<addr>` (also Monadscan / Socialscan).

**Verification state** (A-09): both contracts verified.
- Deployed runtime bytecode equals the current local build **byte for byte, including the metadata hash** (only the 8 immutable slots differ). So `contracts/src` at HEAD is exactly what is on chain.
- MonadVision's Sourcify backend reports `runtimeMatch: "exact_match"` (RunBank match id 2047526, Street 2047527); `creationMatch` is `null` (no creation-tx data), which is why the devnads API says "partially verified". Monadscan says "already verified".
- **Wording to use in README / runbook / slides: "Verified on MonadVision (Sourcify exact match) and Monadscan."** Do not claim a creation-bytecode match.
- Check any time: `curl https://sourcify-api-monad.blockvision.org/v2/contract/10143/0x2cD82EE2b3C19E996Fa9da80052e912A2E90F41D`.
- Re-verify after any redeploy: `contracts/script/verify.sh` (reads addresses from `deployment.testnet.json`; submits to `https://agents.devnads.com/v1/verify`). Fallback if that API fails: `forge verify-contract <addr> src/RunBank.sol:RunBank --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/` (same for `src/Street.sol:Street`).

---

## 3. Files I own (what each one is)

```
contracts/
  foundry.toml            solc 0.8.28, via_ir, optimizer 200, evm cancun, gas_limit raised (see §8), fs_permissions, rpc alias monad_testnet = ${MONAD_RPC_URL}
  remappings.txt          @openzeppelin/ = lib/openzeppelin-contracts/
  .env                    NOT committed. OPERATOR_PK, BACKUP_ADDRESS, MONAD_RPC_URL (template: .env.example). NEVER print or echo these.
  README.md               overview, test + script table
  lib/                    vendored OpenZeppelin 5.x and forge-std (committed, trimmed by contracts/.gitignore)
  src/
    IRunBank.sol          FROZEN interface, copied from PRD §11.2 (names, field order, types). Do not change.
    RunBank.sol           the bank (Ownable, ReentrancyGuardTransient). sealTicks = PRD §9.4 line by line.
    Street.sol            where paid-out AUSD goes; sweep() (bank only) returns it all to the bank on reset
    MockAUSD.sol          fallback token (6 decimals, open mint). Only used by tests and DeployMock.
    IRunTarget.sol        P2 sketch interface for the business slide ("plug in your protocol"). Not deployed or used.
  test/
    Base.t.sol            shared fixtures (25 whales x 190 AUSD + 475 x 10 AUSD = 9,500; same shape as PRD §9.1)
    RunBank.t.sol         39 tests: ledger/config, lifecycle, tick maths, speed bump, insurance, PRD §9.5 worked example
    BankVectors.t.sol     3 tests: replays B's golden vectors (tick by tick and batched)
    Invariants.t.sol      4 invariants x 2 levels (Handler drives random ascending ticks + resets)
    Fork.t.sol            2 tests on a Monad testnet fork with the real AUSD (skips if MONAD_RPC_URL unset)
  script/
    Deploy.s.sol          deploy RunBank, add backup operator, write deployment.testnet.json
    fix-deploy-block.js   rewrites deployBlock in that JSON from the broadcast receipt
    LoadLedger.s.sol      load app/src/engine/data/ledger.json (Ready only; checks the hash matches)
    SetLevel.s.sol        LEVEL=0|1, config from app/src/engine/data/configs.json (Ready only)
    Fund.s.sol            tops bank up to cash+bonds AUSD from the operator (no-op if already funded)
    Ping.s.sol            operator ping tx
    Lifecycle.s.sol       ACTION=start|seal|reset for rehearsals/gas calibration
    DeployMock.s.sol      MockAUSD + second bank, writes deployment.testnet.mock.json (not deployed, simulated only)
    verify.sh             verify RunBank + Street (devnads API)
    export-abi.sh         forge build, then write app/src/chain/abi/{runBank,street,erc20,faucet,index}.ts
app/src/chain/abi/        generated ABI wrappers (`as const`). Regenerate with export-abi.sh; do not hand-edit.
app/src/chain/gasModel.ts calibrated gas formula + callGas constants (§6)
app/src/config/deployment.testnet.json   addresses above
```

Untracked/ignored by design: `contracts/out`, `cache`, `broadcast` (gitignored), `contracts/.env`.

---

## 4. Contract behaviour you need to know (beyond the PRD)

Interface is exactly PRD §11.2. Extra ABI entries come from OpenZeppelin (`owner`, `transferOwnership`, `renounceOwnership`, `OwnershipTransferred`, `OwnableUnauthorizedAccount`, `OwnableInvalidOwner`, `ReentrancyGuardReentrantCall`, `SafeERC20FailedOperation`). Additive only.

Roles: **owner** = deployer (`loadLedger`, `setOperator`, `rescue`). **operator** (primary and backup) = `setLevel`, `startRumor`, `sealTicks`, `reset`, `ping`. Anyone can read views.

Semantics (these were decided during implementation; C/F/B rely on them):
- `queueSlice(from, to)`: positions counted from the **front** of the queue, half-open `[from, to)`, clipped to current length.
- `reset()`: any status except `Ready`; from `Ready` it reverts `WrongStatus(Running, Ready)`. It sweeps Street back to the bank, clears the bitmaps, restores cash/bonds/depositsOwed/insuredOwed for the current config, zeroes tick/loss/queue counters, status `Ready`. It never rewrites the ledger. `runId` is **not** reset (it only increments in `startRumor`); that is why `runId` keeps climbing.
- `sealTicks(firstTick, ticks)`: requires `Running` (else `WrongStatus`) **before** checking `firstTick == tick+1` (else `TickMismatch`). So after a run ends, a re-sent batch gets `WrongStatus`, not `TickMismatch`. Each inner array is one tick and must be strictly ascending (`NotAscending`) with ids `< count` (`BadDepositor`); a bad id reverts the **whole** batch. If the status leaves `Running` mid-batch, the remaining ticks are **ignored silently** (no revert, no events); returned `lastTick` is the last tick actually applied. Ids already withdrawn or already queued are skipped (counted in `skipped`).
- `TickSummary.served` = length of the PRD `serve` list, **including ids trapped at the failure tick**. Who was actually paid is `withdrawnCount` / the withdrawn bitmap.
- `depositorBalance(id)` returns 0 for `id >= count`.
- `setLevel` and `loadLedger` both restore the balance sheet (status stays `Ready`) so `insuredOwed` is consistent whichever is called last. `setLevel` validation: `haircutMaxBps < 10_000`, `bonds0 > 0`, `quietTicks > 0`, `speedBumpBps <= 10_000`, else `BadConfig`. `configHash = keccak256(abi.encode(cfg))`.
- AUSD moves with **one** `transfer` to Street per `sealTicks` tx (sum of `paid + fireSaleLoss` over its ticks). Events stay per tick (`TickSealed`, then `BankFailed` or `BankSurvived` on a status change).
- `startRumor` requires a loaded ledger, `card < 4`, `seedNode < count`, and AUSD held >= `cash0 + bonds0` (else `Underfunded(need, have)`).
- Storage is packed for Monad's expensive cold reads (8,100 gas per cold SLOAD): `Core{cash,bonds,depositsOwed,insuredOwed}` in one slot, `Meta{tick,runId,cumulativeLoss,lastHaircutBps,quietCount,withdrawnCount,head,tail,status,level}` in one slot, ledger = 63 words of 8 x uint32, bitmaps `uint256[2]`, queue ring `uint256[32]` (512 x uint16). Scalars are read into memory once per `sealTicks` and written once.
- Security review notes (done by reading, ethskills security checklist): only trusted token is AUSD; `nonReentrant` (transient) on `sealTicks`/`reset`/`rescue`; effects before the single AUSD transfer; all arithmetic uses Solidity 0.8 checks; ledger bounded (`count <= 512`, nothing hidden beyond `count`); queue pushes <= 512 per run (each id queues at most once because of the queued/withdrawn bits), so the `uint16` head/tail cannot overflow. `rescue` lets the owner drain any token while `Ready` (intentional, for recovering stuck funds on a demo contract).

---

## 5. How to operate things (runbook)

All commands from `/Users/shreyas/Desktop/blitz/contracts`. Load env without printing it: `set -a; source .env; set +a`. Broadcast scripts need `--rpc-url monad_testnet --broadcast --slow`. **Read §7 (single writer) before sending any transaction.**

| I want to… | Do |
|---|---|
| Run all tests | `forge test` (add `set -a; source .env; set +a;` first to include the fork tests) |
| Re-check B's vectors after B regenerates them | `forge test --match-contract BankVectors` (file: `app/src/engine/data/vectors/bank-vectors.json`, currently 10 scenarios) |
| Read live state | `cast call 0x2cD82EE2b3C19E996Fa9da80052e912A2E90F41D "snapshot()((uint8,uint8,uint32,uint32,uint64,uint64,uint64,uint64,uint64,uint64,uint16,uint16,uint16,uint16,uint64,uint256,uint256,bytes32,bytes32))" --rpc-url $MONAD_RPC_URL`. Fields in order: status (0 Ready, 1 Running, 2 Failed, 3 Survived), level, runId, tick, cash, bonds, depositsOwed, insuredOwed, deposits0, cumulativeLoss, lastHaircutBps, queueLength, quietCount, withdrawnCount, startBlock, ausdHeld, streetHeld, ledgerHash, configHash. |
| B changed `ledger.json` | Bank must be `Ready`. `forge script script/LoadLedger.s.sol --rpc-url monad_testnet --broadcast --slow` (it aborts if the file's packed words don't hash to its `ledgerHash`, and checks the onchain hash after). Then `forge test --match-contract BankVectors`. |
| B changed `configs.json` | `LEVEL=0 forge script script/SetLevel.s.sol …` (and `LEVEL=1` if level 1 changed), then leave it at level 0 (the app default). Compare `configHash` to `keccak256(abi.encode(cfg))`. |
| Bank not funded (< cash0 + bonds0 AUSD) | Operator must hold the AUSD (faucet: `requestFunds(operator)`, 10,000 per claim, global 60 s cooldown, retry on `MaxFrequencyExceeded`). Then `forge script script/Fund.s.sol …` (needs bank `Ready`; no-op if already funded). |
| Bank stuck `Running`/`Failed`/`Survived` | `ACTION=reset forge script script/Lifecycle.s.sol …` (operator only). Then `SetLevel` back to level 0 if someone left it at 1. |
| Start / seal by hand (rehearsal, calibration) | `ACTION=start CARD=0 SEED_NODE=0 MODEL_SEED=1 …`; `ACTION=seal FIRST_TICK=1 FROM=25 COUNT=20 TICKS=2 …` |
| ABI changed (only if the contract changes, which it should not) | `contracts/script/export-abi.sh`; check `git diff app/src/chain/abi` and tell C |
| Redeploy (last resort; invalidates everyone's config and replays) | `Deploy.s.sol` then `node script/fix-deploy-block.js`, `LoadLedger`, `SetLevel` (level 0), send AUSD to the new bank (or `Fund`), `verify.sh`, `export-abi.sh`, then tell C/F/E in their status files. Do **not** do this without the human's approval. |
| MockAUSD fallback (only if real AUSD breaks) | `DeployMock.s.sol` writes `deployment.testnet.mock.json` and does not touch `deployment.testnet.json`. The app only switches if the human asks. |

Foundry nuances learned the hard way:
- `forge script` sets the tx gas from an RPC estimate; on Monad `gasUsed == gasLimit` (gas is charged on the limit), so a bigger limit costs real MON. Don't pass big gas multipliers.
- Parallel broadcasts from the same key collide: "EOA nonce changed unexpectedly" / "nonce too low". Then `reset` may fail with `WrongStatus` because the other process already did it. Re-read the bank state before retrying.
- Forge JSON cheatcodes: array wildcards (`[*]`) with `parseJsonUintArray` fail ("must return exactly one JSON value"); use `vm.keyExistsJson` to count, as `BankVectors.t.sol` does.
- `deal()` can't write AUSD's storage layout on the fork; `Fork.t.sol` borrows balance from the deployed bank/operator via `vm.prank`.
- zsh: don't loop over `"addr contract"` strings with `set --`; call `forge verify-contract` explicitly per contract.

---

## 6. Gas model (`app/src/chain/gasModel.ts`)

Monad charges the **gas limit**, not gas used, so limits must be tight but never too low. File exports: `calibrated = true`, `gasLimitFor(ticks: number[][], opts?: { speedBump?: boolean; queued?: number }): bigint`, `callGas` (fixed-call limits).

### 6.1 Measured (Monad testnet, `eth_estimateGas`; 107 samples)

| Call | Measured | `callGas` limit |
|---|---|---|
| deploy (RunBank + Street) | 3.25M | n/a |
| `loadLedger` (500) | 1.52M | 1.8M |
| `setLevel` | 117k (warm) – 315k (first) | 380k |
| `startRumor` | 113k – 135k | 160k |
| `reset` (from Running) | 128k | 160k |
| `sealTicks`, empty tick | 59k (+8k per extra tick) | |
| `sealTicks`, 1 tick, 1 / 5 / 20 / 60 / 120 ids | 138k / 151k / 199k / 324k / 536k | |
| `sealTicks`, 3 ticks x 20 ids | 340k | |
| real tx, level 1, 2 ticks x 20 ids | 421,801 (estimate = limit = used) | |

Findings: marginal cost ≈ 3.2–3.9k per id (slightly convex at high counts); ~8–8.5k per extra tick; ledger-slot count barely matters at level 0 (~0.3k/slot, not 8.1k); writing the second withdrawn-bitmap word is not a separate cost. Level 1 (speed bump) adds queue pushes/pops and is noisier; the cost depends on queue state (ids queued earlier get drained even by "empty" ticks), which `ticks` alone cannot show.

### 6.2 Formula in the file now

- Level 0 (`opts.speedBump === false`): no ids: `60k + 8.5k·ticks`; else `150k + 8.5k·ticks + 3.8k·ids`.
- Level 1 and **default (no options) = safe envelope**: `225k + 28k·ticks + 3.7k·(ids + queued) + 3.1k·distinctLedgerSlots` (empty batch with nothing queued: `62k + 8.5k·ticks`). >= every one of the 107 samples; up to ~1.8x loose on dense batches.
- Clamped to `[60k, 30M]`.
- C and F run `gasMode = 'formula'` by default now (envelope + queue hint, one retry at 2x on out-of-gas, then `estimate`); `estimateGas + 10%` is the alternative.

### 6.3 OPEN ITEM (owner: A) — level-0 fit is ~5% under one real sample

C reported a real sample: **a tick that fails Bhau's x W: `{ticks 1, ids 137, slots 57, estimate 713,808}` vs level-0 formula 679,100.** Failing ticks cost more (extra event/branch, and the bank is partly drained). The default envelope (936k for that shape) is above it, so nothing is broken today; only callers that pass `{ speedBump: false }` would be short. Nobody does today (C uses default options).

What I verified offline, no chain access needed:
- With that sample added to the 56 level-0 samples, a linear model cannot satisfy both `sample <= formula` and `formula <= 1.15·sample + 20k`.
- **Recommended fix:** in `L0` change `perId` from `3_800n` to `4_200n` (keep `base 150_000n`, `perTick 8_500n`, `baseEmpty 60_000n`). Checked against all 57 level-0 samples: every sample is covered with >= 2.8% headroom; worst overshoot is 1.21x (`(formula − 20k) / sample`), slightly looser than the original 1.15x target but it will never under-limit. Update the "Fit quality" comment (107 → 108 samples; level 0 ≤ 1.21x), run `pnpm typecheck` and `pnpm test` in `app/`, commit only `app/src/chain/gasModel.ts` and this file.
- Optional refinement when F pastes real level-1 `adapter.gasLog` rows (F/C asked to do this after C's lock lands; rows have `ticks, ids, slots, estimate, formula, limit`): add any row where `formula < estimate`, refit the level-1 constants so the envelope is still >= every row, then re-run the same coverage check. Include failing-tick samples.
- I did not make this edit yet because the current instruction was documentation-only. It is a 1-line change.

Calibration scripts used (not in the repo): sampled `cast estimate --from <operator> <runBank> "sealTicks(uint32,uint16[][])" 1 "[[...],[...]]"` against a `Running` bank at tick 0 (read-only, no key needed), varying ticks 1–8, ids 0–475, ids spread vs contiguous, level 0 and 1, then least-squares + grid search. `Lifecycle.s.sol` is how to put the bank in `Running` for that (needs the single-writer rules in §7).

---

## 7. Single writer on the live bank (IMPORTANT)

There is **one** bank and **one** operator key shared by several agents. Concurrent writers cause nonce collisions and a reset by one run kills another's run. Convention agreed with C and F:

1. Before sending any live transaction, write `LIVE BANK: A until HH:MM` as the first line of this file (and clear it afterwards). Check other agents' lines first: `docs/status/F.md` line 3, `docs/status/C.md`. If another agent's `LIVE BANK:` line is up, **do not send**.
2. C's advisory lock: `app/scripts/chain-lock.ts` (lock file `/tmp/run-bank.lock`, `guardLiveBank`, `LIVE BANK:` checks, fail-loud on nonce drift) is used by `chain:smoke`, `chain:fork`, and F's `live:e2e`. My Foundry scripts do **not** use it, so check the lock file and status files manually.
3. F uses the **backup** key for `live:e2e`/rehearsals; C's smoke uses the primary. Foundry scripts use `OPERATOR_PK` (the primary), so they collide with C's smoke if run at the same time. Prefer read-only work (`cast call`, `cast estimate`, `forge test`, fork tests) whenever possible.
4. After any send: leave the bank `Ready`, level 0, 10,000 AUSD held, Street 0.

Incident log (so nobody wonders):
- ~13:00–13:20: during my gas calibration, `runId` climbed from 2 to 10 and my operator nonce moved under me; one of my `reset` calls hit `WrongStatus`, another failed with "nonce too low". Other agents were driving the same key. My calibration may have interrupted someone's run. Since then I have sent **no** transactions. The bank was left `Ready`, level 0 (verified several times afterward; `runId` now 31 from others' runs).
- At 13:42 I was asked to run `Fund.s.sol` because "the bank holds 0 AUSD". The claim was stale: the bank already held 10,000 AUSD (funded in the deployment above), so I did not run it. `Fund.s.sol` is idempotent anyway but requires `Ready`, so it would only have added a writer.

---

## 8. Tests in detail

`forge test` → 8 suites, 52 tests, 0 failed (last run 13:43 after B's vectors v2).

- `RunBank.t.sol` (39): `LedgerAndConfigTest` (6: read back every balance + hash == `keccak256(abi.encodePacked(packed))`, bad shapes, owner/Ready gating, `setLevel` validation and `configHash`, `insuredOwed` for cap 0 and 50 AUSD), `LifecycleTest` (13: startRumor guards and `Underfunded`, reset from Running sweeps Street, reset after failure, second run identical to first, ping/operators gating, rescue, Street only-bank), `TickMathTest` (14: cash-first, event contents, **PRD §9.5 worked example to the base unit** (tick 1 haircut 552 bps, sold 529.212532, loss 29.212532; tick 2 haircut 2317 bps, cumulative loss 933.937249, Failed), mid-serve failure traps the rest, reverts (`TickMismatch`, `NotAscending`, `BadDepositor`), batch == single ticks, quiet ticks → Survived, new request resets quiet count), `SpeedBumpAndInsuranceTest` (6: per-tick cap with overshoot and FIFO, queued ids skipped, queue drains then survives, `insuredOwed` = Σ min(balance, cap), Monad Mutual survives a small run, failure reports trapped vs uninsured).
- `BankVectors.t.sol` (3): ledger hash in vectors == `ledger.json`; all scenarios replayed **tick by tick** asserting every field of the snapshot and of the `TickSealed` summary (cash, bonds, depositsOwed, insuredOwed, cumulativeLoss, served, skipped, haircutBps, queueLength, status, withdrawnCount, paid, bondsSold, fireSaleLoss) plus AUSD conservation; and the whole scenario **batched** in one `sealTicks`. Vectors v2 = 10 scenarios (8 hand-built + `real-model-bhau-W` 8 ticks → Failed + `real-model-mutual-R` 34 ticks → Survived). **All pass.** The long scenarios replay thousands of ticks' worth of calls inside one test, which exceeded forge's default test gas limit, so `foundry.toml` has `gas_limit = 9223372036854775807` (the maximum accepted by forge's TOML parser).
- `Invariants.t.sol` (4 invariants x Bhau's and Mutual, 64 runs x 40 depth, `fail_on_revert = false`): AUSD(bank) + AUSD(street) == funded; `depositsOwed` == Σ unwithdrawn balances (from the bitmap); `cash + bonds + cumulativeLoss + paidTotal == 10,000e6` and nobody paid twice (`paidTotal = deposits0 − depositsOwed`); Street holds `paid + loss` and bank AUSD == `cash + bonds`.
- `Fork.t.sol` (2; run with env loaded): real AUSD on a testnet fork has 6 decimals; Bhau's everyone-at-once fails, reset sweeps Street back (AUSD returns to the bank), switch to Monad Mutual, a small run + quiet ticks → Survived. Nothing is broadcast.

---

## 9. Relationship with the other agents (what each depends on from A, current status)

| Agent | Uses from A | State |
|---|---|---|
| B (engine) | Runs the same maths in TS (`engine/bank.ts`); provides `ledger.json`, `configs.json`, `vectors/bank-vectors.json` | Ledger v1 hash `0x8f5360480d2683535f631ce27694aa413c93ba286e2c56f80bfe426ec3324036` (final; matches chain). Configs unchanged. Vectors v2 pass. If B changes ledger/configs again: §5 rows 3–4 and re-run BankVectors. |
| C (chain adapter) | ABI (`app/src/chain/abi`), `deployment.testnet.json`, `gasModel.ts`, `callGas` | Live adapter + SealQueue + lock shipped. Uses my envelope + `queued`. Reported the §6.3 sample. |
| F (app shell) | Same files via C; replays/e2e | Uses backup key + C's lock. Waiting for a live slot to run the proof-panel check and to paste `adapter.gasLog` level-1 rows (not blocking). |
| E (panels) | Contract addresses/explorer links from the deployment JSON; "verified" wording | Use the wording in §2. |
| D (stage) | None directly | — |

Replies already given (so nobody re-asks): to B — vectors v2 all pass; to F — single-writer convention agreed; MonadVision "partial" explained and wording given (§2); to C — thanks for the lock; gas sample acknowledged (§6.3).

---

## 10. Open items and what to do

| # | Item | Owner | Blocking? | Action |
|---|---|---|---|---|
| 1 | Level-0 gas formula ~5% under C's failing-tick sample | **A** | No (default envelope covers it; nobody passes `speedBump:false`) | §6.3: `perId` 3_800n → 4_200n, typecheck/test, commit `gasModel.ts` + this file |
| 2 | Level-1 gas rows from F's `live:e2e` `adapter.gasLog` | F (provide) → A (refit) | No | When rows appear in `status/C.md`/`F.md`, refit if any row has `formula < estimate`; otherwise nothing |
| 3 | README/runbook/slide wording "Verified on MonadVision (Sourcify exact match) and Monadscan" | F/E (docs/copy) | No | Use the §2 wording; do not say "creation match" |
| 4 | Optional: CreateX deterministic addresses (BACKLOG A-12) | — | No | **Skipped on purpose**: a redeploy would invalidate every agent's config and replays |

Nothing else is outstanding. No agent is blocked on A.

---

## 11. Do-not list

- Don't change `IRunBank.sol` or the contract's ABI/semantics: C, F and B's replays and vectors pin them. If the contract must change, that is a redeploy (§5) and needs the human.
- Don't send transactions without §7. Don't run `Fund`/`reset`/`SetLevel` "just to check": read with `cast call` instead.
- Don't print, echo, log or commit `contracts/.env` (`OPERATOR_PK`). The repo's `.gitignore` excludes `.env*` except `.env.example`.
- Don't commit with `git add -A`, `git stash`, `git reset` or `git pull`; the repo is shared. Add only A's paths.
- Don't touch other agents' files; file `REQUEST → <agent>` lines in their status files instead.
- Mainnet is out of scope. Chain 10143 only (every script asserts `block.chainid == 10143`).

---

## 12. Interface notes (kept from earlier checkpoints, for C / F / B)

- Everything in §4 applies; the short list: `queueSlice` is front-relative half-open; `reset()` from Ready reverts; `sealTicks` checks status first and stops silently after a status change; `served` includes trapped ids; `depositorBalance(id>=count) == 0`; one AUSD transfer per `sealTicks` tx; events per tick.

## History (condensed)

- 12:53 `a691365` contracts, tests, deploy script, ABI export, testnet deployment (earlier A session, interrupted by limits).
- ~13:10 `d6d1bac` golden vectors, invariants, fork test, calibrated gas model, verify, mock deploy, `IRunTarget`, status.
- 13:43 `38ac2a6` forge test gas limit for vectors v2.
- 13:50 replies to B (vectors v2 pass) and F (single writer; MonadVision exact match wording).
- 14:20 this handover rewrite; no code changes.
