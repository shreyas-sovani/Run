# Agent D status (Stage UI)

## 13:40 — all P0, P1 and the P2s that don't need other agents are in (D, resumed by a fresh agent after a limit stop)

**Done** (everything under `app/src/ui/stage/**`; `pnpm typecheck` and `oxlint` are clean for these paths; `pnpm vitest run src/ui/stage` = 19 tests)

| Task | Where | Notes |
|---|---|---|
| D-00 skeleton | `StageScreen.tsx`, `StageLab.tsx` | Grid per §5.2: top bar, 62/38 main, ticker. The stage height is `100dvh` minus whatever the shell stacks above it (`--stage-top`, measured; falls back to E's `--banner-h`), so the ModeBanner never pushes the ticker off screen. `/lab/stage` has scenario buttons (fail, survive, idle, verdict, error, passbook, help), phase and mode forcing, and window / 1280×720 / 1920×1080 / 375×812 frames (iframes; `?embed=1&scenario=…`). |
| D-01 canvas | `NetworkCanvas.tsx`, `networkRenderer.ts`, `canvasMath.ts` | Canvas 2D, DPR-aware (capped at 2), letterboxed square. rAF loop reads `getRunView()`; React state is only the aria-label. Static edges cached offscreen. It repaints only when something is changing. Node encoding per §14.3 (dot / ring / filled+pulse / ring+tail / hollow / slate ×, violet halo for insured on Monad Mutual), radius ∝ √balance, 250 ms colour lerp. Effects come from diffing `nodeState`/`heardAt` (not `newly*`): amber ripple ring + edge flash for 600 ms, withdrawal particles to the vault column's near edge (a DOM rect read when particles spawn). Reduced motion (UI flag or OS): no ripples, no pulse, no particles, instant state change. Colours are read from E's CSS tokens at mount. |
| D-02 vault | `VaultPanel.tsx` | Bar (cash solid, bonds hatched), loss slice that slides out into a "Street" column, `fmtAusd` + `fmtUsdScaled`, scale label, haircut, out the door, status lamp (dot + text), real-balance line from `onchain.ausdHeld` in non-Practice modes, vermilion frame flash + `sfx.alarm(true)` the first time cash hits zero, off at the outcome / reset / unmount. |
| D-03 top bar | `TopBar.tsx` | Wordmark, bank selector with `1`/`2` badges and defence tags ("Reset and switch" after an outcome), `Q W E R` chits (selected one lifts), one primary `Button` per §13.2 (own pending label per phase; paused offers Retry / backup key / recorded run / Reset), clock written to the DOM from rAF, block number, `ModeChip` (with `recordedAt`). Selectors lock in Replay/Spectate and during a run. Inline `ErrorStrip` handles every `UiError.action.run` (retry, reset, replay → `setMode('replay')`, ops → `/ops`, backup). |
| D-04 ticker | `SealTicker.tsx` | Latest 6 seals newest first, `TxLink` on real ones, "simulated · not onchain" on simulated ones, "sealing tick N…" while ahead, amber when health is `delayed`/`paused`, MICR-style inline-SVG separators (P2). `HealthChip` lives at its right end (see "Deviations"). |
| D-05 queue | `QueueStrip.tsx` | Monad Mutual only; inline-SVG people, max 40 then "+N", people leave from the head (motion `AnimatePresence`), memoised items. |
| D-06 outcome | `OutcomeLayer.tsx` | "Sealing the verdict…" freeze, E's `Stamp` only when `outcome.sealed` (or Practice), `sfx.thud()` + a 180 ms ±6 px stage shake on `onImpact` (WAAPI, skipped under reduced motion), passbook 400 ms later. A 1.2 s fallback opens the passbook if the stamp never reports an impact. The stamp docks (steps up and shrinks) while the passbook is open so neither hides the other. |
| D-07 passbook | `Passbook.tsx` | WaMu / Wachovia / SVB rows from `copy.passbook.rows` (shape `bank/amount/span/note`) + "this bank" row (display-scale amount, its time, blocks or "simulated"). Doto entries, bars on a log time scale with a labelled axis (`C` toggles; closed state is `inert`). |
| D-08 help | `HelpOverlay.tsx` | From `HOTKEYS`; focus moves in and returns; click outside or `Esc` closes. `kbd` badges also on bank segments, chits, primary buttons. |
| D-09 responsive + focus | all `.module.css` | 1280×720: nothing clipped, nothing under 18 px (top bar, vault and queue compact under `max-height: 800px`). 375 px: network square on top, key and vault below, ticker shows the latest seal, chits in two rows, overlays go `position: fixed`. Focus rings come from E's global `:focus-visible`; the bank segments use an inset ring because the group clips. `aria-keyshortcuts` on the hotkey buttons. |
| D-10 performance | | Headless Chrome 1920×1080, fake run, busiest second: **60 fps, p95 16.7 ms, max 16.8 ms, no long tasks** (steady state). Per-component renders during a run (React commit walk): VaultPanel ~4/s, BlockLine ~4/s, SealTicker ~2/s, QueueStrip ~2/s, nothing over 5/s. Canvas paint total ≈ 40 ms over a 2.5 s run. |
| D-11 P2 | | Done: MICR-style ticker marks (inline SVG). Done on the D side only: click a depositor to choose who starts the rumor (see REQUEST → F). Not done: closing card (E-10 owns the component; needs F's hotkey, see REQUEST). |

**Screens checked** (headless Chrome via CDP, screenshots critiqued): idle, mid-run, verdict freeze, BANK FAILED + passbook, survived with queue, paused with error, help, reduced motion — at 1920×1080, 1280×720 and 375×812.
- 1920×1080: reads in five seconds from the back of a room; the vault figures and the stamp are the loudest things on screen. Calm nodes are dark and heavy at idle, which is the intent ("500 depositors"). Weak spot: with the real engine Bhau's Bank fails in ~2.3 s, so the amber ripple phase is short.
- 1280×720: tightest spot is the top bar (two rows, ~24% of height). It holds, but the paused state wraps its four remedies onto their own row.
- 375 px: no horizontal scroll (`scrollWidth` = 375).

**Interface notes**
- Everything the stage prints goes through `stageCopy.ts`. It reads `@/ui/copy` first (`copy.stage.*` overrides, then `banks`, `cards`, `buttons`, `phases`, `chips`, `stamp`, `passbook`, `scale`, `errorActions`) and only then a local default. Components contain no string literals and no colour literals.
- `StageLab.tsx` imports `patchRun` / `runStore` from `@/app/state` (F's leaf module) because the public store can't force a phase. It is the only stage file that does.
- The canvas reads `model` from the store; before the controller sets it (it does at init) it draws nothing.
- The stage passes `shake={false}` to E's `Stamp` and does its own shake, so the screen doesn't shake twice.

**Deviations from the backlog (deliberate)**
- `HealthChip` sits at the right end of the ticker, not in the top bar. At 1280 the top bar had no room for two chips plus the clock, and the chip is about sealing, which is what the ticker is. It still gets `health` and `sealedTick`; the block number is shown once, next to the clock.
- The legend is a left column beside the canvas on desktop (below it on phones). The graph is a letterboxed square, so that space was empty.

**Blocked by**: nothing hard. D can't finish these without others (lodged in their status files at 13:45): E (copy `stage` group, `sfx.ensure` stall), F (mount `ClosingCardHost` in `routes.tsx`, fill replay `requestedCount`, optional `selectSeed`). B has an FYI about run pace.

**REQUEST → E**
1. Optional: add a `stage` group to `copy.ts` so the defaults in `stageCopy.ts` become dead code. Keys and current defaults (placeholders in `{braces}`):
   `wordmark` RUN! · `bankGroup` Bank · `rumorGroup` Rumor · `bankSwitchTag` Reset and switch · `blockLabel` block · `blockNone` — · `timerLabel` Run clock · `stageLabel` Bank run stage · `legendTitle` Depositors · `legendCalm` Hasn't heard · `legendHeard` Heard the rumor · `legendPanicking` Panicking · `legendQueued` In the queue · `legendWithdrawn` Withdrew · `legendTrapped` Trapped · `legendInsured` Fully insured · `legendSize` Bigger dot = bigger balance · `canvasAriaIdle` {total} depositors. The bank is open. · `canvasAriaOutcome` {withdrew} of {total} depositors withdrew; {trapped} trapped. · `vaultTitleOnchain` Vault · real AUSD on Monad · `vaultTitleSim` Vault · simulated · `cash` cash · `bonds` bonds · `loss` fire-sale loss · `haircut` haircut · `outTheDoor` out the door · `street` Street · `heldOnchain` {amount} held by the contract · live from Monad · `heldSim` Practice: simulated balance · `heldReplay` Recorded from Monad testnet · `vaultBarLabel` Vault: {cash} cash, {bonds} bonds, {loss} lost in fire sales · `queueTitle` Outside the teller window · `queueEmpty` Nobody waiting · `queueMore` +{n} · `queueCap` Pays at most {pct} of deposits per block · `queueAria` {n} depositors waiting · `tickerLabel` Seals · `tickOne` tick {a} · `tickMany` tick {a}–{b} · `withdrew` {n} withdrew · `sealedIn` sealed {t} · `finalized` ✓ finalized · `finalizing` finalizing… · `simulatedSeal` simulated · not onchain · `sealingTick` sealing tick {n}… · `sealingDelayed` Sealing delayed · `sublineSim` simulated · {ticks} ticks · `verdictWaiting` Waiting for Monad to seal tick {n} · `verdictWaitingSim` Settling the books · `outcomeAnnounceFailed` Bank failed after {s}. · `outcomeAnnounceSurvived` Bank survived after {s}. · `passbookSub` How long the biggest bank runs took · `logScale` log scale · `thisBank` This bank · `failedAfter` failed · `survivedAfter` survived · `blocksNote` {n} Monad blocks · `simulatedNote` simulated · `noRunYet` Run the bank to add its row · `axisTicks` ['1 s','1 min','1 h','1 day','1 week'] · `helpTitle` Keyboard shortcuts · `helpHint` Press Esc to close.
   Also `stage.sealKinds` (`setLevel`, `rumor`, `ticks`, `reset`, `ping`, `fund`, `loadLedger`) for non-tick seal rows (defaults: bank switched, rumor started, ticks, bank reset, test transaction, bank funded, ledger loaded). The passbook already reads your `passbook.rows` (`bank/amount/span/note`).
2. `sfx.ensure()` (`brand/sfx.ts`, line ~30) blocked the main thread for ~450 ms the first time `alarm(true)` ran when no key had been pressed first (CPU profile, lab click). With a hotkey press `unlock()` runs first so this is probably fine live, but pre-building the buffers inside `unlock()` (or a lazy idle callback) would remove the risk of a dropped frame at the moment cash hits zero.

**REQUEST → F**
1. (Done by F, now used: see 14:00 update.) For the P2 "pick who starts the rumor": `runActions.selectSeed(node: number | null)` (stores a seed node used by `start()` instead of the card's `seedNode`; additive). The canvas already hit-tests, shows a hover ring and a violet selected ring, and calls `runActions.selectSeed` only if it exists (feature-detected), so nothing breaks until you add it. Optional `RunView.seedNode: number | null` would let the ring survive a re-mount.
2. (Done by F: `<ClosingCardHost />` is mounted in `routes.tsx`; D mounts nothing.)
3. (Superseded: B's tuned model now fails Bhau's × W at tick 8, ~4.2 s; see 14:00 update.)

**Next**: re-check against E's closing card and F's replays when they land; fix requests.

## REQUESTS → D (from B, 13:45)
1. Your note "with the real engine Bhau's Bank + W fails at tick 3 (~2.3 s)" is out of date: the tuned model (`modelHash 0xebcb6f1f…`) fails Bhau's × W at tick 8 (3.2 s; ~4.2 s sealed on chain), × E at tick 9, × R at tick 10. The rumor-spreading phase is therefore longer; please re-check the ripple/whales-first timing against `/lab/engine` and the recorded replays rather than the old numbers.
2. Card seed nodes changed (Q 35, W 39, E 3, R 22). Never hard-code ids; read `defaultParams(model, level, card).seedNode`.
3. Optional, for "pick who starts the rumor": `bestSeeds(model, card, count = 8)` from `@/engine` returns the depositors whose rumor ruins Bhau's Bank soonest, best first (first call runs ~40 sims, memoised). You could ring them as a hint.
4. `SimFrame.panic[i]` is `score / threshold` clamped to [0, 2]; `goneAt[i]` is the tick node i asked for its money (-1 if not). `newlyServed` excludes ids trapped by a mid-serve failure.

## REQUESTS → D (from F, 14:50)
Nothing of D's blocks F. F is working your 13:45 asks in F's own queue: `selectSeed` + `RunView.seedNode`, mounting E's `<ClosingCardHost />` in the shell, and `requestedCount` for replay seals. Remaining items only a person looking at the real screen can close, and they are D's to run and record here (F can't judge them from a headless page):
1. Screenshots at **1280×720, 1920×1080 and 375×812** for idle, mid-run, failed, survived, proof open, passbook open, plus `/ops` and `/replay` (E for the last two). Nothing clipped; nothing on the stage under 18 px.
2. **Reduced motion** (DevTools emulation): no shake, no particles, stamp fades.
3. **Keyboard-only** pass: every control reachable with a visible focus ring.
4. In **Live**, the "Sealing delayed" chip appears during healthy runs (see REQUEST → C #2); once C changes sealing, please confirm the amber state looks calm rather than alarming (it is honest, not an error).

## 14:00 — update (D): remaining items closed, verification matrix recorded

**Done**
- **Seed pick (P2) is live**: F added `runActions.selectSeed` and `RunView.seedNode`. The canvas now drives the violet selected ring from `view.seedNode` (before the run only; clears on start/reset) and calls `selectSeed` directly on click (toggle to clear); hover ring + pointer cursor. Verified by a synthetic click in `/lab/stage`.
- **Mobile outcome**: on 375 px the stamp docks smaller at the top while the passbook (max 66% height, scrolls inside) takes the lower part; before, they overlapped the passbook title.
- **Replay**: the vault caption now reads "Recorded from Monad testnet" (F's REQUEST); chip shows the recording time; the ticker links real `TxLink`s.
- **B's notes read**: seeds are never hard-coded (the canvas only draws `frame.nodeState`); the tuned model (Bhau's × W fails at tick 8, ~4.2 s) makes the rumor phase visible: amber rings spread along edges, whales go vermilion first, cash-zero flash. `bestSeeds()` hint rings NOT done: its first call runs ~40 simulations on the main thread, a frame-drop risk next to the demo moment. Left as an idea.
- **E's notes read**: nothing further for D (already passing `recordedAt`, `shake={false}`, using `copy.passbook.rows`).

**F's verification asks (headless Chrome via CDP, screenshots read and critiqued)**
| Ask | Result |
|---|---|
| Screens at 1280×720, 1920×1080, 375×812: idle, mid-run, failed, survived, proof open, passbook open | All captured. 1920: idle, mid (rumor spreading), failed + passbook, survived (round "PAID IN FULL" + passbook), proof open over the vault column (recorded run: "8 / 8 ticks: screen and chain agree", 4.2 s, 14 Monad blocks). 1280: idle, mid, verdict freeze, failed + passbook, proof open. 375: idle, mid, failed + passbook. Nothing clipped; nothing on the stage under 18 px; no horizontal scroll at 375 (`scrollWidth` 375). `/ops` and `/replay` picker are E's; not reviewed by D. |
| Reduced motion | No ripples, pulses, particles; state changes instant; stage shake skipped; stamp fade is E's. |
| Keyboard only | Tab order 1, 2, Q, W, E, R, Start, then wraps; every control shows a 3 px ring (selected bank segment uses an inset light ring; the unselected one an ink ring); `Esc`/`H` handled by F's hotkeys; Passbook and Help are `inert`/removed when closed so they can't trap focus. |
| Live "Sealing delayed" amber | The ticker row goes amber (`--rumor-wash`, amber top rule, label "Sealing delayed") only when `health` is `delayed`/`paused`; it is calm, not red, and clears on its own. The real cause is C's batch time (C.md #2); no D change needed. Once C lands the faster path, D only needs a visual re-check. |

**Blocked by**: nothing.
**Still open on other agents** (all optional/polish): E `copy.stage` group + `sfx.ensure()` pre-build (see "REQUEST → E"); F `requestedCount` on replay seals (ticker still prints "0 withdrew" for batches; check after F's change); C batch time (amber "Sealing delayed").
