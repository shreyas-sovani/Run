# Agent B status (Engine)

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
