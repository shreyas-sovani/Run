# Agent F status

app/ exists — B, C, D, E can start

BOOTSTRAP DONE (CP0)

## 12:50 — CP0 report (F)

**Done**
- F-00 bootstrap committed (`2373093 F: bootstrap`). `pnpm dev --port 5173` shows the stage stub; `/`, `/watch`, `/replay`, `/replay/:id`, `/ops`, `/lab/stage|brand|panels|chain|engine` all render (checked in headless Chrome). `pnpm build` passes; `pnpm test` passes; `pnpm typecheck` is clean for everything I own.
- Real F files: `src/app/{state,store,controller,hotkeys,routes,App}.ts(x)`, `src/app/fixtures/fakeRun.ts`, `src/main.tsx`, config files. `startFakeRun` works (test in `src/app/__tests__/fakeRun.test.ts`: contiguous ticks, no duplicates even when started twice).
- Placeholders created in your paths now belong to you: B `engine/{index,fixture}.ts`, `engine/lab/EngineLab.tsx`; C `chain/index.ts`, `config/network.ts`, `chain/ChainLab.tsx`; A `chain/abi/*`, `chain/gasModel.ts`, `config/deployment.testnet.json`; D `ui/stage/*`; E `ui/brand/*`, `ui/panels/*`, `ui/format.ts`, `ui/copy.ts`, `ui/theme/*`, `public/favicon.svg`. I will not edit them again.
- NOTE: my bootstrap commit used `git add app`, so it also swept in whatever A/B/C had already written under `app/` at that moment (A's real `abi/*`, B's `engine/prng*`). Contents untouched; ownership unchanged.

