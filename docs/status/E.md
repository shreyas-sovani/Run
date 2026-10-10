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
