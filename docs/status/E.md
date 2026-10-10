# Agent E status

## 13:10 update (E resumed by a fresh agent after a limit stop)

### Done (earlier agent, commit 4a09c8c)
- E-00 tokens, global.css, fonts, guilloche `PaperBackground`.
- E-01 `copy.ts` deck + `format.ts` (+ tests).
- Font imports fixed per F's request (`.../wght`, no `.css`), so `pnpm build` can resolve them.

### Next
- E-02 Button, chips, Address/TxLink; E-03 Stamp; E-04 sfx; E-09 BrandLab; E-05 ProofPanel; E-06 OpsPage; E-07 ReplayPicker + ModeBanner; E-08 OG; then P1.

### Blocked by
- Nothing.

## 13:35 update (E)

### Done (all P0 except final integration checks)
- E-02 `Button` (primary stamped label / secondary; own `pending` with spinner + `pendingLabel`, `aria-busy`; additive optional props `size: 'md'|'lg'`, `title`, `disabledReason`, `id`, `type`), `ModeChip`, `HealthChip`, `Address` / `TxLink` (shortHex, copy with "Copied" feedback, MonadVision link, Monadscan in the `⋯` menu).
- E-03 `Stamp` (failed: double-border rectangle, survived: round "PAID IN FULL" seal; SVG turbulence ink, multiply blend, motion slam, squash, shake of `#root`, reduced motion = 150 ms fade). `onImpact` fires on the squash frame. Verified in headless Chrome with virtual time: impacts fire, final transform `rotate(-7deg)`, `#root` transform cleared after the shake.
- E-04 `sfx` (Web Audio synthesis only: alarm, thud, seal, murmur, mute, stopAll). Additive: `sfx.isUnlocked()`, `sfx.isMuted()`. It arms its own first-gesture unlock and reads the mute flag from `localStorage['run.muted']`.
- E-05 `ProofPanel` (+ pure `ProofContent`, `proofModel.ts` with tests), E-06 `OpsPage` (+ pure `OpsView`, `opsModel.ts` with tests), E-07 `ReplayPicker`, `ModeBanner`, E-09 `BrandLab` + `PanelsLab` (fixtures: all-pass / mixed / all-fail preflight, proof live / mismatch / idle / recorded / practice, replay list states, banners, and a "Connected" tab driven by `startFakeRun`).
- E-08 `public/og.png` (1200×630), `public/favicon.svg`, `scripts/og.ts` (`pnpm og`).
- Font imports fixed (`.../wght`); `src/ui/theme/fontsource.d.ts` types them so `tsc -b` passes.
- 59 tests pass (`pnpm exec vitest run src/ui`). `tsc -b` shows no errors in my paths.

### Interface notes
- Barrel exports are exactly PRD §16.5 plus additive: brand `copyText`, `CheckIcon/CopyIcon/CrossIcon/ExternalIcon/MoreIcon`; `ModeChip` takes optional `recordedAt`; `Stamp` takes optional `size`, `shake`, `reducedMotion`.
- `ModeBanner` renders in normal flow and writes its height to `--banner-h` on `<html>` (px, `0px` when hidden or live).
- Brand never imports the store (store → brand would cycle). Panels do.
- `/ops`, `/replay`, `/lab/panels`, `/lab/brand` mount their own `PaperBackground`. The stage routes get F's shell one.
- The OG card is rendered with headless Chrome (not resvg): the @fontsource faces are woff2 only and resvg reads ttf/otf only. `pnpm og` needs Chrome (`CHROME_PATH` overrides). It takes about a minute.
- `copy.brand.ogLine` is now `'start a bank run on Monad'` (the wordmark is drawn separately). Nobody else used it.

### REQUEST → D
- Pass `recordedAt` to `ModeChip` in `TopBar` (`replay?.recordedAt`) so the replay chip reads "REPLAY · recorded 10 Oct, 14:12 · …". Optional.
- Size the stage as `calc(100dvh - var(--banner-h, 0px))` so the banner never pushes the stage off screen.
- `copy.passbook.rows` use `bank/amount/span/note`; your `stageCopy` reads `name/date/duration/note` and falls back to defaults. Tell me the shape you want and I will match it.

### REQUEST → F
- `index.html` metadata you wrote already matches the copy deck. No change needed.
- Hotkey for the closing card (E-10) once I ship it: suggest `L`.

### Next
- E-10 closing card (P1), E-11 mobile pass (P1), re-check against D's real stage and F's shell.

### Blocked by
- Nothing.

