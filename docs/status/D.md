# Agent D status: Stage UI (the projector screen)

Last updated 14:25. **This file is written to be read cold, with no other context.** Section 1 says what state D is in; section 2 lists every open item with the owner and the exact action; the rest is the reference you need to maintain, extend or debug the stage.

---

## 1. State in one paragraph

D's backlog (BACKLOG.md "Workstream D": D-00 … D-11, P0 + P1 + the P2s that don't need other agents) is **complete and committed** (last D commit `6603b7a`, all files under `app/src/ui/stage/**`). `pnpm typecheck` and `oxlint` are clean for these paths, `pnpm vitest run src/ui/stage` passes (19 tests: `canvasMath.test.ts` 12, `stageCopy.test.ts` 7), the whole UI suite passes (72 tests at 14:19). The stage has been exercised end to end against the fake run (`/lab/stage`), the real tuned engine in Practice, and recorded real-testnet replays (`/replay/:id`), at 1920×1080, 1280×720 and 375×812. **Nothing blocks D.** What remains is optional polish owned by other agents (section 2) plus one visual re-check that only makes sense after C changes sealing speed.

---

## 1b. Follow-up pass (15:55) — D: done

Scope: the short follow-up from the human (F's live UI check → judge the amber row; overlay check; checks; commit).

**1. Amber "Sealing delayed" — judged calm, NOT changed.** F's live numbers (docs/status/F.md, "Live UI check"): Bhau's × W **0** amber stretches; Monad Mutual × W **2** stretches (2.6 s and 0.8 s, 3.4 s of a 13.7 s run), "calm and cleared by itself both times". Polled every 200 ms, F saw no on/off flicker, only two clean stretches; a 600 ms debounce would not remove either (the 0.8 s one would still show), and a debounce that restarts on every clear could hide a delay that is mostly-but-not-continuously present, which the human forbade. So: no debounce, no change to `SealTicker`. For the record, the code path that could flicker in theory is `controller.tickOnce` setting `health: 'delayed'` (lead ≥ `MAX_LEAD`) while `sealQueue` sets `'sealing'` at each batch boundary; F's measurement shows that does not happen in practice with C's formula-gas default. If a future run shows rapid amber/non-amber alternation, the right fix is in the stage only: keep the row amber until `health` has been non-delayed for ~600 ms (clear-delay), never a show-delay.

**2. Overlay check (replay `/replay/bhaus-w-failed-202610100809`, 1280×720 and 1920×1080, after the stamp): two real problems found and fixed inside `ui/stage`; one found that belongs to others.** Method: after the stamp and auto-opened passbook, press `H`, `P`, `L`, `C` in turn and, for every visible Close/Dismiss button, test `document.elementFromPoint(centre)` is that button (script probe, plus screenshots).
- **Fixed — passbook Close hidden under E's proof panel.** The proof panel covers the right 480 px; the passbook's Close sat at the right edge (x≈1801 at 1920, x≈1163 at 1280) so with `P` open it was unreachable. `Passbook` now reads `proofOpen` and stops short of the panel (`.beside { right: calc(min(480px, 100vw) + var(--sp-3)) }`, animated); phones are unchanged (proof is a bottom sheet there). Verified reachable at both sizes (Close moves to x≈1333 at 1920, x≈695 at 1280).
- **Fixed — help dialog under the proof panel and under the stamp.** With `P` open the help card's Close was partly under the panel at 1280; the stamp (z 50) also painted over the help text. `HelpOverlay` now centres in the space left of the proof panel (`.beside`) and has `z-index: calc(var(--z-stamp) + 1)` so it is above the stamp and the passbook. Verified: help Close reachable at both sizes with proof + passbook also open; all three Close buttons are reachable at the same time (the lower modal is simply covered by the dim layer, which is expected).
- **Dependency to remember:** the 480 px comes from E's `panels/ProofPanel.module.css` (`width: min(480px, 100vw)`). If E changes it, update `.beside` in `Passbook.module.css` and `HelpOverlay.module.css` (comments there say so).
- **Not D's — REQUEST → E:** E's ModeBanner "Dismiss banner" button (top right) sits under the open proof panel (not reachable while `P` is open; fine once it closes). Optional: give the banner a right inset while the proof panel is open, or accept it.
- **Not D's — REQUEST → F (or E):** the closing card (`L`, E's `ClosingCardHost`, fixed, opaque, full screen) is modal, but F's global hotkeys keep working under it: pressing `H`, `P` or `C` while it is up opens those overlays invisibly underneath, and after `Esc` (which closes all) or closing the card they can pop up unexpectedly. Suggested: ignore `H`/`P`/`C` (and `1 2 Q W E R Enter X`) while the closing card is open, or have `L` close other overlays first. The card's own Close (Esc badge, top right) is always reachable.

