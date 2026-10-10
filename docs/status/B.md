# Agent B status (Engine)

> **START HERE (any agent taking over B's work):** read the section **"HANDOFF — complete guide to B's engine"** at the bottom of this file. It is self-contained: what exists, how it works, how to run/verify/retune it, who must react to which change, and what is still open. The dated updates in between are history.

## T+0:20 update

**v0 data in** — `app/src/engine/data/{ledger,configs,cards,graph}.json` (regenerate with `pnpm tsx scripts/gen-placeholder.ts`).

### Done
- B-00 placeholder data. Ledger v0: 500 × 19 AUSD = 9,500 AUSD, 63 packed words, hash per PRD §9.1. Configs per PRD §9.2. Cards per §10.2 (seed nodes provisional). Graph v0: jittered grid, 500 nodes, 25 whales, `neighbors` lists.
- `engine/ledger.ts`: `packBalances`, `unpackBalances`, `hashLedgerWords`, `N_DEPOSITORS`, `N_WORDS` (tested).

### Data file formats (stable from v0 on)
- `ledger.json`: `{ version, count, balances: string[500], packed: string[63], deposits0, ledgerHash }` (decimal strings).
- `configs.json`: `{ "0": {...}, "1": {...} }`, bigint fields as decimal strings.
- `cards.json`: `[{ id, hotkey, text, strength, seedNode }]`.
- `graph.json`: `{ version, nodes: [{id,x,y,degree,whale}], edges: [[a,b]], neighbors: number[][] }`.

### Next
- B-01 PRNG, B-04 bank mirror, then B-02/B-03 real graph + ledger, B-05 vectors, B-06 stepRun.

### Interface notes
- The `@/engine` barrel still points at F's fixture until the real `stepRun` lands (B-07); I won't swap it earlier so nobody breaks.
- Contract `TickSummary.served` counts the whole PRD `serve` list (ids trapped at failure included). The mirror's `TickResult.served` will do the same, so mirror/chain comparison is field-for-field.

### Blocked by
- Nothing.

## T+0:50 update

### Done
- B-01 PRNG (`engine/prng.ts`: `u`, `foldSeed`; pinned by snapshot).
- B-04 bank mirror (`engine/bank.ts`): `applyTick`, `initialBank`, `hashConfig`, `BankError`. 24 tests incl. the PRD §9.5 worked example to the base unit (tick 1: haircut 552, sold 529.212532, loss 29.212532; tick 2: haircut 2317, sold 3904.724717, cumulative loss 933.937249, Failed). **Barrel now exports the real `applyTick` / `initialBank` / `hashConfig`**; the rest of the barrel is still the fixture until B-06/07.
- B-02 graph v1 (`pnpm gen:graph`): BA m=2, 500 nodes, 1,097 edges, max degree 70, 25 whales (degree 16–70) on the top-degree nodes, +4 whale↔whale edges each, d3-force layout in [0.03, 0.97]². Property tests in `graph.data.test.ts`.
- B-03 ledger v1 (`pnpm gen:ledger`): 25 whales 95–600 AUSD (sum 4,750), 475 others 1–49 AUSD (sum 4,750, median 7.70), total exactly 9,500 AUSD, biggest balances on biggest hubs.
  `ledgerHash = 0x8f5360480d2683535f631ce27694aa413c93ba286e2c56f80bfe426ec3324036`

REQUEST → A: re-run LoadLedger (ledger v1, hash 0x8f5360480d2683535f631ce27694aa413c93ba286e2c56f80bfe426ec3324036). File: `app/src/engine/data/ledger.json`, `packed` has 63 decimal-string words.
REQUEST → C: applyTick ready for the mock adapter (`import { applyTick, initialBank } from '@/engine'`). Note `TickResult.served` = the whole PRD `serve` list (incl. ids trapped at the failure tick), same as the contract's `TickSummary.served`; who was actually paid is `bank.withdrawn`.

### Interface notes
- `applyTick` throws `BankError` (`.code` = `WrongStatus | NotAscending | BadDepositor`) where the contract reverts; it never mutates its input bank.
- `scripts/gen-placeholder.ts` removed (it would clobber v1 data). Regenerating the graph requires regenerating the ledger (whale set); run `pnpm gen:graph && pnpm gen:ledger`.
- Card seed nodes in `cards.json` are still v0 provisional (picked from the v0 graph): they get set properly with the tuner.

### Next
- B-05 golden vectors, B-06 panic model + `stepRun`, B-07 barrel swap, B-08 tuner, B-09 guard-rail tests.

### Blocked by
- Nothing.

## T+1:10 update (B resumed by a fresh agent after a limit stop)

### Done
- B-05 golden vectors: `pnpm gen:vectors` → `app/src/engine/data/vectors/bank-vectors.json` (8 scenarios, format documented under `"format"`; ledger v1, hash above). Covers: whale-wave failure, skips + quiet ticks, everyone-at-once mid-serve failure, haircut at `haircutMaxBps` (custom config), Mutual queue overshoot + drain, Mutual survival, quiet-streak reset, Mutual everyone-at-once (queue drains over 34 ticks). `src/engine/vectors.test.ts` asserts the mirror reproduces every field of every tick.
- Extra per-tick fields beyond PRD §11.7 (`withdrawnCount`, `paid`, `bondsSold`, `fireSaleLoss`) are additive; ignore them if not needed.
- NOTE: the per-tick `served` expectation is the length of the whole §9.4 `serve` list (ids trapped by a failure included).

REQUEST → A: vectors v1 ready (`app/src/engine/data/vectors/bank-vectors.json`). Setup order is in `format.setup`. A long run produced by the real model is added after B-06 (vectors v2).

### Next
- B-06 panic model + `stepRun`, B-07 barrel swap, B-08 tuner, B-09 guard rails, then P1/P2.

## T+1:45 update (CP1) — all P0 done, P1/P2 done

### Done
- **B-06/B-07 real engine is live behind `@/engine`.** The barrel now exports the real `loadModel`, `defaultParams`, `createRun`, `stepRun`, `stepRunWithRequested`, `replayTicks`, `verifyDecisions`, `applyTick`, `initialBank`, `hashConfig`, `TICK_MS = 400`, `MAX_LEAD = 6` (plus `bestSeeds`). The fixture is deleted. No code change needed on F's side: the full suite (246 tests incl. F's practice/replay tests) passes against the real engine and `pnpm build` is green.
- Files: `engine/{prng,ledger,bank,panic,model,run,eval,seeds}.ts`, `engine/data/{ledger,graph,cards,configs,model}.json`, `engine/data/vectors/bank-vectors.json`, `engine/lab/EngineLab.tsx`.
- **B-08 tuner** (`pnpm tune`, `pnpm tune --search [--write]`, env `TUNE_EVALS`, `TUNE_SEED`, `TUNE_START`, `TUNE_LEVELS`). Seeded annealing over the panic weights, thresholds, card strengths and card seed nodes; the objective also covers 2 alternative model seeds. `model.json` = `{ modelVersion "v1-tuned", weights, thresholds, strengths, seeds, modelSeeds, inputs{ledgerHash, graphHash, configHashes}, modelHash }`; `modelHash = keccak256(canonical JSON of everything but modelHash)` and it commits to the ledger, graph and both configs, so it changes if any of them do.
  **`modelHash = 0xebcb6f1fde8a1620645699edd5d54e1219966fe1c14c778f794dfb6d62b40c96`**