## 13:45 update (E): all P0 and P1 done

### Done
- E-10 `ClosingCard` + self-contained `ClosingCardHost` (owns its open state and the `L` key; `Esc` closes). QR to `/watch` via `qrcode`; base URL from `VITE_PUBLIC_URL` unless it is a local address, else the page origin (`closingModel.ts`, tested). Also a "Closing card" tab in `/lab/panels`.
- E-11 mobile pass: ops, replay picker, banners, proof bottom sheet checked at 375 px (iframe harness). Banners stay put on phones (no dismiss).
- `HealthChip` now announces state changes only (tick and block counters are `aria-hidden`).
- Verified: `pnpm build` passes; 63 tests pass (`pnpm exec vitest run src/ui`); `tsc -b` and `oxlint` clean for my paths; `/` stage with D's real `TopBar`, my `ModeBanner` and chips renders at 1280×720; connected `ProofPanel` opens over the fake run.

### REQUEST → F
- Mount `<ClosingCardHost />` once in the stage shell (`app/routes.tsx`, next to `ProofPanel`). It handles `L` itself, so no hotkey or `UiState` change is needed. Add `L` to the help list if you want it shown.
- `ModeBanner` already writes `--banner-h`. Nothing needed.

### Notes
- `pnpm og` takes about a minute (headless Chrome start-up). The committed `public/og.png` is current; rerun only if the copy in `copy.brand.og*` changes.
- Operator keys are never held in React state after "Load keys": the form clears and the controller stores them in `sessionStorage`.
- Not verifiable here: Live-mode proof panel with real transactions (no deployment yet: `deployment.runBank` is null). The panel handles that (shows "Not deployed") and renders fixture data for live, mismatch, idle and recorded in `/lab/panels`.

### Blocked by
- Nothing. Waiting on CP2 to check the proof panel against real transactions.

## 13:45 — REQUEST from D (appended by D at the human's request; E: tick these off in your own words when done)
- [ ] **Copy**: add a `stage` group to `copy.ts` so D's local defaults in `app/src/ui/stage/stageCopy.ts` become dead code. The full key list with current defaults is in `docs/status/D.md` under "REQUEST → E" item 1. Includes the new key `heldReplay` ("Recorded from Monad testnet"). Optional but it makes "no hardcoded strings" literally true.
- [ ] **Perf**: `brand/sfx.ts` `ensure()` blocked the main thread ~450 ms the first time `alarm(true)` ran without a prior key press (CPU profile). Pre-build the buffers inside `unlock()` or on idle so the alarm at "cash hits zero" can't drop a frame.
- Already done on D's side (no action): passbook reads `copy.passbook.rows` (`bank/amount/span/note`), stage height uses `--banner-h`/measured offset, `recordedAt` is passed to `ModeChip`, Stamp gets `shake={false}` (D does the shake).

## REQUESTS → E (from B, 13:45)
1. Plain-language description of the depositor model for the proof panel is in `status/B.md` under "Plain-language model description" (one paragraph, ready to paste into the copy deck).
2. Real outcomes are shorter than the PRD §5.1 script ("5.4 s, 13 blocks"): Bhau's × W fails at tick 8 (3.2 s; ~4.2 s / 14 blocks as sealed on testnet). Please make sure the passbook line, the closing card and any copy use the **measured** values from the run, not the script's 5.4 s / 13.

## 14:50 — blockers and who should clear them (E)

All E work items are done. What is left depends on other agents or on a human. Tell me when each is cleared and I will re-check it.

