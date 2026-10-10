# Agent C status (Chain)

## 13:25 update: CP1 reached (live adapter + SealQueue seal on testnet)

**All P0 and P1 items are done** (C-00 … C-13). `pnpm chain:smoke --mini` passes on Monad testnet (chain 10143), and a 20-tick soak through the SealQueue sealed gap-free.

### Done

| Item | What | Where |
|---|---|---|
| C-00 | Network config, failover clients (presenter / spectator order, 4 s timeouts, no batching), explorer override | `config/network.ts`, `chain/clients.ts`, `chain/deployment.ts` |
| C-01 | Operator keys: sessionStorage then env, validated, address only; leak test | `chain/keys.ts` |
| C-02 | Mock adapter: `applyTick` mirror, 450–900 ms latency, fake blocks, `simulated: true`, `txHash: null`, contract-accurate reverts | `chain/mockAdapter.ts` |
| C-03 | Live adapter: sign locally, `eth_sendRawTransactionSync`, held-tx re-broadcast, nonce resync, sync-method fallback, receipt decode | `chain/liveAdapter.ts`, `chain/decode.ts` |
| C-04 | SealQueue per §12.4 | `chain/sealQueue.ts` |
| C-05 | `translateError` (every §12.6 row) | `chain/errors.ts` |
| C-06 | Preflight (every §12.5 check, `critical` flags, never throws) | `chain/preflight.ts` |
| C-07 | Block feed: WSS newHeads, 400 ms polling fallback, finalized at 1 Hz, one shared subscription | `chain/blocks.ts` |
| C-08 | Smoke script | `scripts/chain-smoke.ts` |
| C-09 | Recorder, `listReplays`, `loadReplay` | `chain/recorder.ts` |
| C-10 | Spectator (≤100-block chunks, catch-up of a run in progress, 429 backoff, dedupe) | `chain/spectator.ts` |
| C-11 | Local fork harness (anvil fork of testnet; runs the smoke test with and without the sync method) | `scripts/chain-fork.ts` |
| C-12 | `/lab/chain` | `chain/ChainLab.tsx` |
| C-13 | Gas log per batch (console + `adapter.gasLog`) | `chain/liveAdapter.ts` |

Tests: `pnpm vitest run src/chain` → 80 pass, 7 network-tagged skipped (`CHAIN_NETWORK_TESTS=1` runs them; all pass). Typecheck and lint are clean for `chain/`.
`liveAdapter.test.ts` runs the real send path against a scripted JSON-RPC node (timeouts, late receipts, dropped tx, nonce drift, unsupported sync method, reverts, low balance).

### CP1 output (`pnpm chain:smoke --mini`, testnet, 10 Oct 13:09)

```
RPC latency: QuickNode 637 ms · Monad Foundation 445 ms · Ankr 352 ms (all chain 10143)
operator 0x85db…6b10 · backup 0xFeAf…690A
RunBank 0x2cD8…F41D · ledger hash matches the engine
✓ ping      1.18 s  block 69768149  0x3a8a91bc7b…
✓ reset     0.80 s  block 69768152  0x07ef0be548…   (bank was left Running at tick 2 by an earlier test)
✓ setLevel  1.22 s  block 69768156  0x4e31755b9b…
✓ rumor     1.04 s  block 69768160  0x65384b3b5e…
✓ ticks 1-3 0.90 s  block 69768163  0x696be54db8…   3 TickSealed events, mirror 3/3
✓ reset     0.92 s  block 69768166  0xc7c9a5083d…   bank ready, holds 10,000 AUSD
OK
```

Other live runs (all `OK`, bank back to `ready` each time):
- `--mini --stress` (60 synthetic ids, 3 ticks): 1.21 s, gas limit 393,486.
- `--run --card 3` (full fixture run through the SealQueue): ticks 1 + 2–3, **BankFailed at tick 3, trapped 336 / 3,573 AUSD**, mirror 3/3. Same for cards 1 and 2. Card 0 survives at tick 8 (8/8).
- **`--soak 20`**: 20 ticks in 11 transactions over 9.7 s, **gap-free**, 0.6–1.2 s per transaction.
- Fork (anvil fork of testnet, real engine from B-07): `chain:fork --run --card 3 --level 1` seals **36 ticks gap-free, mirror 36/36, Monad Mutual survives at tick 36**, through both `eth_sendRawTransactionSync` and the `--no-sync` fallback. Level 0 with cards 1 and 3 fails the bank at tick 3 (trapped 429 and 336); card 0 survives at tick 8 (nobody panics). That is still not the ~13-tick failure the PRD wants: B's tuning, not C's.
- On the real testnet someone else's live run reached run 16 / tick 36 (survived) through this adapter while I was testing, so the 15+ tick check also holds on chain.
- Late fix: if `estimateGas` fails for a transport reason (not a revert, not out-of-funds) the send now uses A's fixed `callGas` (or the tick formula) instead of failing. Found on the fork, where `estimateGas` for a level-1 `setLevel` takes 10+ s because anvil fetches the whole ledger cold.

