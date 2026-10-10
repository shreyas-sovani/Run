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