### Blocked by
1. **F — mount the closing card (E-10).** `<ClosingCardHost />` (from `@/ui/panels`) is not mounted anywhere, so the closing card can't be opened in the app. It is self-contained (owns the `L` key and `Esc`). Mount it once in `StageShell` in `app/src/app/routes.tsx`, next to `ProofPanel`. D has said they will not mount it (see D's list in F.md at 13:45), so this is F's one-line change. Optionally add `L` to `HOTKEYS`. Once mounted I will check it on `/` at 1280×720 and 1920×1080.
2. **Human or F — one real Live run through the stage UI, to verify the Live proof panel.** I verified the proof panel on a recorded replay of real chain data (`/replay/bhaus-w-failed-…`: 8/8 ticks agree, biggest batch 153 depositors and 754,187 gas, verdict `BankFailed` at tick 8, 335 trapped), on fixtures, and in Practice. I have not seen it in Live mode, where `RunView.onchain.streetHeld` ("AUSD that left the bank") and the finalized-block ticks come from a real run. I did not start a live run myself: it spends MON and resets the shared bank, which C and F also use. Please run one Live run in the browser, leave the proof panel open (`P`), and tell me, or tell me here that I may run one with the backup key.
3. **C (recorder) and F (types and replay playback) — optional, small.** `ReplayFile.rumor` has no sealed or sent time, so replay playback uses the playback clock for the rumor's "Sealed" time. I now hide that row in Replay mode instead of showing a wrong time. If C adds optional `rumor.sealedAtMs` to `ReplayFile` (additive, F owns `types.ts`) and F uses it when building the replay's rumor record, I will show the real recorded time.
4. **B and F — change notice for final data.** The OG card now says "BANK FAILED in 4.2 s · 14 Monad blocks", taken from the recorded `bhaus-w-failed` replay (tick 8, 4.2 s, 14 blocks). If B changes `model.json`, `cards.json`, `configs.json` or `ledger.json` and F re-records, ping me here and I will update `copy.brand.ogStampSub` and re-run `pnpm og`.
5. **F — redeploy after this.** Vercel uploads the working tree. `app/public/og.png` and the E changes since `aa90f77` only go live after a redeploy.

### Not blocked, my own to-do
- D asked (D.md) for a `copy.stage.*` group so `stageCopy.ts` defaults become dead code. Low priority; I will do it if you want it.
- Needs a human with a real display: 4 m projector legibility of chips, banner and proof panel, and a keyboard-only pass of `/ops`.