**Interface notes (read these)**
- Fixture engine (B's placeholder, still exported from `@/engine`): faithful PRD §9.4 `applyTick`; scripted spread. Bhau's Bank fails at tick 12, Monad Mutual survives at tick 25. Replace freely; F's controller only uses the §16.2 signatures.
- Stub mock adapter (C's placeholder) uses `applyTick` from `@/engine`, so the mirror check matches in Practice. `createLiveAdapter` throws "not implemented" until C-03 lands.
- **F mounts `ProofPanel` and `ModeBanner` in the shell around `StageScreen`** (`app/routes.tsx`). D and E: don't mount them yourselves. `PaperBackground` is also mounted by the shell on stage routes (D: don't add a second). D still owns the Help overlay, passbook and stamp placement inside `StageScreen`.
- Labs `ChainLab` (`@/chain/ChainLab`) and `EngineLab` (`@/engine/lab/EngineLab`) are imported by path and lazy-loaded; keep those file paths and export names.
- `tsx` scripts can use the `@/` alias (root `tsconfig.json` now carries `paths`). `tsconfig.app.json` now has `types: ["vite/client","node"]` so tests can use `node:` modules.
- `@/app/store` is the only public app surface. `useRunView` / `useUi` use shallow equality (selectors should return primitives or stable references).
- Hotkeys are registered once at module level in `main.tsx`; `Shift+R` calls `runActions.setMode('replay')` (the controller resolves the newest replay in F-07).
- Build id (`__BUILD_ID__` = git short sha + ISO time) is defined in `vite.config.ts` for E's `/ops` footer.
- `.gitignore` ignores `.env*` except `.env.example`. There is a root `.env` (ignored); nobody should commit it.

**Next**: F-05 controller (Practice on the mock adapter), then F-07 replay; F-06 live once C's live adapter and A's deployment land.
**Blocked by**: nothing.
**REQUEST →**: none yet.

## 13:05 — update (F)

**Done**
- F-05 RunController, Practice mode (`6bc52ac`): module singleton, 400 ms clock, `MAX_LEAD` hold, SealQueue + mirror check per tick, outcome only from the sealed outcome event, reset / switch bank / pending flags. Test `src/app/__tests__/practice.test.ts` drives Bhau's (fails) then Monad Mutual (survives) with doubled `init`/`setMode`/`start` (StrictMode shape): one runner, contiguous ticks, mirror matched = total.
- F-10 index.html: title, description, `og:*`/`twitter:*` with absolute `%VITE_PUBLIC_URL%/og.png`. `vite.config.ts` falls back to `VERCEL_PROJECT_PRODUCTION_URL`, then `http://localhost:4173`, and strips a trailing slash.

**REQUEST → E**: `src/ui/theme/fonts.ts` breaks `pnpm build` (Rolldown can't resolve it). The three variable-font packages map `./*` to `./*.css`, so `.../wght.css` becomes `wght.css.css`. Use `@fontsource-variable/big-shoulders-display/wght`, `@fontsource-variable/atkinson-hyperlegible-next/wght`, `@fontsource-variable/atkinson-hyperlegible-mono/wght` (no `.css`). The `@fontsource/doto/latin-600.css` and `@fontsource/tiro-devanagari-marathi/*.css` imports resolve fine as written (checked with `require.resolve`).

**Next**: F-07 Replay mode + `Shift+R`; then F-08/F-09; F-06 Live when C's live adapter lands.
**Blocked by**: nothing (the font import only blocks `pnpm build`, not dev or tests).

## 13:12 — update (F resumed by a fresh agent after a limit stop)

**Done** (commit `5e935ec`)
- F-06 Live mode in the controller, written against the frozen `ChainAdapter` interface only: `autoConnect()` (called once from `main.tsx`; keys from session or local `.env.local`, then preflight), `connectOperator` / `disconnectOperator` / `switchToBackupKey` / `runPreflight` / `fundBank` / `ping`, operator balance poll every 10 s, `onchain` snapshot poll every 2 s plus one after each seal, low-balance guard (refuse < 10.5 MON with a "Switch to backup key" action), and `start()` that syncs with the chain first (Reset if the bank isn't Ready → "Resetting the bank…", `setLevel` if the onchain level or `configHash` differs → "Switching bank…", then `startRumor`). Outcome comes only from the sealed outcome event; `sealed: true` for live.
- F-08 Spectate session: `createSpectator()` events → `createRun` from the rumor, `stepRunWithRequested` per `TickSealed` (buffered, applied in tick order), per-tick summary checked against the mirror, outcome from the chain event, reset event clears the stage.
- F-09 Decision check: after an outcome in live / replay / spectate, `verifyDecisions` runs on the chain's request lists (deferred, never blocks the stamp) → `RunView.decisions`.
- Tests (`src/app/__tests__/live.test.ts`): live run on a fake "live" adapter (preflight, doubled `start`, failed → reset → switch bank → survived, decision check, replay file), low-balance guard + backup key, disconnect, spectate with out-of-order chunks. No testnet traffic, no real keys. All app tests pass (`pnpm vitest run src/app`), `pnpm build` passes.
- Vercel project linked (`run-bank-run`, root `app/`). `app/.gitignore` now keeps `.env.example` tracked.

**Interface notes**
- `runActions.setMode(mode, { replayId?, auto? })` — `auto` is additive; routes pass it so a route-driven practice↔live switch never tears down a run in progress. `setMode('live')` falls back to Practice when no operator is connected.
- `runActions.connectOperator` validates both keys, stores them in `sessionStorage` (ignored if storage is unavailable) and runs preflight. `RunView.preflight` is set from `adapter.preflight(model)`.
- Error actions (`retry | reset | replay | ops | backup`) are rendered by D/E. Mapping: `retry` → `runActions.retry()`, `reset` → `runActions.reset()`, `replay` → `runActions.setMode('replay')`, `backup` → `runActions.switchToBackupKey()`, `ops` → navigate `/ops`.
- `main.tsx` calls `controller.autoConnect()`; it's a no-op when no keys are present (Vercel) or the bank isn't deployed.

**Blocked by**
- **C**: `createLiveAdapter` in `@/chain` is still the bootstrap stub that throws, and C's status file is empty. Until C-03/C-04/C-06 land, `autoConnect` records a failed preflight and the stage stays in Practice. F-06's "full live run on testnet" can't be verified before that.
- Vercel deploys need the human's approval in this session (auto-review blocks `vercel deploy` / `vercel env add`). `VITE_PUBLIC_URL` is not needed as a Vercel variable: `vite.config.ts` falls back to `VERCEL_PROJECT_PRODUCTION_URL`.

**REQUEST → C**: ship `createLiveAdapter`, the real `SealQueue` (`createSealQueue`) and `createSpectator` in `@/chain` as soon as they work; F's controller already consumes them through the §16.3 interfaces. Also keep `saveOperatorKeys` safe when `sessionStorage` is missing (the placeholder `index.ts` version throws under Node/tests; `keys.ts` is fine).
**REQUEST → D / E**: error banners must handle `action.run` as listed above; the stage vault should read `RunView.onchain` (real AUSD) in Live and Spectate.

**Next**: F-14 runbook, F-15 README, F-13 QA code scan, Vercel preview (needs approval), F-12 replays once a live run exists.

## 13:20 — update (F)

**Live mode verified on Monad testnet** (headless, through the real RunController: `pnpm live:e2e`, commit `HEAD`)
- Preflight all green (3 RPCs, block feed, operator 39.8 MON, backup 75 MON, bank Ready, 10,000 AUSD, ledger + config hashes match, ping sealed in ~1.2 s).
- Bhau's Bank × W: **FAILED** at tick 3, wall 2.4 s, 8 blocks, 429 trapped, mirror 3/3, decision check 3/3, `sealed=true`.
- Monad Mutual × W: **SURVIVED** at tick 36, wall 23.8 s, 79 blocks, 0 trapped, mirror 36/36, decision check 36/36; 15 batches, biggest 387 requests (1.41M gas).
- Bank reset to Ready afterwards. The controller's setLevel / reset / start sequencing worked on the real chain with no manual steps.
- Not yet recorded as replays: B is still tuning (Bhau's W fails at tick 3, the PRD target is tick 8–16, Mutual at tick 36 is near the limit of 40), and a replay recorded on an old model would drift. F will run `pnpm live:e2e --record` (writes `app/public/replays/*.json` + `index.json`) once B reports the model is final. **REQUEST → B: ping me in your status file when `model.json` / `configs.json` / `ledger.json` are final; if `configs.json` or `ledger.json` change, A must re-run `SetLevel` / `LoadLedger` first** (preflight checks both hashes).

**Done**: `scripts/verify-deploy.ts` (`pnpm verify:deploy <url> [--expect-build sha]`: routes, absolute og:image returns 200, no VITE_*PK, key-not-in-bundle check using `.env.local`, build id). Confirmed it flags a local build (which embeds `.env.local`); a local `dist/` must never be deployed.

**Blocked by**: Vercel deploy needs the human's approval in this session. E's `panels/index.ts` is mid-edit right now (`Cannot find name 'X'`), so `pnpm typecheck` shows transient errors from E's paths.
**Next**: F-13 QA pass after D/E land their screens; Vercel preview then production; record replays after B is final; rehearsals.

## 13:30 — update (F)

**Fixed (found in a real browser run)**: pressing `W`, `Enter` blanked the page with React's "The result of getSnapshot should be cached… Maximum update depth exceeded". Cause: `ProofPanel.useProofData` returns `{ …, practice: { tick, withdrawn, loss } }`, a new nested object on every call, so zustand's `useShallow` never saw equal results. I did **not** touch E's file: `useRunView` / `useUi` in `app/store.ts` now compare selector results one level deeper (`selectorEqual`, unit-tested), so the crash is gone. After the fix a practice run on the real engine plays to the BANK FAILED stamp with no console errors.
**REQUEST → E / D (nice to have)**: still prefer selectors that return primitives or stable references; nested objects deeper than one level will still loop.

**Verified on testnet**: `pnpm spectate:check` (read-only, Spectate mode through the real controller) followed a live Monad Mutual run started by `pnpm live:e2e`: mirror 36/36, decision check 36/36, outcome survived at tick 36 from chain data alone.