- **B-09 guard rails** (`pnpm vitest run src/engine`, 83 tests): the PRD §10.4 targets as assertions, demo "story" rules, determinism (3 runs → identical frame hashes; pinned snapshot of every request history), mirror-vs-vectors, model-hash consistency, a static check that no engine file uses `Math.random/exp/log/pow/sin/…`, and a perf budget.
- **B-05 vectors v2:** now 10 scenarios; the two new ones are produced by the real model (`real-model-bhau-W`: 8 ticks → Failed; `real-model-mutual-R`: 34 ticks → Survived). Configs did not change, so the contract's `setLevel` data is unchanged.
- **B-10 engine lab** at `/lab/engine`: pick bank + card, Step / Auto / Reset, graph canvas by node state, cash/bonds/loss chart, the target table with pass/fail.
- **B-11 P2:** `defaultParams(model, level, card, seedNode?)` accepts a chosen seed node; `bestSeeds(model, card, count = 8)` ranks starting depositors by how fast their rumor ruins Bhau's Bank (memoised, ~40 sims on first call).

### Tuner table (shipped model, default modelSeeds) — meets every PRD §10.4 target
| bank | card | outcome | tick | sec | heard% | asked% | whales out% | peak req/tick | peak queue | loss (AUSD) | loss/equity | trapped |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bhau's | Q | survived (fizzles) | 19 | 7.6 | 61 | 2 | 24 | 5 | 0 | 0 | 0% | 0 |
| Bhau's | W | **failed** | 8 | 3.2 | 60 | 33 | 96 | 137 | 0 | 967 | 193% | 335 |
| Bhau's | E | **failed** | 9 | 3.6 | 71 | 39 | 88 | 120 | 0 | 709 | 142% | 305 |
| Bhau's | R | **failed** | 10 | 4.0 | 50 | 35 | 100 | 150 | 0 | 1,503 | 301% | 325 |
| Mutual | Q | survived | 17 | 6.8 | 45 | 0 | 8 | 1 | 0 | 0 | 0% | 0 |
| Mutual | W | survived | 25 | 10.0 | 91 | 22 | 92 | 40 | 76 | 191 | 38% | 0 |
| Mutual | E | survived | 24 | 9.6 | 89 | 25 | 80 | 54 | 89 | 161 | 32% | 0 |
| Mutual | R | survived | 34 | 13.6 | 98 | 45 | 100 | 51 | 152 | 262 | 52% | 0 |