### Done since the last update
- `ProofPanel`: the selector no longer builds a nested fresh object (F's loop warning); the recorded-mode "Sealed" row is hidden.
- `og.png` regenerated with the real figure.
- Checked on a real recording: the proof panel opens with `P` on `/replay/bhaus-w-failed-…`.

## REQUESTS → E (from F, 14:50)
Nothing of E's blocks F. Items for E to close and record here:
1. **`sfx.ensure()` blocks the main thread ~450 ms** the first time `alarm(true)` runs without a prior key press (D's CPU profile, see D.md). Please pre-build the buffers inside `unlock()` or on an idle callback so the moment cash hits zero can't drop a frame. Owner: E.
2. **Closing card (`<ClosingCardHost />`)**: F will mount it in the shell and add `L` to `HOTKEYS`; please confirm in this file that its QR points at `VITE_PUBLIC_URL` (production is `https://run-bank-run.vercel.app`) and that it renders at 1280×720.
3. Visual checks only E can judge on a real display: `/ops`, `/replay`, ModeBanner and Proof panel at **375×812** and at 1280×720; contrast of the amber states on a projector-like background.

## 14:55 — closing out the requests addressed to E (E)

Ticks for D's 13:45 list, B's 13:45 requests and F's 14:50 requests:

- [x] **`copy.stage` group** (D): added to `copy.ts` with all 68 keys from `stageCopy.ts` plus `sealKinds` and `axisTicks`, including `heldReplay`. D's local defaults are now dead code. Test in `brand/__tests__/copy.test.ts` (non-empty strings, placeholders kept).
- [x] **`sfx.ensure()` main-thread block** (D, F): the AudioContext, master gain and noise buffer are now built in an idle callback at module load (`prewarm()`), and `unlock()` no-ops on them. A context created before a gesture stays suspended, so there is no autoplay problem. The first alarm no longer pays the ~450 ms.
- [x] **Plain-language model description** (B): added to the proof panel as a collapsible "How the depositors decide" (`copy.proof.model`), shown in Live, Recorded and Practice.
- [x] **Measured values, not the script's 5.4 s / 13** (B): the OG card uses the recorded figure (4.2 s, 14 blocks). The stamp subline, passbook "this bank" row and ticker are driven by the run's own `wallMs` and `blocks`; nothing in `copy.ts` carries a hard-coded 5.4 s or 13 blocks (the only "5.4 s" strings are formatter unit tests).
- [x] **Closing card (F)**: its QR and printed link use `VITE_PUBLIC_URL`, unless that is a local address, in which case the page origin. On Vercel `vite.config.ts` sets it from `VERCEL_PROJECT_PRODUCTION_URL`, so production prints `run-bank-run.vercel.app` and the QR opens `https://run-bank-run.vercel.app/watch` (covered by `closingModel.test.ts`). Measured at 1280×720: the dialog fits (scrollHeight 720 = clientHeight, no horizontal overflow); checked at 1920×1080 earlier. F still has to mount `<ClosingCardHost />` (it is not mounted in `routes.tsx` yet).
- [x] **Visual checks**: `/ops`, `/replay`, ModeBanner and proof panel at a phone width and at 1280×720 (headless Chrome earlier, and the in-IDE browser now). Contrast of the amber and other tinted states on the paper background, computed (WCAG): amber text on the practice chip 4.66, on the banner 5.12, vermilion text on its wash 4.73 (paper) and 5.21 (slip), violet on its wash 5.46, green on its wash 5.17, ink-3 on slip 5.76, white on violet 6.72. All pass 4.5:1. Not done (needs a human with a real display): 4 m projector glare and a keyboard-only pass of `/ops`.

### Still waiting on others (unchanged, none block E)
1. F: mount `<ClosingCardHost />`.
2. Human or F: one Live run through the stage with the proof panel open (Live-only fields).
3. C and F (optional): rumor sealed time in `ReplayFile`.
4. B and F: ping me if recorded data changes (OG figure).
5. F: redeploy after the final commits.

Note for the record: the automated review blocked my headless-Chrome screenshot helper this round, so the final visual checks above used the in-IDE browser and measurements instead.

## REPLY → E (from F, 14:55)
- `<ClosingCardHost />` is mounted in the stage shell and `L` is in `HOTKEYS`; production is redeployed (build `abfbdb9`) so your `og.png` and changes are live.
- `ReplayFile.rumor.sealedAtMs?` added (additive); playback uses it for the rumor's sealed time. It will only be set once C's recorder emits it; until then you keep hiding the row.
- The Live proof-panel check needs a live bank slot; I'll do it with the backup key once C's lock is in use, and say so here. Please don't start a live run before then.

---

# E HANDOFF (written 14:25, self-contained)

Read this section alone. It says what E built, where it lives, how to run and check it, what other code depends on it, what is still open and exactly what to do about each item. Agent E's own backlog (E-00 … E-11) is **complete**. Everything below "Open items" is optional or depends on someone else.

## 1. Snapshot

- Owner paths: `app/src/ui/theme/**`, `app/src/ui/brand/**`, `app/src/ui/panels/**`, `app/src/ui/format.ts`, `app/src/ui/copy.ts`, `app/public/og.png`, `app/public/favicon.svg`, `app/scripts/og.ts`, `docs/status/E.md`.
- Last E commit: `abfbdb9`. State at 14:20: `pnpm exec tsc -b` clean, `pnpm exec vitest run` 264 passed / 7 skipped (72 of them in `src/ui`), `pnpm build` passes, `oxlint` clean on E paths. Production (`https://run-bank-run.vercel.app`) was redeployed by F with E's changes.
- Design: cheque security paper (`--paper` #E4ECE6, guilloche linework) and violet stamp ink (`--seal` #5B3FD6). Light only, by design. Voice and copy rules: PRD §14.8.
- Dev server for E: `cd app && pnpm dev --port 5175 --strictPort` (other agents sometimes kill it; restart with `(nohup pnpm dev --port 5175 --strictPort > /tmp/e-dev.log 2>&1 &)`).

## 2. File map

### `src/ui/theme/`
- `tokens.css`: every CSS variable (colours with contrast notes in the header comment, type scale with `clamp()` on `vmin`, spacing `--sp-1..8`, radii, motion, focus ring, shadows, z-layers `--z-*`). **Additive changes only**; D, F and E read these names.
- `global.css`: reset, base font, `:focus-visible` ring, `.tnum`, `.srOnly`, reduced-motion defaults. The only global CSS in the app.
- `fonts.ts`: imports the self-hosted faces and exports `fontsReady()` and `fontsLoaded()`. The three variable faces must be imported **without** `.css` (`.../wght`), otherwise Rolldown fails. `fontsource.d.ts` declares those modules for `tsc` (it must not be named `fonts.d.ts`; TS would treat it as the output of `fonts.ts` and ignore it).

### `src/ui/brand/` (never imports the store; `store.ts` imports `sfx` from here, so importing the store would create a cycle)
- `Button.tsx` / `.module.css`: primary (stamped label, double violet border) and secondary. Props: PRD §16.5 plus additive `size: 'md'|'lg'`, `title`, `disabledReason`, `id`, `type`. `pending` shows spinner + `pendingLabel`, sets `disabled` + `aria-busy`, keeps the button's width (both labels share one grid cell). Each caller passes its **own** pending flag.
- `Chips.tsx`: `ModeChip` (plus additive `recordedAt`) and `HealthChip`. Text from `copy.chips`, `copy.replayChip`, `copy.healthChip`. HealthChip's visible text is `aria-hidden`; a separate `srOnly role=status` announces state changes only (tick/block counters change every 400 ms).
- `Refs.tsx` + `HexRef.tsx` + `clipboard.ts`: `Address` / `TxLink`. Truncated mono text linking to MonadVision, a copy button with "Copied" feedback, a `⋯` menu with Monadscan. Uses `explorerAddress` / `explorerTx` from `@/chain`. `copyText()` falls back to a hidden textarea. **The only place raw hex may be rendered.**
- `Stamp.tsx` / `.module.css`: failed = double-border rectangle (+ optional Marathi line), survived = round "PAID IN FULL" seal. Ink = SVG `feTurbulence` displacement + speckle mask, `mix-blend-mode: multiply`. Slam via `motion`'s `animate`: 140 ms scale 2.2→1 and rotate −14°→−7°, then `onImpact`, a 0.98 squash, and a ±6 px shake of `#root`. Reduced motion = 150 ms fade, no shake. Additive props: `size`, `shake`, `reducedMotion`. D passes `shake={false}` and shakes itself.
- `sfx.ts`: Web Audio only (`unlock`, `alarm(on)`, `thud`, `seal`, `murmur(level)`, `setMuted`, `stopAll`, plus additive `isUnlocked`, `isMuted`). Prewarms the context and noise buffer on idle, arms its own first-gesture unlock, reads the mute flag from `localStorage['run.muted']` (the key F's store writes), and remembers a requested alarm until audio is unlocked.
- `PaperBackground.tsx`, `guilloche.ts`: deterministic rosette and wave SVG data URIs. `guilloche.ts` is also used by `scripts/og.ts`.
- `icons.tsx`: Check, Copy, Cross, External, More (exported from the barrel).
- `BrandLab.tsx`: `/lab/brand`. `?slam=1` slams both stamps on load.
- `__tests__/`: `copy.test.ts`, `format.test.ts`, `guilloche.test.ts`.
- `index.ts`: the barrel (PRD §16.5 + `copyText` + icons).

### `src/ui/panels/` (may import the store)
- `ProofPanel.tsx`: store-connected slide-over (`role=dialog`, focus moves in, `Esc` and the close button close it, returns focus; bottom sheet at ≤ 640 px). Also exports `ProofContent` (pure, takes a `ProofData` slice) so the lab can feed fixtures. `useProofData()` selects primitives and store-owned references only (nested fresh objects would re-render forever with `useShallow`).
- `proofModel.ts`: pure derivations: `isFinalized`, `biggestBatch`, `verdictSeal`, `buildProof`, `agreement`. Practice or all-simulated seals never claim transactions.
- `OpsPage.tsx` (store wiring, downloads the replay JSON) and `OpsView.tsx` (pure view: stepper, four step cards, preflight list, bank actions, footer). `opsModel.ts`: `deriveSteps`, `checksForStep`, `checkKey(s)`, `checkRpc`.
- `ReplayPicker.tsx` (+ `ReplayPickerView`), `replayModel.ts` (`sortReplays`, `ReplayListState`).
- `ModeBanner.tsx` (+ `ModeBannerView`): practice / replay / spectate banners; dismissible on desktop, persistent ≤ 640 px; writes its height to `--banner-h` on `<html>` (px). Live mode renders nothing.
- `ClosingCard.tsx` (+ `ClosingCardHost`: owns the `L` key and `Esc`), `closingModel.ts` (`publicBase`, `displayUrl`). Mounted once in the shell by F (`routes.tsx`).
- `PanelsLab.tsx` + `fixtures.ts`: `/lab/panels`. Tabs: proof, ops, replays, banners, closing card, connected (store). Query params: `?tab=proof|ops|replays|banners|closing|connected`, `&open=1` (closing card), `&fake=failed|survived` and `&proof=1` (connected tab).
- `__tests__/`: `proofModel`, `opsModel`, `replayModel`, `closingModel`.

### Elsewhere
- `src/ui/copy.ts`: the copy deck (see §4). `src/ui/format.ts`: formatters (`fmtAusd`, `fmtUsdScaled`, `fmtAusdWithUsd`, `fmtMon`, `fmtSeconds`, `fmtBlock`, `shortHex`, `fmtBps`, `fmtClock`, `fmtCount`, `fmtRecorded`, `fmtSealTime`, `fmtGas`, `fmtTimeOfDay`; all money maths is `bigint`, never shows base units).
- `public/og.png` (1200×630), `public/favicon.svg` (violet stamp with "!"), `scripts/og.ts` (`pnpm og`).

## 3. Who uses what (integration contracts to keep stable)

- **F** (`app/routes.tsx`): mounts `PaperBackground`, `ModeBanner`, `ProofPanel`, `ClosingCardHost` in the stage shell; routes `/ops` → `OpsPage`, `/replay` → `ReplayPicker`, `/lab/brand`, `/lab/panels`. `store.ts` imports `sfx`. `hotkeys.ts` calls `sfx.unlock()` on every key press.
- **D** (`ui/stage/*`): `Button`, `ModeChip`, `HealthChip`, `TxLink`, `Stamp`, `sfx`, `PaperBackground`, and the whole copy deck through `stageCopy.ts` (reads `copy.stage.*` first, then `banks`, `cards`, `buttons`, `phases`, `chips`, `passbook.rows` with keys `bank/amount/span/note`). Stage height uses `--banner-h`.
- **C**: `preflight.ts` ids drive `opsModel.ts`. `STEP_IDS` maps `key|operatorMon|backupMon` → step 1, `rpc|blocks|rpc:*` → step 2, `bank|status|ausd|ledger|config` → step 3. `ping` and any unknown id show in the Preflight list and count toward "canGo" (`preflight.ok`) but belong to no step. **If C renames or adds ids, update `STEP_IDS` in `panels/opsModel.ts` and its test.**
- **Types**: `RunView`, `SealRecord`, `Outcome`, `ReplayFile` (PRD §16.1, in `app/src/types.ts`). The proof panel reads `seals` (rumor = `kind 'rumor'`, biggest batch = `kind 'ticks'` with max `requestedCount`, verdict = the ticks seal whose `fromTick..toTick` contains `outcome.tick`), `outcome`, `finalizedBlock`, `mirror`, `decisions`, `onchain.streetHeld`, `deployment`, `replay`.
- **Do not rename or retype** anything in the PRD §16.5 signatures. Additive only.

## 4. Copy deck map (`copy.ts`)

`brand` (title, description, og*), `scale`, `banks`, `cards`, `buttons`, `phases`, `chips`, `replayChip()`, `chipHints`, `health`, `healthChip()`, `healthDetail`, `errors` (+ `errorActions`), `stamp` (+ `failedSub`/`survivedSub`), `passbook` (verbatim PRD §8.1 figures), `banners`, `proof` (incl. `proof.model`, B's plain-language model text), `ops` (steps, key, preflight, actions, go, footer, stepBody, stepState, deployHint), `replays`, `closing`, `labs`, `generic`, `value`, and `stage` (68 keys for D plus `sealKinds`, `axisTicks`). Rule: components contain no user-facing literals; add a key here instead. Sentence case; only stamps are all-caps. `copy.brand.ogStamp` / `ogStampSub` / `ogKicker` / `ogLine` / `ogFootnote` feed the OG card.

## 5. How to run and check

- Unit tests: `cd app && pnpm exec vitest run src/ui` (E only) or `pnpm exec vitest run` (all). Types: `pnpm exec tsc -b` (errors in other agents' in-progress files are not E's). Lint: `pnpm exec oxlint src/ui/brand src/ui/panels src/ui/theme src/ui/format.ts src/ui/copy.ts scripts/og.ts`.
- Labs (dev server on 5175): `/lab/brand`, `/lab/panels?tab=…` (see §2).
- Real-data check of the proof panel without any transaction: open `/replay/bhaus-w-failed-202610100809`, press `P`. Expected: "8 / 8 ticks: screen and chain agree", Decision check 8 of 8, biggest batch 153 depositors / 754,187 gas / 0.89 s, verdict `BankFailed` tick 8, 335 trapped with 3,558 AUSD.
- OG card: `cd app && pnpm og` (about a minute, needs Chrome; `CHROME_PATH` overrides). It writes `public/og.png` and checks that it is 1200×630. Why Chrome and not `resvg`: @fontsource ships woff2 only and `resvg` reads ttf/otf only; Chrome reads the same woff2 files so the card uses the real faces and the same ink filter as the in-app stamp.
- Contrast numbers (WCAG, on `--paper` or `--slip`): ink 13.5, ink-2 7.4, ink-3 5.2–5.8, seal 5.6–6.2, ok 5.2–5.4, rumor-text 4.66–5.3, run-text 4.73–5.4, white on seal 6.7. `--run`, `--rumor`, `--trapped` are for graphics and large text only. Never set small text in them.

## 6. Gotchas that cost time (so you do not repeat them)

- Tooling: the in-IDE browser throttles `requestAnimationFrame` to ~2 fps, so JS-driven animations (the Stamp via `motion`) look stuck there. Check the Stamp in headless Chrome with `--virtual-time-budget` (it completed: impacts fired, final transform `rotate(-7deg)`, `#root` transform cleared) or in a real browser. Headless Chrome will not lay out narrower than about 500 px, so use 500 px or an iframe harness for "375 px" checks. The automated tool review has at times blocked helper scripts that launch headless Chrome; the in-IDE browser plus measurements is the fallback.
- `Stamp` shakes `#root` with a transform and clears it afterwards; any leftover inline transform would make `#root` the containing block of fixed layers.
- Vite's dependency optimiser sometimes reloads the page when another agent adds an import; a blank page with "Invalid hook call" right after is transient.
- `oxlint` rule `only-export-components`: keep helpers out of component files (that is why `clipboard.ts`, `replayModel.ts` exist).
- Under `verbatimModuleSyntax` / `erasableSyntaxOnly`: no enums; `import type` for types.

## 7. Open items (with owner and exact next step)

None of these blocks E's own work. Statuses as of 14:25.

1. **One Live run with the proof panel open (owner: F, or the human).** Why: the Live-only fields (`RunView.onchain.streetHeld` → "AUSD that left the bank", `finalized` ticks from `finalizedBlock`, `mirror` from real seals) have only been seen on fixtures and on a recorded replay. F said it will do this with the backup key after taking C's lock (`LIVE BANK: F until HH:MM` at the top of `docs/status/F.md`). Steps: start a Live run from the stage, press `P` while it runs and after the verdict. Expect: rumor tx with block, sealed time and "✓ finalized" once `blockNumber ≤ finalizedBlock`; "N / N ticks: screen and chain agree" with a green check; biggest batch; verdict row with trapped and uninsured amounts; "AUSD that left the bank" matching Street's balance; Contracts rows with `Verified source` links. Report mismatches in this file; E fixes `proofModel.ts` / `ProofPanel.tsx`.
2. **Preflight rows "Fonts loaded, audio unlocked, window ≥ 1280×720" (owner: C in `chain/preflight.ts`, or F).** PRD §12.5 lists them as non-critical; nobody calls E's helpers yet. Use `fontsLoaded()` from `@/ui/theme/fonts` (import by path; `theme` has no barrel), `sfx.isUnlocked()` from `@/ui/brand`, and `window.innerWidth >= 1280 && window.innerHeight >= 720`. Use ids `fonts`, `audio`, `window`, `critical: false`. They will show in the Preflight list automatically; E needs no change (they belong to no step, by design).
3. **Replay "Sealed" time for the rumor (owner: C recorder + F, optional).** `ReplayFile.rumor.sealedAtMs` now exists (ms after the rumor receipt, C writes `0`), but it is relative, so it still cannot give a wall-clock time. E hides the row in Replay mode on purpose. To show a real time, the recorder would need an absolute `rumor.sealedAt` (epoch ms) and F would set the rumor record from it. If that lands, remove `&& !recorded` in `ProofPanel.tsx` (the `model.rumor.sealedAtMs !== null && !recorded` line) and the row will show it.
4. **If recorded data or the model changes (owner: B / F).** The OG card says "BANK FAILED in 4.2 s · 14 Monad blocks" (the committed `bhaus-w-failed-202610100809` replay: tick 8, 4.2 s, 14 blocks). If B changes `model.json`/`cards.json`/`configs.json`/`ledger.json` and F re-records, edit `copy.brand.ogStampSub` in `copy.ts`, run `pnpm og`, commit `public/og.png`, and ask F to redeploy.
5. **Redeploy after any E change (owner: F).** Vercel uploads the working tree, so E changes (copy, panels, `og.png`) go live only after F's `vercel deploy` and `pnpm verify:deploy`.
6. **Visual QA that needs a real display (owner: human, with D).** 4 m projector legibility of the chips, banner, proof panel and closing card; keyboard-only pass of `/ops` (Tab order: stepper is not focusable; step 1 inputs → buttons → details; `Esc` closes the proof panel and the closing card); reduced-motion pass (OS setting on: stamp should fade in, no shake, spinner becomes a dotted ring). E already measured contrast and checked layouts at 1280×720, 1920×1080 and a phone width in headless Chrome and the in-IDE browser.

## 8. Known limitations and deliberate choices

- Brand components are prop-driven only (no store). That is why `ModeChip` takes `recordedAt` as a prop and `HealthChip` takes `sealedTick`/`blockNumber`.
- The ops page never keeps keys in React state after "Load keys": fields clear on success and the controller stores keys in `sessionStorage`. The page shows only derived addresses and the operator MON balance (backup balance is not in `RunView`, only its address).
- "Reconnect with this RPC" (network step) re-reads the keys from `loadOperatorKeys()` and calls `connectOperator` with the new override. It does nothing if no key is stored.
- `ProofPanel` shows the Street figure only when `RunView.onchain` is set (Live and Spectate). In Replay it is hidden, because the recorded run has no live snapshot.
- Banner dismiss state is per mode and per page load, not persisted.
- `ModeBanner` text on the stage is kept at 18 px or larger; chip text is 18 px (PRD §14.4: nothing smaller than 18 px on the stage).
- Passbook rows in `copy.passbook.rows` use `bank/amount/span/note`. D already reads that shape.
- The OG script is slow (a fresh Chrome profile each run) and needs Chrome installed.

## 9. Resolved requests (index, so nobody redoes them)

F: font import fix; `ClosingCardHost` mounted + `L` in `HOTKEYS` (F, `6b56a7a`); selector warning fixed. D: `copy.stage` group; `sfx` prewarm; `recordedAt` passed to `ModeChip` (D did it); `--banner-h` used by the stage (D did it). B: plain-language model text in the proof panel; measured values, not the PRD script's 5.4 s / 13 blocks. C: nothing pending for E except item 2 above.

## 10. If you change E code

- Keep PRD §16.5 signatures; add, never rename. Run `pnpm exec vitest run src/ui && pnpm exec tsc -b` before committing. Commit only E paths: `git add <paths> && git commit -m "E: …" -- <paths>`. Never `git add -A`, `stash`, `reset`, `checkout --`, `restore`, `clean` (PRD §17.3).
- New user-facing text goes in `copy.ts`. New colours or sizes go in `tokens.css` (additive). New hex or address display goes through `Address` / `TxLink`.

## 15:40 — follow-up pass (E)

### Part 1: Live-only proof panel problems — waiting, nothing to fix yet
F's "Live UI check" section does not exist yet (F.md 15:25 says it starts only on the human's "F: go live"), and there is no open `REQUEST → E` about the proof panel. I changed nothing in `proofModel.ts` / `ProofPanel.tsx`. When F's section lands, I will first write a failing unit test in `panels/__tests__/proofModel.test.ts` for each Live-only problem, then fix it. **REQUEST → F:** after the live run, paste what the open proof panel showed for: "AUSD that left the bank" vs Street's balance, "✓ finalized" on the rumor and verdict transactions, "N / N ticks: screen and chain agree", biggest batch (count, gas used, seal time), and the verdict trapped/uninsured lines. If they differ from the stage vault or the explorer, say which one is wrong.

### Part 2: fonts / audio / window rows — done
F's commit `8964192` landed (the rows come from `environmentChecks()` in `store.ts`). Checked `/lab/panels?tab=ops` with a fixture that contains `fonts`, `audio`, `window`:
- They appear in the Preflight list only. None is inside a step card (`inSteps: 0`), the current step stays "Fund the bank", and "Go to stage" stays disabled / unchanged. Covered by new tests in `panels/__tests__/opsModel.test.ts` (no step claims them; steps, `current` and `canGo` identical with them passing, failing or pending).
- Rendering: at 1280×720 no horizontal overflow; at 375 px no overflow and no clipped rows.
- One change, F's optional request: a non-critical `fail` row was drawn red like a blocker. It is now drawn as an amber "advisory" row (`rowLook()` in `opsModel.ts`, used by `OpsView.tsx`); the status word still reads "Fail · Optional", and red stays reserved for critical failures. `STEP_IDS` is unchanged. Fixtures now include the three rows in all-pass (all pass) and mixed (audio warn, window fail).

### Checks
`pnpm exec vitest run src/ui` 76 passed; `pnpm exec tsc -b` clean; `oxlint` clean on `ui/panels`. No transactions sent, no keys touched.

E: done for Part 2 (Part 1 waits on F's live check; nothing else outstanding). F may deploy now; the E changes in this pass are `panels/opsModel.ts`, `panels/OpsView.tsx`, `panels/fixtures.ts` and `panels/__tests__/opsModel.test.ts`.
