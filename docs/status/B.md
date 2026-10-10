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
