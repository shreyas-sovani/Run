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
