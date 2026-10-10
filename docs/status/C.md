# Agent C status (Chain)

## 14:25 update (C): everything open on C's side is resolved

### Shipped
1. **Single-writer guard** (`app/scripts/chain-lock.ts`, A's and F's request). `guardLiveBank({ agent, purpose, client, runBank, signer, status, isLocalRpc, force })` refuses to start when (a) `/tmp/run-bank.lock` is held by a live, unexpired process (stale locks from dead pids or past expiry are taken over), (b) another agent has `LIVE BANK: <agent> until HH:MM` (HH:MM still ahead) in the first 12 lines of any `docs/status/*.md`, or (c) the bank is `Running` and emitted an event in the last ~100 blocks. It returns `{ release, nonce }`; wrap every send in `guard.nonce.run(() => adapter.x())` and it stops with `NonceDriftError` if the wallet's nonce moved without us (no silent resync, and `chain:smoke` then skips its cleanup reset). Local forks are exempt. `chain:smoke` uses it for every write; `--force` skips only the `LIVE BANK:` line check. Verified live: a planted lock makes `chain:smoke --ping` exit 2 with no transaction sent. 15 unit tests.
   - **F**: `import { guardLiveBank } from './chain-lock'` in `live:e2e` (it is in `app/scripts/`, `agent: 'F'`, pass your backup key's address as `signer`).
2. **Gas default changed: `formula`** (F's throughput request). `sealTicks` now uses A's *envelope* (no `speedBump` option) with `queued` taken from the last `TickSealed.queueLengthAfter`, so no `eth_estimateGas` round trip. Fixed-cost calls still estimate. Out-of-gas is detected by replaying at the previous block (Monad's `gasUsed == gasLimit` hides it), retried **once with double the limit**, and the rest of the run uses `estimate`.
   **Before/after on the real testnet** (`chain:smoke --soak 20`, one 1-id request per tick at 400 ms cadence, same wallet, same hour, under the lock):

   | gas mode | batch time mean / median / max | ticks per tx | txs for 20 ticks | gas cost of the whole soak |
   |---|---|---|---|---|
   | `estimate` (before) | 1.11 s / 1.08 s / 1.36 s | 2.86 | 7 | 0.134 MON |
   | `formula` (after) | 0.83 s / 0.84 s / 0.95 s | 2.22 | 9 | 0.307 MON |

   About 0.27 s (25%) faster per batch. The price is a looser limit (260k vs ~100k for a 1-id tick): roughly +0.2 MON per full run, about 100 runs before the operator reaches the 15 MON floor from today's ~37 MON. `adapter.gasMode = 'estimate'` restores the old behaviour (and `chain:smoke --gas estimate`).
3. **Recorder**: `ReplayFile.rumor.sealedAtMs` is now written explicitly. It is `0` by definition (t0 is the rumor receipt); if Replay needs the rumor's own send→seal time, tell me and I'll add it as a new field.
4. **Smoke script**: a paused queue now stops the script instead of hanging forever (found when a run sat for 11 min on a revert).

### Findings from re-running the real model (B's request)
`chain:fork --run`, every card on both banks, **both** `eth_sendRawTransactionSync` and the `--no-sync` fallback; every run gap-free with the mirror matching every tick, and every outcome equal to B's tuner table:

| bank | card | outcome | ticks |
|---|---|---|---|
| Bhau's | Q | survived | 19 (trapped 0) |
| Bhau's | W | **failed** | 8 (335 trapped, 3,557.94 AUSD) |
| Bhau's | E | **failed** | 9 (305 trapped, 3,884.57 AUSD) |
| Bhau's | R | **failed** | 10 (325 trapped, 3,244.66 AUSD) |
| Mutual | Q / W / E / R | survived | 17 / 25 / 24 / 34 |

(Gas on the largest tick: 137 requests at the failing tick of W is ~714k by `estimateGas`; the 150-request peak is fine under both the estimate and the envelope.)

**Bug found and fixed along the way (matters for demo day):** a merged batch containing the failing tick reverted out of gas on the fork when `estimateGas` timed out and the fallback limit was A's *level-0 tight fit*. Fixes: the fallback is now the envelope; out-of-gas is retried once at double the limit; revert data is read from plain `eth_call` errors too (`extractRevert`), so a real revert is told apart from out-of-gas.

### REQUEST → A (data for `gasModel.ts`)
- Level 0 tight fit is **below** one real sample: `{ticks: 1, ids: 137, distinctSlots: 57, estimate: 713,808}` is the tick that fails the bank (Bhau's × W, tick 8, on a fork of the testnet state). `150k + 8.5k·1 + 3.8k·137 = 679,100` < 713,808 (by 5%). The failure path (trapped computation) costs extra that does not scale with ids. C now uses the envelope, so nothing is broken, but anyone who switches to `speedBump: false` should know. Other level-0 rows I have sit under your fit.
- Not asking for a change. If you refit, include a failing-tick sample.

### Blocked by
- Nothing.

### Notes for later
- `LIVE BANK:` convention is in force. C will write `LIVE BANK: C until HH:MM` at the top of this file before any live send and clear it afterwards (and the lock does the rest).
- Operator MON after today's tests: ~36.7 MON (backup 75). Refuse threshold is 10.5, warn 15.


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
- Fork (anvil fork of testnet, real engine from B-07): `chain:fork --run --card 3 --level 1` seals **36 ticks gap-free, mirror 36/36, Monad Mutual survives at tick 36**, through both `eth_sendRawTransactionSync` and the `--no-sync` fallback. Level 0 with cards 1 and 3 fails the bank at tick 3 (trapped 429 and 336); card 0 survives at tick 8 (nobody panics). (That was before B's tuned model landed; B and F now report Bhau's × W failing at tick 8. I have not re-run the real-model smoke since.)
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

- ~~REQUEST → F: `chain:fork` script~~ done (`0fca95e`). `chain:smoke` takes `--ping | --mini | --run | --soak N`.
- **REQUEST → F**: when B's real `stepRun` lands, run `pnpm chain:smoke --run --card 0` (and 1) for the 15+ tick check on the real model. With the fixture engine every card ends by tick 3–8.
- **REQUEST → A**: nothing blocking. Re-run the gas fit if the contract changes; the smoke script prints the comparison table.
- **FYI → A/F**: the shared bank is a single resource. My smoke runs reset it (they `reset()` first if it isn't `ready`). If you are mid-run on testnet, say so here before I run `--mini`.

### Blocked by (14:00, historical; all three resolved at 14:25, see above)
1. **Shared testnet bank has several writers on one operator key.** A reported nonce collisions ("EOA nonce changed unexpectedly") and `runId` climbing 2 → 27; F's `live:e2e`, A's calibration and my smoke runs all write to the same bank. I won't send another live transaction until the writers agree on a protocol. **Owner: F + A** (agree on the `LIVE BANK: <agent> until HH:MM` line at the top of each status file; see their files). **C's part (queued, waiting for the go):** advisory lock `/tmp/run-bank.lock` and a refuse-to-start check in `chain:smoke` / `chain:fork`, and fail loudly on nonce drift, as A asked. Until then C only runs read-only smoke on testnet and uses `pnpm chain:fork` for everything else.
2. **No final model yet.** My last real-engine smoke ran on the pre-tuning model. A live re-check of the 15+ tick path on the final model is F's `live:e2e` result (Mutual × W t25, × R t34, both mirror N/N), which is enough for me; I'd only re-run `--run` if B/A change `model.json`, `configs.json` or `ledger.json`. **Owner: B** (say when it is final).
3. **Real rehearsal gas numbers.** `status/A.md` offers to refine the level-1 envelope from C's rehearsal data. I have the level-0 table above but none for level 1 on the tuned model. F's e2e has the batch sizes (biggest 387 requests = 1.41M gas) but not a per-batch log. **Owner: F** (run `pnpm live:e2e` and paste `adapter.gasLog`, or let me run it when the bank is free).

### Next
- P2 items (none defined for C in the backlog beyond C-13). Remaining time goes to: a rehearsal with the real engine once B-07 lands, WSS/Ankr behaviour on venue WiFi, and anything F finds when wiring Live mode.

## 13:45 note from A (coordination, not a contract blocker)
- **REQUEST → C**: the operator key is used by several processes at once (your `chain:smoke`/`chain:fork`, F's `live:e2e`, and my earlier gas calibration). We hit "EOA nonce changed unexpectedly" and `WrongStatus` from interleaved resets while `runId` climbed 2 → 27. Please (1) add a simple advisory lock to the smoke scripts (e.g. refuse to start if the bank is `Running` and the last `Ping`/`TickSealed` event is < 60 s old, or take a lock file at `/tmp/run-bank.lock`), and (2) make them fail loudly instead of retrying silently when the nonce moves. Contracts are unchanged; no A change is needed. I have stopped sending transactions to the live bank.
- Your gas comparison table is welcome: if the formula is below any real sample, tell me the `{ticks, ids, estimate}` row and I'll refit `app/src/chain/gasModel.ts` (A's file).

## REQUESTS → C (from B, 13:45): done at 14:25 (see the table above)
1. Your note "Level 0 with cards 1 and 3 fails the bank at tick 3 … B's tuning" is out of date. The tuned model (`modelHash 0xebcb6f1f…`) fails Bhau's × W/E/R at ticks 8/9/10 and Monad Mutual survives at ticks 17–34. If you have time, rerun `chain:fork --run` / `chain:smoke --run` for cards 0–3 on both levels and report any mirror mismatch or timing surprise (peak batch is 150 requests, so check gas limits on the largest tick).
2. `RumorStarted.modelHash` must be `model.modelHash` (now the real hash, was a fixture value) and `modelSeed` must be `defaultParams(...).modelSeed`; the controller already does this.

## REQUESTS → C (from F, 14:50): 1 lock shipped, 2 gas default changed to formula (before/after above), 3 waiting on F's gas rows
F is idle on the chain and will stay off the live bank until these are settled.
1. **Writer lock (blocks F's further live runs).** F will not send another live transaction (re-recording replays, rehearsal runs, `live:e2e`) until your `/tmp/run-bank.lock` advisory lock and the "refuse to start when a `LIVE BANK:` line is up / bank is `Running` with a recent event" check are in `chain:smoke`, `chain:fork` and `chain-*` scripts. **Please ship it now: the human said they'd tell you "go" once agents are aligned; F's side is aligned (see F.md top line).** F will make `pnpm live:e2e` take the same lock and use the **backup key** per A's suggestion, so F and your smoke never share a nonce.
2. **Sealing throughput vs the 400 ms clock.** In a real browser run (production build, home network) healthy Mutual runs show amber "Sealing delayed" for several seconds: batches carry 2–3 ticks and take 0.9–1.6 s, which is about the rate ticks are produced, so the engine lead keeps touching `MAX_LEAD = 6`. Your note says `estimate` mode adds one `eth_estimateGas` (100–250 ms) per send. Can you decide whether to default to `formula` gas mode now (A's formula is above every sample; OOG falls back to `estimate`), or cache the estimate per (ticks, ids) shape, to shave that round trip? Owner: C (A only if the formula needs to change). Please report the before/after batch time here.
3. **Gas rows for A.** F will print `adapter.gasLog` in `live:e2e` after the lock lands and paste the level-1 rows into your status file (your 14:00 ask). Not blocking.

## REPLY → C (from F, 14:55): sealedAtMs written (0), lock API described above
- Using your `scripts/chain-lock.ts` in `live:e2e` (backup key by default, lock + `LIVE BANK:` check). F sent no live transactions in this pass.
- **REQUEST → C (small, additive)**: `ReplayFile.rumor` now has optional `sealedAtMs?: number` (ms after the rumor receipt, `0` if omitted; `types.ts`, F). Please have `createRecorder().begin()` set it (the rumor's sealed time relative to the recorder's t0) so Replay can show the real time. Playback already reads it.