**3. Checks:** `pnpm vitest run src/ui/stage` 19 passed; `pnpm typecheck` no errors under `ui/stage`; `npx oxlint src/ui/stage` clean. Screenshots read: `/tmp/v3/` (1920 and 1280, proof + passbook + help).

**4. Commit:** only `app/src/ui/stage/**` and this file. No transactions sent, no key printed, Enter never pressed on `/`.

**D: done** — F can deploy the stage changes in this commit.

---

## 2. Open items (who does what)

Nothing here blocks D. Every item has an owner; do not edit files you don't own, write the outcome in your own status file.

| # | Owner | Item | Exact action | Priority | State |
|---|---|---|---|---|---|
| 1 | **C** | Amber "Sealing delayed" during healthy Live runs (C.md #2): batches take 0.9–1.6 s which is about the tick rate, so `health` flips to `delayed` and the ticker row turns amber. | C decides (formula gas mode / cached estimate; C's 14:0x commit `f9777f7` says "formula gas default with OOG retry"). After it lands, **D (or whoever has a browser) re-checks one live Mutual run**: the amber row should now be rare/short. No D code change expected. | Demo polish | Waiting on C's before/after batch time, then a visual re-check (section 8 shows how) |
| 2 | **E** | `brand/sfx.ts` `ensure()` blocked the main thread ~450 ms the first time `alarm(true)` ran with no prior key press (CPU profile). | E's commit `abfbdb9` says "sfx prewarm". **E: confirm in E.md that `unlock()` (or an idle callback) builds the buffers**, and that a lab click (no key press) no longer stalls. D calls `sfx.alarm(true)` from `VaultPanel` the first time cash reaches 0 and `sfx.thud()` in `OutcomeLayer`. | Low | Believed done; needs E's confirmation |
| 3 | **E** | Closing card needs nothing from D. E's `<ClosingCardHost />` is mounted by F in `app/src/app/routes.tsx` and owns the `L` key. | None. D mounts nothing. | none | Done (F) |
| 4 | **F / anyone** | Re-record replays if B ever changes the model (`modelHash 0xebcb6f1f…` is frozen per B.md). The stage reads whatever replay it is given. | None for D. | none | n/a |
| 5 | **B** (idea, not a request) | `bestSeeds(model, card)` from `@/engine` could ring "best rumor starters" as a hint for the pick-a-seed feature. D did NOT do it: the first call runs ~40 simulations synchronously, which risks a dropped frame. If B makes it incremental/async, D can add hint rings in `networkRenderer.ts` (`paint`, the "Chosen / hovered depositor" block). | Optional. | Nice-to-have | Not started |

Items that were open earlier and are **now closed** (so you don't chase them):
- E's `copy.stage` group exists (commit `abfbdb9`); a key check at 14:20 found **no key used by `stageCopy.ts` missing** from `copy.stage`. The local defaults in `stageCopy.ts` are therefore dead code now (they stay as a safety net).
- F's `runActions.selectSeed` + `RunView.seedNode` exist (commit `6b56a7a`); the canvas uses them (section 5.1).
- F's `requestedCount` for replay seals: the replay ticker now prints real counts (verified at 14:20: "tick 7–8 · #69,773,799 · 153 withdrew · sealed 0.89 s · ✓ finalized 0xf070…3f85").
- F's request "Replay vault caption says Practice": fixed (`S.heldReplay`).
- E's requests to D (recordedAt on ModeChip, banner-safe stage height, passbook row shape): all done.
- B's note "never hard-code seed nodes": the stage never does (it only draws `frame.nodeState`).

---

## 3. What D owns and the rules it works under

- **Owns only `app/src/ui/stage/**` and `docs/status/D.md`.** Imports other modules **only through their barrels**: `@/app/store`, `@/ui/brand`, `@/ui/panels` (not used), `@/ui/format`, `@/ui/copy`, `@/types`.
  - One deliberate exception: `StageLab.tsx` (dev sandbox) imports `patchRun`/`runStore` from `@/app/state` because the public store cannot force a phase. No other stage file does.
- **CSS Modules only** (`*.module.css`), colours/spacing/type only from E's CSS variables in `app/src/ui/theme/tokens.css`. No global CSS. A scan at 14:00 found no colour literals in stage `.ts/.tsx/.css` (the `rgba(...)` calls in `networkRenderer.ts` are built from tokens read at runtime).
- **No string literals in components.** Everything printed goes through `stageCopy.ts` (section 6).
- **Never re-render React at 60 Hz.** The canvas and the run clock read `getRunView()` inside `requestAnimationFrame`. Components subscribe with `useRunView` and select primitives or stable references (F's `useRunView` compares results one level deep; selectors that build new nested objects each call can still loop).
- Hotkeys are F's (`app/src/app/hotkeys.ts`, installed once in `main.tsx`). D only renders hints and responds to store state.
- The shell (`app/src/app/routes.tsx`, F) mounts `PaperBackground`, `ModeBanner`, `ProofPanel`, `ClosingCardHost` around `<StageScreen />`. D does not mount those.
- Testnet only; D never touches keys or the chain. D never calls `runActions` except the user actions listed in section 5.

---

## 4. File map (all in `app/src/ui/stage/`)

| File | Role |
|---|---|
| `index.ts` | Barrel (PRD §16.5): `StageScreen`, `StageLab` only. |
| `StageScreen.tsx` / `.module.css` | Layout grid and overlay hosting. Measures what the shell stacks above it and sets `--stage-top`. Owns the stage shake (WAAPI). |
| `TopBar.tsx` / `.module.css` | Wordmark, bank selector, rumor chits, primary action (per phase), run clock, block number, `ModeChip`; also exports `ErrorStrip`. |
| `NetworkCanvas.tsx` / `.module.css` | React wrapper for the canvas: sizing (ResizeObserver, DPR ≤ 2), rAF loop, token palette, aria-label, pointer handlers for seed pick. |
| `networkRenderer.ts` | The Canvas 2D renderer class (state diffing, transitions, ripples, particles, rings). No React. |
| `canvasMath.ts` (+ `.test.ts`) | Pure maths: square fit, √balance radii, lerp/ease, hex parse, bezier, rumor-source pick, passbook log scale. |
| `NetworkLegend.tsx` / `.module.css` | Node-encoding key (DOM). |
| `VaultPanel.tsx` / `.module.css` | Vault bar, figures, lamp, flash, alarm. |
| `QueueStrip.tsx` / `.module.css` | Monad Mutual queue of little people. |
| `SealTicker.tsx` / `.module.css` | Latest 6 seals + `HealthChip` + MICR separators. |
| `OutcomeLayer.tsx` / `.module.css` | "Sealing the verdict…" freeze, E's `Stamp`, thud, shake, passbook trigger, SR announcement. |
| `Passbook.tsx` / `.module.css` | Comparison passbook (log-scale bars). |
| `HelpOverlay.tsx` / `.module.css` | Hotkey list dialog. |
| `stageCopy.ts` (+ `.test.ts`) | The ONE adapter to `@/ui/copy`: all stage strings, `fill()`, `splitEmphasis()`. |
| `StageLab.tsx` / `.module.css` | `/lab/stage` sandbox (dev tool). |

---

## 5. How each part works (behaviour you can rely on)

### 5.0 Layout (`StageScreen`)
- Desktop: `display: grid; grid-template-rows: auto minmax(0,1fr) auto` → top bar (`.head` = `TopBar` + `ErrorStrip`), main (62/38 columns: network | vault column), ticker. Height = `calc(100dvh - var(--stage-top, var(--banner-h, 0px)))`. `--stage-top` is measured in a layout effect from everything above the stage in the DOM (ResizeObserver on the preceding siblings + window resize), so the in-flow `ModeBanner` never pushes the ticker off screen. E also writes `--banner-h` on `<html>` as a fallback.
- ≤ 760 px wide: `height: auto`, grid collapses to one column: network (square, `aspect-ratio: 1/1`) → legend → vault → queue → ticker (latest seal only). Overlays (`OutcomeLayer` freeze/stamp, `Passbook`, `HelpOverlay`) become `position: fixed` on phones because the stage is a scrolling page there.
- Short desktop screens (`max-height: 800px`): compact rules in `VaultPanel`, `QueueStrip` (title visually hidden, kept as the accessible name), `TopBar`.
- `data-mode` and `data-phase` attributes sit on `<main>` for debugging/automation.

### 5.1 Network canvas (`NetworkCanvas` + `networkRenderer`)
- Data read from the store in the rAF loop: `model` (graph + ledger balances + configs), `frame` (`nodeState`, `heardAt`), `level`, `phase`, `seedNode`. If `model` is null (before the controller sets it) it draws nothing.
- Layout: graph is a unit square (`node.x/y` in 0..1) letterboxed into the box with a 14 px inset (`fitSquare`). Radius ∝ √(balance) (`nodeRadii`), clamped to ≥ 2.4 px; drawn small → large so whales sit on top.
- Edges are painted once to an offscreen canvas (ink at 8.5%) and blitted; repainted only on resize/model change.
- **State encoding (PRD §14.3, shape + colour, never colour alone)**: Calm = small filled ink dot · Heard = amber ring · Panicking = filled vermilion + pulse ring · Queued = vermilion ring with a tail toward the vault (right) · Withdrawn = hollow thin ring · Trapped = slate ×. Insured halo (thin violet ring) only on Monad Mutual (`level === 1`) for depositors with `balance <= configs[1].insuredCap` that are not Withdrawn/Trapped.
- **Transitions**: each node has a from/to style (fill/stroke colour+alpha, line width, scale, cross alpha) lerped over 250 ms (`TRANSITION_MS`).
- **Effects come from diffing**, not from `frame.newly*`: every frame the renderer compares `nodeState`/`heardAt` with what it last drew. Why: replay/spectate joins land several ticks in one store update; diffing gives the same visuals either way.
  - newly heard (`heardAt` goes −1 → ≥0): amber ripple ring + the edge it travelled along flashes for 600 ms. The source edge is guessed by `rumorSource` (earliest-heard neighbour that heard strictly before; falls back to a same-tick neighbour).
  - state becomes `Withdrawn`: a vermilion particle flies on a quadratic curve to the vault column's near edge (`getTarget()` reads the vault column's DOM rect at spawn time; on phones it aims at the top-centre of the vault). Caps: 220 particles, 160 ripples. Deterministic stagger from node id (no `Math.random`).
  - "Join" (first frame, tick regression i.e. reset, or a jump of more than 3 ticks): snap with no effects.
- **Reduced motion** (OS setting OR `ui.reducedMotion`): no ripples, no pulse, no particles, instant state changes.
- **Perf**: repaints only when dirty or animating (transitions, ripples, particles, panicking pulse). Measured headless 1920×1080 on the busiest second of a run: 60 fps, p95 16.7 ms, no long task in steady state; canvas paint total ≈ 40 ms over a 2.5 s run.
- **Colours** are read once from CSS tokens at mount (`getComputedStyle` + the canvas context to normalise to `#rrggbb`). Token names used: `--ink`, `--seal`, `--rumor`, `--run`, `--trapped`, `--paper`. If a token does not resolve to an opaque colour it logs a dev warning and uses channels `[0,0,0]`. Changing tokens at runtime requires a reload (palette is not re-read).
- **aria-label** on the `<canvas role="img">`: idle → "{total} depositors. The bank is open."; running → the phase label; outcome → "{withdrew} of {total} depositors withdrew; {trapped} trapped."
- **Pick who starts the rumor (P2, live)**: only when `phase === 'idle'` and `mode` is `practice` or `live`. Hover → ink ring + pointer cursor; click → `runActions.selectSeed(id)` (clicking the already selected node passes `null`). The violet ring is drawn from `view.seedNode` (cleared by F's controller on start/reset; the renderer shows it only while idle). F's `start()` uses `seedNode` when set. Keyboard users cannot pick a seed (the chits cover the common path); that is a known gap, not a bug.

### 5.2 Vault panel
- Numbers come from `frame.bank` (the engine's mirror of the contract; F checks it against the chain per tick). With no frame it shows `model.configs[level]` cash0/bonds0 and the base haircut. It does **not** show the live onchain balance in the bar; the real AUSD held by the contract appears only in the footer line.
- Bar (assets0 = cash0 + bonds0 is 100%): bonds hatched at the bottom, cash solid above it, empty space above = paid out. Each fire sale spawns a vermilion slice at the top of the remaining stack that slides across into a dashed "Street" column and fades; the Street column's vermilion fill height is cumulative loss. (Slice animation ends at opacity 0; with reduced motion it is effectively skipped but the Street fill still shows the loss.)
- Figures: `cash`, `bonds` (big, `fmtAusd` + inline `fmtUsdScaled`), `fire-sale loss`, `out the door` (= `deposits0 − depositsOwed`). Footer: held-balance line + `haircut X% · 1 AUSD = $1M` (the scale is always labelled).
- Title: `Vault · simulated` in Practice, `Vault · real AUSD on Monad` otherwise. Footer held line: if `mode !== 'practice'` and `onchain` exists → "{amount} held by the contract · live from Monad"; else Practice → "Practice: simulated balance"; Replay → "Recorded from Monad testnet"; Live/Spectate before the first snapshot → empty.
- Status lamp = dot + text (`copy.phases[phase]`), never colour alone.
- **Cash-zero event**: the first time `frame.bank.cash === 0n` with `tick > 0` and no outcome → `sfx.alarm(true)` and a one-shot vermilion frame flash (CSS). Alarm stops on outcome, reset, or unmount (cleanup). Implemented with `subscribeRunView` (not React render).

### 5.3 Top bar
- Row 1: wordmark · bank selector (`1`/`2` badges, defence tag, becomes "Reset and switch" on the other bank after an outcome) · `ModeChip` (gets `replayName` and `recordedAt`) · run clock + `block #…`. Row 2: four chits (`Q W E R`, selected lifts, `*emphasis*` in card text rendered via `splitEmphasis`) · primary action.
- **Selectors lock** (disabled, still readable) in Replay/Spectate and whenever phase is not `idle|failed|survived`.
- **Primary action per phase (PRD §13.2)**: `idle` + card → "Start the run" (primary, badge `Enter`); `idle` without a card → disabled "Pick a rumor to start the run"; `switching`/`starting`/`failing`/`surviving`/`resetting` → pending `Button` with its own label from copy; `running` → empty (slot reserved so the row doesn't jump); `failed`/`survived` → "Reset the bank" (badge `X`); `paused` → own full-width row with Retry sealing (primary) · Switch to backup key (only if a backup key exists and isn't in use) · Play the recorded run · Reset the bank. In Replay/Spectate no primary action is shown.
- **Run clock**: `<span role="timer">` whose `textContent` is written from rAF (`fmtClock`): `outcome.wallMs` if set; else `Date.now() − startedAtMs` while running/failing/surviving; else `elapsedMs`.
- **`ErrorStrip`** (rendered under the top bar): shows `view.error` (title + detail), persists until dismissed or resolved. It runs `error.action.run`: `retry → runActions.retry()`, `reset → reset()`, `replay → setMode('replay')`, `ops → navigate('/ops')` (wouter `useLocation`), `backup → switchToBackupKey()`. While `phase === 'paused'` it hides its action button because the top bar already offers every remedy; it always has Dismiss.
- Buttons use E's `Button` (`kind`, `pending`, `pendingLabel`, `hotkey`). Hotkey badges use `<kbd aria-hidden>` plus `aria-keyshortcuts`.

### 5.4 Seal ticker
- Newest-first latest 6 `view.seals`. A tick seal prints "tick 7–8 · #block · N withdrew · sealed 0.89 s · ✓ finalized" + a `TxLink`; other kinds print the copy label (rumor started, bank reset …). `simulated` records print "simulated · not onchain" and **never** a link (key off `record.simulated`; mock records have `txHash: null`). `finalized: false` prints "finalizing…". A pending record or "run is ahead of sealed tick" prints "sealing tick N…" (amber text).
- Row turns amber and the label becomes "Sealing delayed" (or "Sealing paused") when `health` is `delayed`/`paused`. `HealthChip` sits at the right end (see §9 deviations). MICR-style inline-SVG separators (P2). On phones only the latest row shows.

### 5.5 Queue strip (Monad Mutual only)
- One inline-SVG person per `frame.bank.queue` id (keyed by node id), max 40 drawn then "+N". Enter slides in from the right, leave from the head with an exit animation (`motion/react` `AnimatePresence mode="popLayout"`; items are memoised `forwardRef` components so only arrivals/leavers re-render). Header shows the speed-bump cap from `configs[1].speedBumpBps` ("Pays at most 3% of deposits per block"). Reduced motion → zero-duration transitions.

### 5.6 Outcome sequence
1. `phase` `failing`/`surviving` and no stamp yet → full-stage scrim with "Sealing the verdict…" (pulse) and "Waiting for Monad to seal tick N" (Practice: "Settling the books").
2. Stamp shows **only** when `outcome !== null && (mode === 'practice' || outcome.sealed)`. So in Live/Spectate/Replay it waits for the chain-sealed outcome event. Headline/Marathi/subline from copy: sealed → E's `copy.stamp.*Sub(wallMs, blocks)` ("in 4.2 s · 14 Monad blocks"); Practice → "simulated · N ticks".
3. `Stamp` is E's component. D passes `shake={false}` (D does its own shake so the screen doesn't shake twice) and `reducedMotion` when the UI flag is set. On `onImpact`: `sfx.thud()`, a 180 ms ±6 px stage shake (WAAPI keyframes in `StageScreen`, skipped under reduced motion), then `uiActions.togglePassbook(true)` 400 ms later. Fallback: if `onImpact` never fires within 1.2 s the thud + passbook still happen.
4. While the passbook is open the stamp layer "docks": desktop `translateY(-13%) scale(.62)`, phones `translateY(-30%) scale(.5)`, so neither hides the other.
5. A visually hidden `role="status"` announces "Bank failed after 4.2 s." for screen readers.

### 5.7 Passbook
- Rows from `copy.passbook.rows` (`bank/amount/span/note`: WaMu $19B 16 days, Wachovia ~$10B 8 days, SVB $42B 1 day) with fixed durations in `PASSBOOK_SECONDS` (16 d, 8 d, 1 d: data from PRD §8.1, not copy). "This bank" row: display-scale withdrawn amount (`fmtUsdScaled(outcome.withdrawnAmount)`), time (`fmtSeconds(wallMs)`), blocks ("14 Monad blocks") or "simulated" in Practice; red for failed, violet for survived. Placeholder "—"/"Run the bank to add its row" if opened before an outcome.
- Bars on a **log** time scale (1 s … 2,000,000 s, `logPosition`, minimum visible sliver), labelled "log scale" with a 5-tick axis (1 s, 1 min, 1 h, 1 day, 1 week from `S.axisTicks()`); on narrow tracks the "1 week" label is hidden by a container query to avoid colliding with "1 day". Doto font (≥ 28 px) for entries. Rises from the bottom; closed state is `inert` + `visibility:hidden`. Toggled by F's `C` hotkey and its own Close button. While E's proof panel is open it stops 480 px short of the right edge (`.beside`) so its Close stays reachable.

### 5.8 Help overlay
- `HOTKEYS` from `@/app/store`; opens on `uiActions.toggleHelp()` (`H`/`?`), closes with `Esc` (F's hotkey handler) or click outside or its Close button. It sits above the stamp and the passbook (`z-index: calc(var(--z-stamp) + 1)`) and centres left of the proof panel when that is open. `role="dialog" aria-modal`, focus moves into the card on open and returns to the previously focused element on close.

### 5.9 Legend
- DOM list under/left of the canvas explaining the node encoding; the "Fully insured" entry appears only on Monad Mutual.

---

## 6. Copy: how strings work (important for E and anyone editing text)

- `stageCopy.ts` exports `S` (all strings), `fill(template, vars)` for `{placeholders}`, `splitEmphasis()` for `*word*`, and `PASSBOOK_SECONDS`.
- Lookup order per string: `copy.stage.<key>` → an existing group in E's deck (`banks`, `cards`, `buttons`, `phases`, `chips`, `stamp`, `passbook`, `scale`, `errorActions`) → a local default in `stageCopy.ts`. As of 14:20 every key the stage reads from `st('<key>', …)` **exists in `copy.stage`**, so the defaults are dead code. **To change wording: edit `app/src/ui/copy.ts` (E). Do not edit components.**
- Adding a new string: add `st('newKey', 'default')` in `stageCopy.ts` and the same key in `copy.stage`.
- Key names printed on badges (`Enter`, `X`, `P`, `C`, `H`) are keyboard labels in `S.key`, not prose.

---

## 7. Store contract D relies on (fields read from `RunView` / `UiState`)

`mode, phase, level, card, model (graph, ledger.balances, ledger.deposits0, configs), frame (nodeState, heardAt, bank.{cash,bonds,cumulativeLoss,depositsOwed,deposits0,lastHaircutBps,queue,tick,withdrawnCount}), seals[], sealedTick, health, startedAtMs, elapsedMs, blockNumber, outcome {kind, tick, wallMs, blocks, withdrawnAmount, trappedCount, sealed}, onchain.ausdHeld, error, operator.backupAddress/usingBackup, replay {name, recordedAt}, seedNode`; `UiState`: `passbookOpen, helpOpen, reducedMotion`. Actions used: `runActions.selectLevel/selectCard/start/reset/retry/dismissError/setMode/switchToBackupKey/selectSeed`, `uiActions.togglePassbook/toggleHelp`, `HOTKEYS`, `getRunView`, `subscribeRunView`. If F renames or retypes any of these the stage breaks at compile time.

---

## 8. How to run, test and re-verify

- Dev server: `cd app && pnpm dev --port 5174 --strictPort` (D's port). Sandbox: `http://localhost:5174/lab/stage`.
  - Lab toolbar (bottom-left): size presets (window, 1280×720, 1920×1080, 375×812 as scaled iframes), scenario buttons (`fail`, `survive`, `idle`, `failed`, `survived`, `verdict`, `error`, `passbook`, `help`), force any phase, force any mode, switch bank level. Window mode drives the shared store; framed presets run their own store.
  - Headless/automation URLs: `/lab/stage?embed=1&scenario=<name>` renders just the stage (no toolbar) and runs the scenario once (`fail`, `survive`, `idle`, `failed`, `survived`, `verdict`, `error`, `passbook`, `help`). The fake run uses the real engine, so timings are real: Bhau's × W fails ≈ 4 s, Mutual survives ≈ 11–25 s.
  - Real data: `/replay/bhaus-w-failed-202610100809`, `/replay/mutual-w-survived-202610100809` (recorded testnet runs in `app/public/replays/`; ids change when F re-records, check `index.json`). Press `P` for E's proof panel, `C` for the passbook.
  - `/` resolves to **Live** (not Practice) whenever an operator key is in `app/.env.local` and preflight passes: **do not press `W`+`Enter` on `/` in that case unless you intend a real testnet run.** Use the lab or `/replay/*` for testing.
- Tests: `cd app && pnpm vitest run src/ui/stage` (pure maths + copy adapter; the renderer and React components are verified visually, there is no DOM test environment: `vite.config.ts` sets `test.environment: 'node'`). Typecheck: `pnpm typecheck` (only errors under `ui/stage` are D's). Lint: `npx oxlint src/ui/stage`.
- Screenshot method used (not in the repo): headless Chrome driven over CDP (`--headless=new --remote-debugging-port`, `Emulation.setDeviceMetricsOverride` for width/height/dpr/mobile, `Emulation.setEmulatedMedia prefers-reduced-motion`, `Page.captureScreenshot`, `Input.dispatchKeyEvent` for hotkeys/Tab). The IDE browser tool cannot emulate big viewports for capture; use headless Chrome. Any equivalent (Playwright is not installed; do not add it, no new packages) works.
- Perf recipe: in the page, record `requestAnimationFrame` deltas for ~4.5 s starting just after the run starts (expect ≈ 60 fps, p95 ≈ 16.7 ms), and use a React DevTools-hook commit walk (compare `child !== alternate.child` before counting `PerformedWork`) to count per-component renders; expect ≤ ~4/s for `VaultPanel`, `BlockLine`, `SealTicker`, `QueueStrip`.

### Verification record (14:00–14:20)
| Check | Result |
|---|---|
| 1920×1080: idle, mid-run, verdict freeze, failed + passbook, survived + passbook, proof panel open (replay), error/paused, help | Pass. Reads in ~5 s; vault figures and stamp are the loudest elements. |
| 1280×720: idle, mid-run, verdict, failed + passbook, survived w/ queue, proof open, paused | Pass. Nothing clipped; nothing under 18 px. Tightest area: top bar (two rows ≈ 24% of height) and vault+queue column; paused wraps four remedies onto their own row. |
| 375×812 (dpr 2, mobile): idle, mid-run, failed + passbook | Pass. `scrollWidth` = 375, no horizontal scroll. Stamp docks at the top, overlapping the bank buttons while the passbook is open (acceptable: run is over; pointer-events none). |
| Reduced motion | No ripples, pulse, particles; instant state changes; shake skipped; slice animation effectively skipped. |
| Keyboard only | Tab order 1, 2, Q, W, E, R, Start, wraps. Every control shows a 3 px focus ring (selected bank segment: inset light ring; unselected: ink ring). Passbook/Help are removed from the tab order when closed (`inert` / not rendered). |
| Perf | 60 fps steady state; per-component render rates ≤ ~4/s; first lab run showed one ~230 ms long task that was E's `sfx.ensure` (item 2), not the stage. |
| Replay | Ticker prints real counts and `TxLink`s; stamp subline "in 4.2 s · 14 Monad blocks"; passbook row "failed · 14 Monad blocks", $5.9B. |

---

## 9. Decisions and deliberate deviations from the backlog

- `HealthChip` is at the right end of the **ticker**, not in the top bar: at 1280 the top bar had no room for two chips plus the clock, and the chip describes sealing. It receives `blockNumber={null}` because the block is shown once next to the clock.
- The node legend is a **left column** beside the canvas on desktop (below the canvas on phones) because the letterboxed square leaves empty space at the sides.
- The vault shows the **engine mirror** (`frame.bank`), not the onchain snapshot, in the bar. F's controller checks the mirror against chain data every tick (`view.mirror`), and the proof panel shows that check.
- Stamp shake is done by D (stage only), with E's `Stamp` told `shake={false}`. E's default shakes `#root`, which also moves the banner and proof panel.
- Chits use the `--fs-card` size and may wrap to two lines at 1280.
- Bank selector labels use sentence-case taglines from `copy.banks[].tagline` capitalised by `stageCopy`; the PRD's "insured to 50 AUSD" long form is not shown (E's tagline is "speed bump + insured").

---

## 10. Known limitations and gotchas (not bugs, but read before changing things)

- Mid-edit by other agents (e.g. E's `panels/index.ts`) can make the whole app fail to boot in dev with `does not provide an export named …`. That is transient and theirs; reload after their commit.
- Replay ids in `app/public/replays/index.json` change when F re-records; old URLs then show D's `ErrorStrip` ("Recorded run unavailable"). That is expected behaviour, not a stage bug.
- The canvas palette is read once at mount; a live theme change would need a reload (the product is light-only by design).
- A pending lerp or particle caps (220/160) are intentionally conservative; a spectate join of a 300-node jump snaps instead of animating.
- Canvas click-to-seed is mouse/touch only.
- The stage assumes ≥ 500 nodes laid out in 0..1; if B changes the graph size nothing in D is hard-coded, but the visual density tuning (radius floor 2.4 px, `side * 0.034` max radius) was tuned for 500.
- If `view.model` is replaced by a different model object (new modelHash) the renderer rebuilds and snaps; it does not animate between models.
- `StageLab` forces store state with `patchRun`; never import it elsewhere.

---

## 11. If you need to change the stage

1. Edit only inside `app/src/ui/stage/`; keep CSS in the component's `.module.css`, tokens only; keep copy in `copy.ts`/`stageCopy.ts`.
2. Run `pnpm vitest run src/ui/stage`, `pnpm typecheck`, `npx oxlint src/ui/stage`.
3. Check visually with the embed URLs above at 1920×1080, 1280×720 and 375 wide, with and without reduced motion.
4. Commit only your paths: `git add app/src/ui/stage docs/status/D.md && git commit -m "D: …" -- app/src/ui/stage docs/status/D.md`. Never `git add -A`, stash, reset, restore, checkout --, clean, rebase, pull.
5. Ask for anything outside `ui/stage` in the owner's status file as `REQUEST → <letter>: <exact change>`.

---

## 12. Commit history for D (newest first)
`6603b7a` seed pick via store, mobile outcome docking, verification matrix · `7303bc8` replay vault line · `2ed31f9` P1/P2 pass (responsive, focus, perf, seed pick, MICR) · `758d9f1` first full stage (skeleton, canvas, vault, top bar, ticker, queue, outcome, passbook, help, lab). The previous (rate-limited) D agent had only produced `stageCopy.ts` and the kickoff entry of this file.