- **Bhau's × Q (documented choice, per PRD §10.4): it fizzles.** A weak rumor reaches 61% of depositors but only 2% of them ask for money; the bank counts 8 quiet ticks and survives (tick 19, no loss).
- PRD §10.4 "visual shape" (Bhau's × W): 60% heard at failure, 96% of whales withdrew before failure. Peak batch 137 ≤ 200 everywhere. Determinism pinned by snapshot.
- Extra "story" guard rails beyond §10.4 (so the §5.1 script is true): whales ask earlier than small depositors; Bhau's has a batch ≥ 30 in one block; Mutual shows real panic (22–45% ask), a queue of 76–152, and the insured small depositors mostly stay calm (≤ 60% ask).
- Robustness: with other model seeds a few cards miss a window by a tick or two (test allows ≤ 25% of alternative draws to miss). Shipped seeds always pass.
- Speed: 0.03 ms average per `stepRun` (worst 1 ms) against the 2 ms budget.
- **Model seeds are constants per card** (`modelSeeds` in model.json: 1380008225..28, same for both banks so the comparison is fair). Card seed nodes now: Q 35, W 39, E 3, R 22; strengths 0.35 / 0.45 / 0.55 / 0.75 (PRD start values were 0.4/0.6/0.8/1.0; the tuner moved them, they are not shown anywhere in the UI).

### Interface notes
- `RunState.internal` is opaque. Frame typed arrays (`heardAt`, `goneAt`, `nodeState`, `panic`) are never written after a step; treat them as read-only.
- `goneAt[i]` = the tick node i asked for its money (−1 if it hasn't). `newlyRequested` = ids asking for the first time this tick (re-sent ids are skips on chain, not "new"). `newlyServed` = ids actually paid this tick (ids trapped by a mid-serve failure are NOT in it; `result.served` is the whole §9.4 serve list).
- `panic[i] = score / threshold`, clamped to [0, 2]; Panicking display at ≥ 0.6.
- `stepRunWithRequested` sorts and de-duplicates the given ids; ids < 0 or ≥ 500 throw `BankError('BadDepositor')` from `applyTick`. A requester who never heard the rumor is shown as heard at that tick.
- `verifyDecisions` follows the *given* lists (the chain is the truth) and compares the model's own decision at each tick to them; `firstMismatchTick` is the first tick where the open model would have asked for a different set.
- Bank mirror rules worth knowing: a run ends `Survived` after `quietTicks` consecutive ticks with no new requests, so Bhau's with a slow first request survives early; the tuned model always produces its first request within a few ticks.
- Dev note: `pnpm tsx scripts/tune.ts` prints the table (no search); `TUNE_EVALS=0 TUNE_START='{…}' pnpm tsx scripts/tune.ts --search --write` re-applies a given tuning.

### Plain-language model description (for E's proof panel copy)
> Every depositor is a dot in a public network of 500. The rumor starts at one depositor and spreads to their friends, a little more likely if the rumor is juicy and more likely among the big depositors, who all know each other. Each depositor who has heard it gets a worry score: how loud the rumor is (fading over time), how much of their friends' money has already left, how thin the bank's cash looks, whether a queue has formed, and how big the last fire-sale discount was. Insured depositors worry less. Everyone has a private panic threshold, drawn from a fixed hash, and asks for their money the moment their worry crosses it. There is no randomness in the browser: given the same ledger, rumor and model seed, anyone can recompute every decision, and the chain's tick log lets you check them one by one.

### REQUESTS
- REQUEST → A: nothing new. Ledger v1 hash unchanged (`0x8f536048…4036`). Vectors v2 are in `bank-vectors.json` (adds two scenarios from the real model). Configs unchanged, so no `SetLevel` rerun is needed.
- REQUEST → C/F: `model.modelHash` is now the real hash above (it was a fixture value). `RumorStarted.modelHash` should carry it; `RumorStarted.modelSeed` is `defaultParams(...).modelSeed`.
- REQUEST → D: card seed nodes changed (W seed is node 39, a big whale, not the top hub); look at `defaultParams(model, level, card).seedNode`, not at hard-coded ids.

### Next
- P1: re-tune after the first live run if the chain-sealed run feels too fast or slow on stage (`TUNE_START` re-apply path above; watch Bhau's × W at ticks 8–10 vs the 13-tick copy in PRD §5.1).

### Blocked by
- Nothing.

## 13:45 — FYI from D (appended by D at the human's request; not blocking D)
- D never hard-codes seed nodes (it only draws `frame.nodeState`), so your seed change needs nothing from D.
- Stage observation for your tuning pass: Bhau's × W (Practice, real engine) ended at **tick 3, about 2.3 s**; the PRD §5.1 script wants roughly ticks 8–16 so the amber rumor-spreading phase is visible before the whales go. D's visuals are ready for whatever pace you settle on. Please note in your status when `model.json` / `configs.json` / `ledger.json` are final (F is waiting to record replays).

## Blockers and open dependencies (B, 13:45)
**B has no hard blocker.** All P0, P1 and P2 are done; `pnpm vitest run` (246 tests), typecheck, lint and `pnpm build` are green. Open items that need another owner (each is also written in that owner's status file):

| # | Needs | Owner | What | Why it matters |
|---|---|---|---|---|
| 1 | confirm | **A** | Run `forge test --match-contract BankVectors` against vectors v2 (10 scenarios, 2 new from the real model) | Proves the contract and the TS mirror still agree on the new long runs |
| 2 | add | **F** | `"gen:model"` script in `app/package.json`; optionally include `scripts/` in a tsconfig | B cannot edit `package.json`/tsconfig; the regen path for `model.json` needs an alias |
| 3 | wire | **F** | Pass the chosen node into `defaultParams(model, level, card, seedNode)` for D's `runActions.selectSeed` | Engine side is ready; the UI feature is dead until `start()` uses it |
| 4 | refresh | **D** | Re-check the stage timing against the tuned model (fail ticks 8–10, not 3); optional `bestSeeds` hint | D's note is stale |
| 5 | use measured values | **E** | Passbook/closing copy must use the run's measured seconds and blocks, not the PRD script's 5.4 s / 13 | Real Bhau's × W is 3.2 s (4.2 s sealed) |
| 6 | re-verify | **C** | Rerun fork/smoke for cards 0–3 on both levels with the tuned model | C's last report was from before the tuning |
| 7 | **human decision** | You | PRD §5.1 narrates Bhau's failing in ~13 ticks (5.4 s). The PRD §10.4 target (ticks 8–16) is met at tick 8–10, the fast end. Do you want B to retune toward ~12? | A retune changes `modelHash` and forces F to re-record replays and C to re-verify, so only do it if the script timing matters |

Not blockers, for the record: replays carry the final hash (verified), scripts typecheck clean (verified by hand), no ledger/config change since A loaded ledger v1.

## REPLY → B (from F, 14:50)
Nothing of B's blocks F. Acknowledged: `modelHash 0xebcb6f1f…` is final and F's replays (recorded 13:39) carry that hash. F will add `gen:model` to `package.json` and pass `seedNode` through `defaultParams(model, level, card, seedNode?)` for D's "pick who starts the rumor". If B ever changes the model, say so here and F re-records and redeploys.

## 13:50 — B closing update (all B work resolved; model frozen)
- **Item 1 (A): resolved.** A re-ran the contract tests on vectors v2: 52/52 green, all 10 scenarios (including `real-model-bhau-W` and `real-model-mutual-R`) match the contract field for field. Nothing for B to fix.
- **Items 2, 3 (F): acknowledged by F** and in F's own queue (`gen:model` alias, `selectSeed` wiring). Engine side is complete; B does not need to do anything.
- **Items 4, 5, 6 (D, E, C): informational asks, not blocking B.** They are in those agents' status files.
- **Item 7 (human): no change requested, so B is NOT retuning.** A retune would change `modelHash` and force F to re-record replays and redeploy and C to re-verify, mid-flight. Decision: **model frozen at `modelHash 0xebcb6f1fde8a1620645699edd5d54e1219966fe1c14c778f794dfb6d62b40c96`** (`v1-tuned`; ledger v1 `0x8f536048…4036`; configs unchanged). If the stage pace needs to change (Bhau's × W currently fails at tick 8, 3.2 s; the PRD §5.1 script says ~13 ticks), tell B and it will retune and announce the new hash here first.
- **Final verification (13:48):** `pnpm vitest run src/engine` 83/83 green; `pnpm tune` prints "ALL PRD §10.4 TARGETS AND STORY GUARD RAILS PASS"; lint clean on B's paths; no uncommitted B files; `model.json` hash matches the replays F recorded.

**Blocked by:** nothing. **REQUEST →** none outstanding.

## Reply → B (from C, 14:25)
Re-ran `chain:fork --run` for all 8 combinations on the tuned model (sync and no-sync send paths): every outcome and tick equals your table (Bhau's Q survives at 19, W/E/R fail at 8/9/10 with 335/305/325 trapped; Mutual survives at 17/25/24/34), gap-free, mirror matched every tick. No timing surprise; the largest tick (137 requests, the failing one) is ~714k gas. `RumorStarted.modelHash` / `modelSeed` are passed through unchanged. Details in `status/C.md`.

---

# HANDOFF — complete guide to B's engine (written 14:20; self-contained)

You do not need any chat history. This section tells an owner agent everything about Workstream B (the depositors and the bank-maths mirror): what is done, how it works, how to verify it, how to change it safely, and what is still open.

## 0. Status in one paragraph
All P0, P1 and P2 tasks of Workstream B (BACKLOG B-00…B-11) are **done and committed**. The engine is live behind `@/engine`; the bootstrap fixture is deleted. The tuned model meets every PRD §10.4 target. **The model is frozen** at `modelHash 0xebcb6f1fde8a1620645699edd5d54e1219966fe1c14c778f794dfb6d62b40c96` (`modelVersion v1-tuned`). F's committed replays and A's deployed contract (ledger v1) match it. Last verified 13:48 and again 14:15: `pnpm vitest run src/engine` = 9 files, 83 tests green; `pnpm tune` prints "ALL PRD §10.4 TARGETS AND STORY GUARD RAILS PASS". **Nothing is blocked. The only open item is a human decision on pace (§9).**

## 1. Ownership and hard rules (from PRD §0, §16, §17)
- B owns only: `app/src/engine/**` (incl. `data/`, `data/vectors/`, `lab/`), `app/scripts/gen-*.ts`, `app/scripts/tune.ts`, and `docs/status/B.md`. Never edit anyone else's files; write a `REQUEST → <owner>` in your own status file instead.
- No `Math.random`, no `enum`, no new packages, no React/DOM/`fetch` in `engine/` (only `engine/lab/` may use React). Inside `run.ts`/`panic.ts`/`prng.ts`/`bank.ts` also no `Math.exp/log/pow/sin/cos/sqrt` and no `**` (enforced by `run.test.ts` "determinism rules"). Generators and the tuner may use them.
- Commit only your paths: `git add <paths> && git commit -m "B: …"`. Never `git add -A`, `commit -a`, `stash`, `reset`, `checkout --`, `clean`, `rebase`, `pull`.
- Frozen interfaces (PRD §16.1 `types.ts`, §16.2 engine barrel) are additive-only. Never rename or retype.

## 2. File map (what lives where)
```
app/src/engine/
  index.ts          barrel (PRD §16.2). Exports below.
  prng.ts           u(seed,a,b,c) → [0,1) via Math.imul mixing; foldSeed(bigint)→32-bit. Snapshot-pinned.
  ledger.ts         packBalances / unpackBalances / hashLedgerWords (PRD §9.1 packing; keccak of 63 words)
  bank.ts           THE MIRROR of PRD §9.4: applyTick, initialBank, initialBankFor, hashConfig, BankError. bigint only.
  panic.ts          PanicWeights/PanicThresholds types + pure scoring helpers (PRD §10.3 formula)
  model.ts          loadModel(), defaultParams(), tuningOf(), deriveModel(), model-file types/hashing, TICK_MS, MAX_LEAD
  run.ts            createRun, stepRun, stepRunWithRequested, replayTicks, verifyDecisions (internal step())
  eval.ts           evaluate()/evaluateAll() scenario runner + checkTargets() (PRD §10.4) + checkStory() (demo guard rails)
  seeds.ts          bestSeeds(model, card, count) (P2)
  lab/EngineLab.tsx /lab/engine page (React; the only React in engine/)
  data/ledger.json  500 balances + 63 packed words + ledgerHash (v1)
  data/graph.json   500 nodes (x,y,degree,whale), edges, neighbors (v1)
  data/configs.json BankConfig for level 0 (Bhau's) and 1 (Monad Mutual) — decimal strings
  data/cards.json   Q W E R: text, strength, seedNode
  data/model.json   tuned panic weights/thresholds + modelSeeds + hashed inputs + modelHash
  data/vectors/bank-vectors.json   golden vectors for the contract (10 scenarios)
  *.test.ts         bank, prng, ledger, graph.data, ledger.data, data, vectors, run, targets (+ __snapshots__/targets.test.ts.snap)
app/scripts/
  gen-graph.ts      pnpm gen:graph   (BA m=2, whales, d3-force layout) → graph.json
  gen-ledger.ts     pnpm gen:ledger  (whales 95–600 AUSD, others 1–49, total exactly 9,500) → ledger.json
  gen-vectors.ts    pnpm gen:vectors → vectors/bank-vectors.json (reads ledger, configs AND the real model for 2 scenarios)
  gen-model.ts      pnpm gen:model   rebuilds model.json inputs + modelHash from the current data files (keeps tuning)
  tune.ts           pnpm tune [--search [--write]]
```
Public barrel (`@/engine`): `TICK_MS=400`, `MAX_LEAD=6`, `loadModel`, `defaultParams(model, level, card, seedNode?)`, `bestSeeds(model, card, count=8)`, `createRun`, `stepRun`, `stepRunWithRequested`, `replayTicks`, `verifyDecisions`, `applyTick`, `initialBank`, `hashConfig`. Everything else is internal (scripts and tests import relative paths).

## 3. The data (v1) and what depends on it
- **Ledger v1:** 500 depositors, total exactly 9,500 AUSD (`deposits0 = 9500000000`), 25 whales (95–600 AUSD, sum 4,750), 475 others (1–49 AUSD, sum 4,750). `ledgerHash = 0x8f5360480d2683535f631ce27694aa413c93ba286e2c56f80bfe426ec3324036`. **A loaded exactly this ledger on the deployed RunBank.** Changing it requires A to rerun `LoadLedger` (only possible while status is Ready).
- **Graph v1:** Barabási–Albert m=2, 1,097 edges, max degree 70, the 25 whales sit on the 25 highest-degree nodes (+4 whale↔whale edges each), d3-force layout normalised into [0.03, 0.97]². `graphHash = 0x914ff516…6493` (keccak of canonical JSON of `neighbors`). Regenerating the graph changes the whale set, so **always regenerate the ledger right after** (`pnpm gen:graph && pnpm gen:ledger`), then `gen:vectors`, `gen:model`, and re-tune.
- **Configs (unchanged since v0, PRD §9.2):** both banks `cash0 1500 AUSD`, `bonds0 8500 AUSD`, haircut base/slope/max 200/6000/9000 bps, `quietTicks 8`. Bhau's: `speedBumpBps 0`, `insuredCap 0`. Monad Mutual: `speedBumpBps 300` (cap 285 AUSD/tick), `insuredCap 50 AUSD`. `configHash` L0 `0xf05aaee8…e96e`, L1 `0x0083cf89…4248`. If these change, **A must rerun `SetLevel`** (and the app sends the config on every bank switch).
- **Cards (`cards.json`):** Q "The CEO just bought a yacht." strength 0.35 seed 35; W "The audit is *delayed*." 0.45 seed 39; E "Heard the founder flew to Dubai." 0.55 seed 3; R "Screenshot: the vault is empty." 0.75 seed 22. (PRD §10.2 starting strengths were 0.4/0.6/0.8/1.0; the tuner moved them. No UI shows strengths.) `data.test.ts` only requires strictly increasing strengths in (0,1].
- **Model seeds (`model.json.modelSeeds`):** `1380008225..1380008228` (card 0..3), same for both banks so the bank comparison is fair. They are < 2^64 (they go into the contract's `RumorStarted.modelSeed`, a uint64).
- **`model.json` format:** `{ modelVersion, weights, thresholds, strengths, seeds, modelSeeds[], inputs:{ledgerHash, graphHash, configHashes[2]}, modelHash }`. `modelHash = keccak256(toHex(canonicalJson(everything except modelHash)))`, canonical = recursively sorted keys, no whitespace. **It therefore changes whenever the weights, thresholds, strengths, seed nodes, model seeds, ledger, graph or either config change.** `strengths`/`seeds` mirror `cards.json`; a test asserts equality.
- **Shipped weights (v1-tuned):** `tellBase 0.025, tellStrength 0.0125, whaleTellMult 1.8, strengthW 1.2, goneW 0.55, cashW 0.3, queueW 0.3, haircutW 0.65, insuredW 0.4, fadeTicks 25, cashStressAt 0.15, haircutScale 1000`. **Thresholds:** `whaleBase 0.075, whaleSpan 2, otherBase 1.075, otherSpan 1.7, panickingFrac 0.6`.

## 4. How the engine works
### 4.1 Bank mirror (`bank.ts`) — PRD §9.4 exactly
`applyTick(bank, cfg, ledger, requested)` returns a NEW `BankState` and a `TickResult`; it never mutates its input. Throws `BankError` (`.code` ∈ `WrongStatus | NotAscending | BadDepositor`) where the contract reverts. Integer maths only (bigint; `ceilDiv` only for the bond-sale amount; all other divisions floor). `result.served` is the whole PRD `serve` list (including ids trapped at the failure tick), which is what the contract's `TickSummary.served` counts; who was actually paid is `bank.withdrawn` / `bank.withdrawnCount`. `trapped` is set when `statusAfter === 'failed'`: `{count: N − withdrawnCount, amount: depositsOwed, uninsured: depositsOwed − insuredOwed}`. **Rule that shapes the whole model:** a run ends `survived` after `quietTicks` (8) consecutive ticks with no new request and an empty queue. So if nobody asks for 8 ticks in a row the bank "survives" — the tuned model always produces its first request within a few ticks.

### 4.2 Run stepping (`run.ts`) — PRD §10.3
State carried in `RunState.internal` (opaque): folded seed, tuning, card strength, per-node thresholds (fixed per run), `heardAt` (Int16, −1 = not heard), `goneAt` (Int16, tick the node asked, −1 = not yet), `servedPrev` (ids paid last tick). Runs are immutable: each step returns a new `RunState`; typed arrays in a frame are never written again (treat as read-only).
`createRun`: tick 0, `heardAt[seed]=0`, bank = `initialBank` with `status:'running'`, thresholds `thr_i = base + span·u(seed,0,i,1)` with the whale or other constants.
One tick `t = frame.tick + 1`, using the bank after tick t−1:
1. **Spread.** Every node that heard before t tells each un-heard neighbour k if `u(seed,t,j,k) < pTell_j`, `pTell = tellBase + tellStrength·strength`, × `whaleTellMult` for whales. Neighbours of every id paid at t−1 also hear (deterministic: "they saw it"). Nodes heard at t can request at t but only spread from t+1.
2. **Score** for each heard, not-yet-asked node: `strengthW·strength·fade(age) + goneW·goneShare + cashW·cashStress + queueW·[queue>0] + haircutW·min(1,lastHaircutBps/haircutScale) − insuredW·insuredShare`, with `fade(d)=max(0,1−d/fadeTicks)`, `goneShare` = balance-weighted share of neighbours queued or withdrawn, `cashStress = max(0, cashStressAt − cash/depositsOwed)/cashStressAt`, `insuredShare = min(b,cap)/b` (0 for Bhau's). Doubles from `Number(bigint)/1e6`.
3. **Decision:** node asks iff `score ≥ threshold`. Requests are produced in ascending id order, so the payload is strictly ascending.
4. Apply `applyTick`; update `goneAt`, `newlyRequested` (ids asking for the first time), `newlyServed` (ids actually paid; trapped ids excluded), `newlyHeard`.
Display states (`NodeState`): Calm (not heard) · Heard (`score < 0.6·thr`) · Panicking (`≥ 0.6·thr`) · Queued (`bank.queued`) · Withdrawn (`bank.withdrawn`) · Trapped (bank failed and not withdrawn; takes precedence over Queued). `frame.panic[i] = score/threshold` clamped to [0,2].
`stepRunWithRequested(model, run, requested)` (spectate/replay): sorts + de-duplicates the given ids, still recomputes spread/scores for the visuals; a requester who never heard is shown as heard that tick; invalid ids throw from `applyTick`. `replayTicks` loops it until the bank leaves `running`. `verifyDecisions` follows the GIVEN lists (the chain is truth) and counts ticks where the model's own decision set equals the given set; `firstMismatchTick` is the first tick where it differs; `total = ticks.length`.
Performance: 0.03 ms average per `stepRun`, worst ~1 ms (budget 2 ms). Determinism: pure integer hashing + IEEE doubles with only + − × ÷ min max compare → identical in every browser/Node.

### 4.3 Where model weights live at runtime
`model.ts` keeps a `WeakMap<Model, Tuning>`; `tuningOf(model)` falls back to the shipped tuning for hand-built models. `deriveModel(base, {tuning?, cards?, configs?})` makes a modified copy (tuner and tests only; never at runtime). `defaultParams(model, level, card, seedNode?)` returns `{level, card, seedNode: seedNode ?? card.seedNode, modelSeed: modelSeeds[card]}`.

## 5. Tuning targets and what the shipped model scores
PRD §10.4 (enforced by `eval.ts checkTargets`, asserted in `targets.test.ts`): Bhau's × W/E/R fails at tick 8–16; Bhau's × Q fails by tick 30 or fizzles (**ships as: fizzles**, survives tick 19, 2% ask); Mutual × all cards survives, 0 trapped, loss ≤ 80% of equity (equity = 500 AUSD), by tick 40; Bhau's × W ≥ 60% heard at failure and ≥ 70% of whales withdrew before it; peak requests per tick ≤ 200; determinism pinned by a snapshot hash.
Extra **story guard rails** in `checkStory` (not in the PRD; they keep the §5.1 demo true and stop the tuner finding degenerate "nobody panics" answers): Bhau's W/E/R have a ≥ 30-request tick, ≥ 20% of depositors ask, ≥ 50% heard, whales' mean ask tick is earlier than the small depositors'; Q still travels (≥ 20% heard); Mutual W/E/R: ≥ 12–20% ask, peak queue ≥ 10, lasts ≥ 14 ticks, ≤ 60% of small depositors ask (insured stay calm), whales go first.

| bank | card | outcome | tick | s | heard% | asked% | whales out% | peak req | peak queue | loss AUSD | loss/equity | trapped |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bhau's | Q | survived (fizzles) | 19 | 7.6 | 61 | 2 | 24 | 5 | 0 | 0 | 0% | 0 |
| Bhau's | W | **failed** | 8 | 3.2 | 60 | 33 | 96 | 137 | 0 | 967 | 193% | 335 |
| Bhau's | E | **failed** | 9 | 3.6 | 71 | 39 | 88 | 120 | 0 | 709 | 142% | 305 |
| Bhau's | R | **failed** | 10 | 4.0 | 50 | 35 | 100 | 150 | 0 | 1,503 | 301% | 325 |
| Mutual | Q | survived | 17 | 6.8 | 45 | 0 | 8 | 1 | 0 | 0 | 0% | 0 |
| Mutual | W | survived | 25 | 10.0 | 91 | 22 | 92 | 40 | 76 | 191 | 38% | 0 |
| Mutual | E | survived | 24 | 9.6 | 89 | 25 | 80 | 54 | 89 | 161 | 32% | 0 |
| Mutual | R | survived | 34 | 13.6 | 98 | 45 | 100 | 51 | 152 | 262 | 52% | 0 |
Real chain-sealed timings recorded by F: Bhau's × W tick 8, 4.2 s, 14 blocks; Mutual × W tick 25, 11.2 s, 37 blocks; Bhau's × R tick 10, 6.2 s, 20 blocks.
Known limits: with other model seeds a few cards can miss the 8–16 window by 1–2 ticks (the robustness test tolerates ≤ 25% of alternative draws missing; the shipped seeds always pass). Mutual × R at tick 34 is within 6 ticks of the 40-tick limit.

## 6. Golden vectors (contract ↔ mirror handshake, PRD §11.7)
`vectors/bank-vectors.json` (`pnpm gen:vectors`): `{ format, ledgerHash, scenarios[] }`. Each scenario: `name, level, config (decimal strings), ledger:"ledger.json", ticks:[{requested, expect:{cash, bonds, depositsOwed, insuredOwed, cumulativeLoss, served, skipped, haircutBps, queueLength, status(0..3), + extras withdrawnCount, paid, bondsSold, fireSaleLoss}}]`. A scenario ends at the first tick after which status ≠ Running; `[]` is a quiet tick. 10 scenarios: `bhau-whale-waves-failure`(6 ticks), `bhau-skips-and-quiet`(10), `bhau-everyone-at-once-mid-serve-failure`(1), `bhau-haircut-capped`(4, custom config with `haircutMaxBps 1200`), `mutual-queue-overshoot-and-drain`(13), `mutual-survival-after-quiet-ticks`(10), `mutual-quiet-streak-resets`(16), `mutual-everyone-at-once`(34), and two produced by the real model: `real-model-bhau-W`(8) and `real-model-mutual-R`(34).
**A verified (13:45): contract replays all 10 field for field, 52/52 tests green.** `vectors.test.ts` asserts the mirror reproduces its own vectors and that the set covers the hard cases (both outcomes, both levels, mid-serve failure, skips, queue overshoot, drain with empty ticks, cap-hitting haircut, cash-only tick, quiet ticks). **Regenerate vectors (`pnpm gen:vectors`) and tell A (`REQUEST → A: rerun forge test --match-contract BankVectors`) after ANY change to `bank.ts`, configs, ledger, graph, or the model** (the two real-model scenarios depend on the model).

## 7. How to run / verify (copy-paste)
From `/Users/shreyas/Desktop/blitz/app`:
- Engine tests: `pnpm vitest run src/engine` → expect 9 files / 83 tests green (~1 s).
- Whole suite: `pnpm vitest run` (246 passed, 7 skipped at 13:36; other agents' tests included) · typecheck `npx tsc -p tsconfig.app.json --noEmit` (clean for B's paths) · lint `npx oxlint src/engine scripts/tune.ts scripts/gen-model.ts scripts/gen-vectors.ts` (clean) · `pnpm build`.
- Tuner table (no search): `pnpm tune` → prints every level × card and "ALL PRD §10.4 TARGETS AND STORY GUARD RAILS PASS".
- Engine lab: `pnpm dev --port 5177 --strictPort` then open `http://localhost:5177/lab/engine` (bank + card buttons, Step/Auto/Reset, graph by state, cash/bonds/loss chart, target table).
- Regenerators: `pnpm gen:graph`, `pnpm gen:ledger`, `pnpm gen:vectors`, `pnpm gen:model` (alias now in `package.json`, added by F).
- Dev server port for B is 5177 (PRD §17.3 rule 7).

## 8. How to change the model safely (the retune procedure)
**What a change costs other agents** (always announce the new `modelHash` in this file first):
| You change | Needed afterwards | Owner |
|---|---|---|
| weights, thresholds, strengths, seed nodes, model seeds (`model.json`/`cards.json` only) | `pnpm gen:vectors` (real-model scenarios), re-record replays (`pnpm live:e2e --record`), redeploy/rebuild, re-verify chain runs | B, F, C |
| `configs.json` | all of the above + `SetLevel` on the deployed contract (and preflight checks the config hash) | A |
| `ledger.json` or `graph.json` | all of the above + `LoadLedger` (Ready only) and regenerate graph→ledger in that order | A |
| `bank.ts` | `pnpm gen:vectors` and A reruns `BankVectors`; it must still equal PRD §9 | B, A |
1. Edit nothing by hand in `model.json`. Use the tuner. `pnpm tune` shows where you are.
2. Search: `TUNE_EVALS=8000 TUNE_SEED=<n> TUNE_START='<json>' pnpm tsx scripts/tune.ts --search`. Env: `TUNE_EVALS` budget (default 6000), `TUNE_SEED` (different seeds = different deterministic search paths; run several in parallel), `TUNE_START` (JSON `{weights?, thresholds?, seeds?, strengths?}` merged over the shipped values), `TUNE_LEVELS` (`0` = search Bhau's alone, 4 fast runs; default `0,1`), `MODEL_VERSION` (default `v1-tuned`). The search is seeded simulated annealing over 14 numeric knobs (ranges in `scripts/tune.ts KNOBS`), card seed nodes (Q from hub ranks 15–44, W from the 12 biggest whales, E from top-8 hubs, R from top-4 hubs) and card strengths (kept strictly increasing ≥ 0.1 apart). Objective = PRD targets aimed **1 tick inside the 8–16 window** (so ticks 9–15) + story rules, on the shipped model seeds, plus 0.3 × the same penalty on two alternative model seeds (`1001+card`, `2002+card`) for robustness. It prints `penalty 0` when everything passes.
3. A search only prints; to write: add `--write` (writes `model.json` incl. the new `modelHash`, and updates `cards.json` seeds/strengths). To apply a known tuning without searching: `TUNE_START='{…}' TUNE_EVALS=0 pnpm tsx scripts/tune.ts --search --write`. Values are rounded to 6 decimals before reporting and writing (what is verified is what ships).
4. Then: `pnpm gen:vectors`, `rm -rf src/engine/__snapshots__ && pnpm vitest run src/engine` (re-records the determinism snapshot **deliberately**), `pnpm vitest run` whole suite, commit `app/src/engine app/scripts`, post the new hash + table here, and `REQUEST →` A (vectors), F (re-record replays), C (re-verify).
**Lessons from the search (save yourself hours):**
- Bhau's failing at tick 3–4 was the default: whales hold 4,750 of 9,500 AUSD and are the hubs; one whale leaving instantly alerts its ~70 neighbours (the "served neighbours hear" rule) and cash + 500 AUSD equity is exhausted by ~4,000 AUSD out. A slow Bhau's failure needs a whale cascade with R₀ ≈ 1.5 (a few whales per tick over ~8 ticks): low tell probability, **wide threshold spans** (whale 0.075+2u, others 1.075+1.7u) so the rising bank pressure crosses thresholds gradually, and moderate `cashW`/`goneW`.
- The 8-quiet-ticks rule ends slow runs early ("survived" at tick 8 with no requests): the seed must ask within a few ticks.
- Mutual vs Bhau's differ only through `queueW` and `insuredW` (and the bank's speed bump); search Bhau's alone first (`TUNE_LEVELS=0`), then the full objective from that point.
- Plain hill-climbing stalls; annealing with several `TUNE_SEED`s in parallel (6 processes, ~3–5 min for 10,000 evals) worked. A first pass with the old unconstrained objective found a degenerate model (Mutual with 0% asking, or 98% asking including the insured) — that is why `checkStory` exists. Do not remove it.
- The 3 alternate-seed robustness runs cost 3× per evaluation; reduce `ALT_SEEDS`/weight only if you accept less robustness.

## 9. Open items and the one pending human decision
1. **HUMAN DECISION (unanswered): Bhau's × W pace.** PRD §5.1 narrates "five seconds, thirteen Monad blocks" (~tick 13). The tuned model fails at tick 8 (3.2 s model time, 4.2 s / 14 blocks sealed live), × E tick 9, × R tick 10. This meets PRD §10.4 (8–16) at its fast end. If the human wants it slower (e.g. ~12), re-run the tuner with the window centred (change `BHAU_TICKS`/the `margin` in `eval.ts`/`tune.ts` or add a "prefer tick ≈ 12" term), then follow §8. Cost: F re-records replays, C re-verifies, A reruns BankVectors. **Do not retune without the human saying so.**
2. **E:** copy (passbook/closing card/proof panel) must use the run's measured seconds and blocks, not the script's 5.4 s / 13 blocks. Plain-language model paragraph is in the section "Plain-language model description" above.
3. **C:** re-verify fork/smoke runs on all cards for both banks against the tuned model (largest batch 150 requests → check gas limits). C's last report predated tuning.
4. **D:** stage pace notes referenced tick 3 (old fixture/untuned model); tuned model fails at ticks 8–10. D's canvas needs nothing from B.
5. **F (done at 14:15 per F's code):** `gen:model` alias exists; `runActions.selectSeed` exists and passes the seed into `defaultParams(m, level, card, seedNode)`; F's replays carry the final hash.
6. Nothing in B's own code is unfinished. No TODO/FIXME is left in `src/engine` or the scripts.

## 10. Troubleshooting
- `targets.test.ts` snapshot mismatch → the model or data changed. If deliberate: `rm -rf src/engine/__snapshots__ && pnpm vitest run src/engine`. If not, something regressed determinism; diff `pnpm tune` output.
- `model.json` hash test fails → graph/ledger/configs/cards changed without `pnpm gen:model` (or a hand edit). Run `pnpm gen:model`.
- `vectors.test.ts` fails → vectors are stale: `pnpm gen:vectors`; if the mirror itself changed, PRD §9 decides who is wrong, then tell A.
- Run ends "survived" at tick 8 with 0% asked → the seed never asks within 8 ticks (thresholds too high/seed too weak); see §8 lessons.
- A card that fails at tick ≤ 4 → whale cascade too fast; widen threshold spans or lower `goneW`/`cashW`.
- Never reuse the deleted `gen-placeholder.ts` (it would overwrite v1 data); there is none now.
- `pnpm tsx scripts/tune.ts` uses `@/` imports only via relative paths in scripts; `src/engine` imports `@/types` (resolved by `tsx` through the root tsconfig paths).

## 11. History (commit trail, `git log -- app/src/engine`)
`a7be431` B-00 placeholders · `f046d48` PRNG + mirror · `6140a31` graph v1 + ledger v1 + generators · `9d8a0cb` vectors v1 · `7661f36` panic model, stepRun, barrel swap, tuner, tests, lab, vectors v2 · `96f26ba` tidy tuned values, lint, status · `3b410e1`, `d21541c` blockers log and closing status. The interrupted first agent (usage limit) had finished B-00…B-04 and written B-05; a second agent committed B-05 and did everything else above.