### Gas: calibration data for A

- **Monad receipts report `gasUsed == gas limit`** (you are charged for the limit), so `gasUsed` can't calibrate anything. `estimate` (from `eth_estimateGas`) is the real cost; the gas log records it next to the formula.
- Level 0, `estimate`: 1 tick/0 ids 58,806 · 2/0 67,219 · 3/0 75,632 · 1 tick/4 ids 165,854 · 3 ticks/60 ids 357,715 · 2 ticks/160 ids (58 slots) 709,337. A's formula (`speedBump: false`) sits above all of these, so it looks fine.
- Default gas mode is **`estimate` (estimate + 10%)**, not `formula`, even though `calibrated === true`. Reason: A's own note says level-1 cost depends on the speed-bump queue, and a too-tight limit costs a reverted, still-charged transaction. `adapter.gasMode = 'formula'` switches it (level-aware via `speedBump`); an out-of-gas revert flips back to `estimate` and retries once. Cost of estimating: one extra `eth_estimateGas` (~100–250 ms) per send.
- Cost per full demo so far: ~0.05–0.13 MON per run, plus ~0.07 MON for setLevel/reset. Operator was 40.95 MON before my tests and ~38.4 after ~25 sends.

### Interface notes (for F, D, E)

- `createLiveAdapter` now returns `LiveAdapter` (extends `ChainAdapter`): `gasLog`, `gasMode`, `usingBackup`, `primaryAddress`, `backupAddress`, `lastRpc()`, `dispose()`. Option `syncSend: false` forces the send+poll path. `ChainAdapter.recoverTicks?` is additive (SealQueue's mismatch recovery uses it).
- **SealQueue only calls `onError` when it has really paused** (revert, desync, timeout retries exhausted, or an outage longer than 6 s). Timeouts and offline blips are silent: watch `onHealth` (`delayed` / `offline`). F's `onQueueError` pauses the stage on any error, which is the right fit.
- `retry()` resends the same batch. After a timeout the same batch is resent unchanged so the adapter re-broadcasts the same signed tx.
- Mock `reset()` from `Ready` throws `WrongStatus` like the contract (controller only resets when the snapshot isn't `ready`).
- Mock records have `txHash: null`; the events inside the result carry the zero hash because the frozen `RumorEvent` / `TickSealedEvent` types need a `Hex`. D: key "simulated" off `record.simulated`.
- Key loading: Node (tsx, vitest) reads `process.env`, the browser reads `import.meta.env`. A real `app/.env.local` is picked up by vitest; my tests blank it.
- Barrel additions: `CHAIN_LIMITS`, `monadChain`, `getPublicClient`, `getSpectatorClient`, `createClientBundle`, `endpointsFor`, `createBlockFeed`, `runPreflight`, error classes (`ChainTimeoutError`, `RunBankRevert`, `LowBalanceError`, …), `normalizePk`.
- Low balance: `startRumor` refuses below 10.5 MON with `LowBalanceError`, which translates to "…Switch to the backup key." (action `backup`).

### REQUEST →

- **REQUEST → F**: add `"chain:fork": "tsx --env-file=.env.local scripts/chain-fork.ts"` to `app/package.json`. Until then: `pnpm tsx --env-file=.env.local scripts/chain-fork.ts --mini`. Also `chain:smoke` takes `--ping | --mini | --run | --soak N`.
- **REQUEST → F**: when B's real `stepRun` lands, run `pnpm chain:smoke --run --card 0` (and 1) for the 15+ tick check on the real model. With the fixture engine every card ends by tick 3–8.
- **REQUEST → A**: nothing blocking. Re-run the gas fit if the contract changes; the smoke script prints the comparison table.
- **FYI → A/F**: the shared bank is a single resource. My smoke runs reset it (they `reset()` first if it isn't `ready`). If you are mid-run on testnet, say so here before I run `--mini`.

### Blocked by
- Nothing.

### Next
- P2 items (none defined for C in the backlog beyond C-13). Remaining time goes to: a rehearsal with the real engine once B-07 lands, WSS/Ankr behaviour on venue WiFi, and anything F finds when wiring Live mode.
