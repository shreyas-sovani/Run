# Agent F status

**LIVE BANK: none (F finished its live pass at 15:31; bank left Ready, level 0, 10,000 AUSD, Street 0).** Protocol: whoever sends transactions writes `LIVE BANK: <agent> until HH:MM` here (or at the top of their own status file), uses a separate key where possible (F uses the backup key), and clears it when done.

**Taking over F? Read the section "HANDOFF (F, 14:25)" at the bottom of this file first. It is self-contained; everything above it is a dated log.**

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

## 13:50 — update (F)

**Vercel**: project `run-bank-run`, first deploy is live at **https://run-bank-run.vercel.app** (assigned to production as the project's first deployment; Deployment Protection doesn't block it: `/`, `/watch`, `/replay`, `/ops` all 200). `pnpm verify:deploy https://run-bank-run.vercel.app` passes routes, title, absolute `og:image` (200), and confirms neither local key is in the bundle. Build id was `nogit` for CLI uploads; fixed in `vite.config.ts` (`BUILD_SHA` env → `vercel deploy --build-env BUILD_SHA=$(git rev-parse --short HEAD)`, documented in README/runbook). Re-deploy after the replays and final model land.

**Replays (interim)**: recorded two real testnet runs with `pnpm live:e2e --record` (Bhau's × W failed, Mutual × W survived), committed under `app/public/replays/` with `index.json`. Verified in a browser (production build): `/replay` lists both, `/replay/<id>` plays to the recorded outcome with REPLAY chip + real MonadVision tx links, `Shift+R` from LIVE switches to the newest replay. **These must be re-recorded once B's model is final** (replays of an older model would drift in heard/panic visuals).

**Live in a real browser (production build, keys from `.env.local`)**: `/` auto-connects, preflight turns green, chip flips to `LIVE · sealed on Monad testnet`, `2 W Enter` runs Monad Mutual on testnet: real tx hashes in the ticker, "✓ finalized" fills in, `PAID IN FULL · 22.8 s · 76 Monad blocks`, passbook opens. No console errors.

**Tests**: `pnpm vitest run src/app` — 12 tests (practice, replay, live, low-balance + backup key, pause + retry on a seal failure, spectate, selector equality).

**REQUEST → D**: in Replay mode the vault caption still says "Practice: simulated balance" under a heading "Vault · real AUSD on Monad". Replay shows recorded real data; the caption should say it's recorded (copy via E's deck), not "Practice".
**REQUEST → B**: tuning targets (PRD §10.4): Bhau's × W currently fails at tick 3 (2.2 s; target ticks 8–16, 3.2–6.4 s). Please tell me when `model.json`/`configs.json`/`ledger.json` are final so I re-record replays and redeploy.
**Blocked by**: B's final model (for the final replays + production deploy).

## 14:15 — update (F): feature-complete on F's side

**Production**: https://run-bank-run.vercel.app, build `aa90f77`. `pnpm verify:deploy https://run-bank-run.vercel.app --expect-build aa90f77` → all checks pass: `/`, `/watch`, `/replay`, `/replay/<id>`, `/ops` return 200; title is correct; `og:image` is absolute and returns 200; `/replays/index.json` and a replay file return JSON; build id matches the commit; neither local key appears in the deployed JavaScript. No `VITE_*PK` was ever added to the Vercel project (and the build guard would fail the build if one were).

**Final replays** (recorded on B's tuned model, real testnet runs via `pnpm live:e2e --record`): `bhaus-w-failed-…` (tick 8, 4.2 s, 14 blocks), `mutual-w-survived-…` (tick 25, 11.2 s, 37 blocks), `bhaus-r-failed-…` (tick 10, 6.2 s, 20 blocks). `Shift+R` plays the newest (currently Bhau's × R). If you want a different default, run `pnpm live:e2e --record --runs <level:card>` last.

**Full live check on the tuned model** (4 consecutive runs, each reset and `setLevel` handled by the controller): Bhau's × W failed t8, Bhau's × R failed t10, Mutual × W survived t25, Mutual × R survived t34; mirror matched every tick (`N/N`), decision check `N/N`, bank back to Ready.

**QA (F-13) results**
- Code scan: no `Math.random` in engine code, no `enum`, RPC URLs only in `config/network.ts`, raw hex only in labs/tests, no shared `isLoading`, title and favicon are not Vite defaults, `og:image` absolute.
- Behaviour: StrictMode safe (module singleton; doubled init/setMode/start in tests); Practice, Replay, Live and Spectate show the right chip (checked in a browser for Practice, Live, Replay); stamp only after the outcome receipt (live); mirror `N/N`; pause + retry covered by a test; revert path surfaces the translated error.
- Not done by me (needs eyes on the real display): 4 m projector legibility, screenshots at 1280×720 / 1920×1080 / 375×812 for every phase, reduced-motion emulation, keyboard-only pass, DevTools-offline pass (my offline emulation through the browser tool didn't actually cut the page's RPC traffic, so it proved nothing; the pause/retry logic is unit-tested instead).
- `pnpm typecheck` clean, `pnpm test` 246 passed / 7 skipped (30 files), `pnpm build` passes.

**Open items for the human**
1. Rehearse 5× on the demo laptop (runbook §7 log), once with the network cut and `Shift+R`.
2. Demo-day checklist (operator ≥ 15 MON, bank Ready, phone hotspot, Chrome profile, screen recording on the desktop).
3. If anyone changes `model.json`, `cards.json`, `configs.json` or `ledger.json` after this point: re-record the replays, redeploy (`vercel deploy --cwd app --prod --build-env BUILD_SHA=$(git rev-parse --short HEAD)`), and re-run `pnpm verify:deploy`.
4. The Vercel upload is the working tree at deploy time (not just committed files); redeploy after the final commits from A–E.

## 14:40 — C's requests (F)
- Added `"chain:fork": "tsx --env-file=.env.local scripts/chain-fork.ts"` to `app/package.json`.
- Ran `pnpm chain:smoke --run` on the tuned model: real run through the SealQueue sealed 19 ticks in 8.41 s, mirror 19/19, gap-free, outcome survived at tick 19, then reset (bank Ready, 10,000 AUSD, Street 0). Operator spent 0.130 MON. Gas log: estimate vs used is exact (limit == used) at +10% of estimate; the A formula is above the estimate in every row, so it's safe but loose.

## 13:45 — REQUESTS from D (appended by D at the human's request; F: tick these off in your own words when done)
- [ ] **Mount the closing card**: E shipped `<ClosingCardHost />` (self-contained, owns the `L` key and `Esc`). It must be mounted once in the stage shell in `app/src/app/routes.tsx` next to `ProofPanel` (E-10 notes in `docs/status/E.md`). D will not mount it. Optionally add `L` to `HOTKEYS` so the help overlay lists it.
- [ ] **Replay ticker shows "0 withdrew"** for every batch: replay `SealRecord`s get `requestedCount` 0 (the `ReplayFile.seals` entries carry no count). Please fill `requestedCount` from the recorded `ticks[].requested.length` summed over `fromTick..toTick` (the ticker prints it).
- [ ] **P2 pick-the-rumor-starter** (optional): add `runActions.selectSeed(node: number | null)` (additive) so `start()` uses it instead of the card's `seedNode`; optional `RunView.seedNode: number | null`. D's canvas already hit-tests, shows hover and selected rings, and calls it only if it exists.
- Already fixed on D's side: the "Practice: simulated balance" caption in Replay (now "Recorded from Monad testnet", commit `7303bc8`); error `action.run` mapping; vault reads `onchain.ausdHeld` in Live/Spectate.

## 13:45 note from A (coordination, not a contract blocker)
- **REQUEST → F**: before `pnpm live:e2e` / `--record` / any live run, please check `snapshot().status` is `Ready` and tell C in `status/C.md` that you are mid-run; C's `chain:smoke` resets the shared bank if it isn't `ready`, which would kill your run. Operator-key nonces collide when two processes send at once ("EOA nonce changed unexpectedly"). Best option: use the backup operator key (`0xFeAf…690A`, also an operator on the bank, holds MON and AUSD) for `live:e2e` and the primary for C's smoke, so they never share a nonce.
- Bank is at Ready / level 0 / 10,000 AUSD right now. `ledgerHash` and `configHash` match B's current data, so no `LoadLedger`/`SetLevel` rerun is needed unless B changes `ledger.json` or `configs.json` (B says they haven't).


## REQUEST → F (from C, 14:00)

- Thanks for the `chain:fork` script. Acknowledging your earlier asks: `createLiveAdapter`, `createSealQueue`, `createSpectator` are shipped, and `saveOperatorKeys` / `clearOperatorKeys` no longer throw without `sessionStorage` (tests in `chain/keys.test.ts`).
- **Single writer on the live bank** (same as the note in A.md): please add `LIVE BANK: F until HH:MM` at the top of this file while `live:e2e` or a rehearsal is sending transactions, and clear it after. C will check it before any live smoke.
- **Gas data for A (nice to have):** next time you run `pnpm live:e2e`, print `adapter.gasLog` (it is on the `LiveAdapter` returned by `createLiveAdapter`; each row has ticks, ids, slots, estimate, formula, limit) and paste the level-1 rows into `status/C.md`. A can tighten the level-1 gas envelope from that.
- `SealQueue.onError` fires only on a real pause (revert, desync, timeout retries exhausted, outage > 6 s). If the controller wants a softer "offline, retrying" banner earlier, use `onHealth('offline' | 'delayed')`.

## REQUESTS → F (from B, 13:45)
1. `app/package.json` (additive, yours): add `"gen:model": "tsx scripts/gen-model.ts"`. B added `scripts/gen-model.ts` (rebuilds `model.json` inputs + `modelHash` after any change to graph/ledger/configs/cards) and has no pnpm alias for it.
2. Optional: nothing typechecks `app/scripts/*` (`tsconfig.node.json` only includes `vite.config.ts`). B verified `scripts/gen-*.ts` and `scripts/tune.ts` are clean by hand; adding `scripts/**/*.ts` to a tsconfig `include` would keep it that way.
3. For D's "pick who starts the rumor" (`runActions.selectSeed`): the engine side is ready. `defaultParams(model, level, card, seedNode?)` takes the chosen node as a 4th argument; `start()` should pass it through. The model seed stays the per-card constant.
4. FYI: `model.json` is **final** as of `modelHash 0xebcb6f1fde8a1620645699edd5d54e1219966fe1c14c778f794dfb6d62b40c96`. Your replays (`public/replays/*.json`, recorded 13:39) carry this exact hash, so they are valid. If B ever changes the model it will say so in `status/B.md` and you must re-record.

## 14:50 — what is blocking F, and who should solve it (F)
The F backlog is feature-complete; these are the only things between F and "done". Each is also written as a REQUEST in the owner's status file.

| # | Blocker | Owner | Why it blocks F |
|---|---|---|---|
| 1 | Advisory lock + `LIVE BANK:` check in `chain:smoke` / `chain:fork` (and nonce-drift fail-loud) | **C** (A to stay off the bank while a `LIVE BANK:` line is up) | F won't send live transactions (re-record replays, rehearsal runs, gas-log paste) while several writers share one operator key. F will switch `live:e2e` to the backup key and take the same lock once it exists |
| 2 | Healthy runs show amber "Sealing delayed" (batch 0.9–1.6 s ≈ tick rate; extra `estimateGas` round trip per send) | **C** (decide `formula` gas mode or cached estimate; A only if the formula changes) | Affects how the demo looks; F can't fix it without touching `chain/` |
| 3 | MonadVision shows a partial source match for the contracts | **A** | PRD §21 and the proof panel's explorer links promise "verified"; README/runbook wording depends on it |
| 4 | `sfx.ensure()` blocks ~450 ms on first alarm | **E** | A dropped frame at the moment cash hits zero |
| 5 | Visual QA on a real display (1280×720 / 1920×1080 / 375×812, reduced motion, keyboard-only, projector legibility) | **D** (stage), **E** (panels/brand), **human** (projector, 5 rehearsals, demo-day checklist) | F can't judge these from a headless page; F-13 can't be signed off without them |

Not blockers (F's own queue, doing next unless told otherwise): mount E's `<ClosingCardHost />` + `L` hotkey; `requestedCount` on replay seals; `runActions.selectSeed` + `RunView.seedNode` (passing `seedNode` into `defaultParams`); `gen:model` script alias; tick off D's 13:45 list above.
Nothing is blocked on A (contracts final, hashes match) or B (`modelHash 0xebcb6f1f…` final). Vercel deploys work (the human's approval card is needed each time).

## 14:55 — resolved (F)
No live transactions were sent in this pass (LIVE BANK: none), so nothing here touched the shared bank or other agents' work. Commit `6b56a7a`; typecheck clean, `pnpm test` 264 passed / 7 skipped, build passes; production redeployed (build `abfbdb9`) and `pnpm verify:deploy` passes (routes 200, absolute `og:image` 200, no keys in the bundle, build id matches).

D's 13:45 list
- [x] **Closing card**: `<ClosingCardHost />` mounted once in `StageShell` (`routes.tsx`); `L` added to `HOTKEYS` (help overlay).
- [x] **Replay ticker "0 withdrew"**: replay seals already get `requestedCount` summed from the recorded `ticks[].requested` over `fromTick..toTick`; the replay test and the production build show e.g. "tick 2–3 · 71 withdrew". Nothing more to do.
- [x] **Pick who starts the rumor (P2)**: `runActions.selectSeed(node | null)` + optional `RunView.seedNode` (additive). Only in Practice/Live while idle; out-of-range ids fall back to the card's node; cleared on reset/mode switch; `start()` passes it via `defaultParams(model, level, card, seedNode)`. Test added (the chosen depositor hears first).

B's requests: `gen:model` alias added; `seedNode` passed through `defaultParams`. (Not done on purpose: adding `app/scripts/**` to a tsconfig `include`, since it would put other agents' scripts into F's typecheck; I type-checked F's three scripts with a throwaway tsconfig instead: clean.)
C's requests: `live:e2e` now signs with the **backup** key by default (`--primary` to override), takes C's `scripts/chain-lock.ts` lock, and refuses while another agent's `LIVE BANK:` line is up (`--force` skips only the line). Not run, to avoid touching the bank. Printing `adapter.gasLog` still needs the adapter, which the controller doesn't expose; I'll add that when the next live pass happens.
E's requests: closing card mounted (above); `rumor.sealedAtMs?: number` added to `ReplayFile` (additive) and used by replay playback for the rumor's sealed time. **C**: please have the recorder emit it. Redeployed so `og.png` and E's changes are live.

Still open (not mine to solve here)
- One Live run through the stage UI with the proof panel open (E asked): needs a live bank slot. Waiting for C's lock to be adopted by everyone, then I'll run it with the backup key and write `LIVE BANK: F until HH:MM` at the top of this file first.
- Rows 2–5 of the 14:50 blocker table (C: sealing delay; A: MonadVision partial match; E: `sfx.ensure()`; D/E/human: visual QA, rehearsals).

## Reply → F (from C, 14:25)
1. **Lock is in**: `app/scripts/chain-lock.ts` exports `guardLiveBank({ agent: 'F', purpose, client, runBank, signer, status, isLocalRpc?, force? })` → `{ release, nonce }`. Wrap every send in `guard.nonce.run(() => adapter.x())`; call `release()` in a `finally`. It refuses on lock file, other agents' `LIVE BANK:` lines, or a Running bank with a recent event.
2. **Throughput**: default gas mode is now `formula` (A's envelope + queue hint, one retry at 2× limit on out-of-gas, then `estimate`). Real testnet, 20-tick soak: batch time mean **1.11 s → 0.83 s** (median 1.08 → 0.84), 2.86 → 2.22 ticks per tx. Costs about +0.2 MON per full run. `adapter.gasMode = 'estimate'` reverts it. Re-run your browser check; the amber "Sealing delayed" should be rarer.
3. **Recorder** now writes `rumor.sealedAtMs: 0` explicitly (t0 is the rumor receipt).
4. Bank is Ready, level 0 (my last reset); no `LIVE BANK` line from C is up. Full write-up in `status/C.md`.


---

# HANDOFF (F, 14:25) — self-contained; read this and you can continue F's work without any chat context

## 0. What RUN! is, in 6 lines
- "Plague Inc. for bank runs" for Monad Blitz Pune (judge-scored, solo live demo on a projector). Presenter picks a fictional bank (Bhau's Bank, no defences / Monad Mutual, speed bump + insurance) and a rumor card (`Q W E R`), presses `Enter`; 500 simulated depositors panic; the bank is a **real contract on Monad testnet (chain 10143)** holding real testnet AUSD; every tick is sealed in a real transaction; the contract decides failure/survival; a stamp slams when the chain's event arrives.
- Spec: `docs/PRD.md` (source of truth, §16 interfaces are frozen, additive-only). Task list: `docs/BACKLOG.md` (Workstream F = my section). Demo script/fallbacks: `docs/DEMO_RUNBOOK.md`. Repo overview: `README.md`.
- **Testnet only.** Never mainnet (chain 143). **Never print/commit/log a private key. No key in any Vercel env var.**
- Six agents (A contracts, B engine, C chain, D stage UI, E brand/panels, F integration) own disjoint paths (PRD §17.2). F owns: `app/src/app/**`, `app/src/types.ts`, `app/src/main.tsx`, `app/src/vite-env.d.ts`, `app/index.html`, `app/vite.config.ts`, `app/vercel.json`, `app/.vercelignore`, `app/.env.example`, `app/package.json`, `app/pnpm-lock.yaml`, `app/tsconfig*.json`, `app/public/replays/**`, `app/scripts/{live-e2e,spectate-check,verify-deploy}.ts` (my own helper scripts), `.gitignore`, `app/.gitignore`, `.monskills`, `README.md`, `docs/DEMO_RUNBOOK.md`, `docs/status/F.md`. **Do not edit other owners' files** (write `REQUEST → <letter>` in your own status file; the human has also let agents append to other status files).
- Git rules: `git add <explicit paths> && git commit -m "F: …"`. Never `git add -A`, `commit -a`, stash, reset, checkout --, restore, clean, rebase, pull. If `.git/index.lock` exists wait; never delete it.

## 1. Current state (verified 14:20 on `HEAD f9777f7`)
| Check | Result |
|---|---|
| `pnpm typecheck` (in `app/`) | clean |
| `pnpm test` | 31 files, 267 passed, 7 skipped |
| `pnpm build` | passes |
| Production | https://run-bank-run.vercel.app, deployed build **`abfbdb9`** (verified 14:00: routes 200, absolute `og:image` 200, no keys in bundle, build id matches). **Stale by two commits**: C's `f9777f7` (formula gas default, OOG retry) and D's `6603b7a` landed after it. Needs a redeploy (§7). |
| Testnet bank | `RunBank 0x2cD82EE2b3C19E996Fa9da80052e912A2E90F41D`, `Street 0x7998f16710Ab81AD2D68d7C0B7F0fd296CC7927D`, AUSD `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` (6 dp). Status **Ready**, level 0, runId 31, holds 10,000 AUSD, Street 0. |
| Wallets | operator `0x85db51Abac83F8B1DF2E674c29f8D68527Bf6b10` ≈ 34.2 MON (guard: warn < 15, refuse < 10.5); backup `0xFeAf5C921996FC53f4DEf35e181E766e6D74690A` ≈ 75.0 MON. Both are operators on the bank. |
| Model | `modelHash 0xebcb6f1fde8a1620645699edd5d54e1219966fe1c14c778f794dfb6d62b40c96` (B froze it; `v1-tuned`). Ledger v1 hash `0x8f5360480d2683535f631ce27694aa413c93ba286e2c56f80bfe426ec3324036` (loaded onchain). Configs unchanged since deploy. |
| Behaviour on the tuned model (live, real chain) | Bhau's × W fails tick 8 (~4.2 s, 14 blocks), × R tick 10 (~6.2 s, 20 blocks); Mutual × W survives tick 25 (~11 s), × R tick 34 (~16 s). Mirror `N/N` and decision check `N/N` every time. |
| Replays (committed, real testnet runs, carry the final modelHash) | `app/public/replays/{bhaus-w-failed-202610100809,bhaus-r-failed-202610100809,mutual-w-survived-202610100809}.json` + `index.json`. `Shift+R` plays the **newest** by `recordedAt` (currently Bhau's × R). |
| `LIVE BANK:` | none. No live transaction has been sent by F since ~14:00. |

## 2. Secrets and where they live (never print them)
- `app/.env.local` (gitignored): `VITE_OPERATOR_PK`, `VITE_BACKUP_PK`, `VITE_RPC_URL` (empty), `VITE_PUBLIC_URL=http://localhost:4173`, plus a `VERCEL_OIDC_TOKEN` line that `vercel link` added (harmless, not `VITE_`, don't commit). Root `.env` and `contracts/.env` also hold the two testnet keys (both gitignored). Everything `.env*` is ignored except `app/.env.example`.
- **A local `pnpm build` embeds `VITE_*` into `dist/`** (verified: `verify:deploy` flags it). So: never deploy `dist/`, never `vercel --prebuilt`. Deploy with the source upload command in §7; `app/.vercelignore` excludes `.env*`; `vite.config.ts` fails any Vercel build that has a `VITE_*PK` env var.
- The two keys appeared in earlier chat history; treat both wallets as disposable testnet-only.
- Automated review in this environment blocks some commands (Vercel deploy / env, anything that prints `.env*`). The Vercel deploy worked when retried with the approval flag so the human gets the approval card. Never `cat` `.env.local`.

## 3. What F built (files and behaviour)
**Store and state** — `app/src/app/state.ts` (zustand stores, `initialRunView`, `patchRun`, `patchPending`), `app/src/app/store.ts` (public barrel `@/app/store`: `useRunView`, `useUi`, `getRunView`, `subscribeRunView`, `runActions`, `uiActions`, `HOTKEYS`, `startFakeRun`, `selectorEqual`). `useRunView/useUi` use a custom equality (`selectorEqual`: Object.is → shallow → one level into plain objects) because E's `ProofPanel` returned a fresh nested object each call and crashed React with "getSnapshot should be cached". Selectors should still return primitives or stable references; nesting deeper than one level will loop.
**Controller** — `app/src/app/controller.ts` (~1100 lines), a **module singleton** (no React state; `init/setMode/start` are idempotent so StrictMode can't start two runners). It implements PRD §7.2:
- Practice: engine + mock adapter in the browser. Live: `createLiveAdapter` (C). Replay: `/replay/:id` and `Shift+R`. Spectate: `/watch` via `createSpectator`.
- 400 ms clock (`TICK_MS`), holds when the engine is `MAX_LEAD` (6) ticks ahead of the last sealed tick (health `delayed`), pushes `TickPayload`s to C's `SealQueue`, applies `SealResult`s, checks each `TickSealedEvent` against the engine mirror (`mirror.matched/total`), shows "Sealing the verdict…" then sets `outcome` **only** from the sealed outcome event.
- `start()` in Live: low-balance guard (refuse < 10.5 MON, offers "Switch to backup key"), reads the chain snapshot, resets if the bank isn't Ready ("Resetting the bank…"), `setLevel` if onchain level or `configHash` differs ("Switching bank…"), then `startRumor`; clock starts at the receipt.
- Snapshots: onchain snapshot poll every 2 s + after each seal; operator balance every 10 s; seals flip to "✓ finalized" when the finalized block passes them (`markFinalized`).
- `autoConnect()` (called once from `main.tsx`): if keys exist (sessionStorage or local env) and the bank is deployed, connect and run preflight (this sends one `ping` tx, ~0.001 MON, per page load). `HomeRoute` flips Practice→Live when preflight passes; `setMode(…, {auto:true})` never tears down a run in progress (practice↔live only).
- Errors from the queue pause the stage (`phase 'paused'`, `RunView.error` with an `action.run` of `retry|reset|replay|ops|backup`, rendered by D's TopBar). Retry resumes the same run (tested: no tick skipped or duplicated).
- Replay: `playReplay` re-derives frames with `stepRunWithRequested` from the recorded request lists, schedules seals/outcome at recorded times, real tx hashes; sums `requestedCount` per seal; uses optional `file.rumor.sealedAtMs`.
- Spectate: buffers `TickSealed` events, applies them in tick order, checks the mirror, outcome from chain event, `onReset` clears. Verified against the live bank.
- Decision check: after any outcome `verifyDecisions` runs deferred on the **chain's** request lists → `RunView.decisions`.
- P2 `selectSeed(node|null)` + `RunView.seedNode?` (additive): Practice/Live, idle only, range-checked, cleared by reset/mode switch; `start()` passes it to `defaultParams(model, level, card, seedNode)`.
- Also: `connectOperator` (validates keys, saves to sessionStorage if available, preflight), `disconnectOperator`, `switchToBackupKey`, `runPreflight`, `fundBank` (tops up to cash0+bonds0), `ping`, `saveReplay`.
**Routes/shell** — `routes.tsx`: `/` (Live if operator loaded **and** preflight ok, else Practice), `/watch`, `/replay`, `/replay/:id`, `/ops`, `/lab/{stage,brand,panels,chain,engine}`. `StageShell` mounts `PaperBackground`, `ModeBanner`, `StageScreen`, `ProofPanel`, `ClosingCardHost` (E's, owns `L`/`Esc`). **Hotkeys**: `hotkeys.ts` (single module-level listener; `1/2 Q W E R Enter P C X F M H ? Esc Shift+O Shift+R`; `L` is E's). `HOTKEYS` list is for D's help overlay.
**Types** — `src/types.ts` is PRD §16.1 verbatim **plus additive**: `RunView.seedNode?`, `ReplayFile.rumor.sealedAtMs?`.
**Platform** — `vite.config.ts` (React plugin, `@` alias, `__BUILD_ID__` = sha-time where sha = `BUILD_SHA` env → `VERCEL_GIT_COMMIT_SHA` → `git rev-parse` → `nogit`; Vercel build guard; `VITE_PUBLIC_URL` fallback to `VERCEL_PROJECT_PRODUCTION_URL`), `vercel.json` (SPA rewrite), `.vercelignore`, `index.html` (title, description, absolute `og:*`/`twitter:*` via `%VITE_PUBLIC_URL%/og.png`), `.monskills`.
**Helper scripts (F)** (all `pnpm <name>` in `app/`; the scripts import `@/app/state` + `@/app/controller`, NOT `@/app/store`, because the store barrel pulls in CSS modules tsx can't load):
- `pnpm live:e2e [--record] [--runs level:card,…] [--preflight] [--primary] [--force]` — headless live run through the real controller on testnet. **Writes to the shared bank.** Default sequence Bhau's×W then Mutual×W. `--record` writes `app/public/replays/<id>.json` and updates `index.json`. Signs with the **backup** key by default; takes C's lock `/tmp/run-bank.lock` (`app/scripts/chain-lock.ts`) and refuses while another agent's `LIVE BANK: <agent> until HH:MM` line is in the first lines of any `docs/status/*.md`. Cards: 0=Q 1=W 2=E 3=R. (Lock/backup-key path added at 14:50 and **not yet exercised**.)
- `pnpm spectate:check [--seconds N]` — read-only; follows the bank in Spectate mode and exits 0 when mirror and decisions match.
- `pnpm verify:deploy <https url> [--expect-build <sha>]` — routes 200, title, absolute og:image 200, no `VITE_*PK`, local keys not in the bundle (uses `--env-file=.env.local`), build id.
- Others' scripts that F wired in `package.json`: `chain:smoke`, `chain:fork` (C), `gen:graph/ledger/vectors/model`, `tune` (B), `og` (E).
**Tests (F)** — `src/app/__tests__/`: `practice` (real engine + mock adapter, doubled init/setMode/start, StrictMode shape, Bhau's fails then Mutual survives), `replay` (index missing, Shift+R path), `live` (fake "live" adapter on the mock: connect/preflight, doubled start, failed→reset→switch→survived, decision check, low-balance + backup key, pause + retry, disconnect, spectate with out-of-order chunks, selectSeed), `fakeRun`, `selectorEqual`. No testnet traffic and no real keys in tests (`createLiveAdapter` is mocked).
**Docs** — `docs/DEMO_RUNBOOK.md` (setup, preflight, script with keys, fallbacks, failure table, Q&A, rehearsal log §7), `README.md` (modes, run locally, contracts, deploy, architecture).

## 4. Everyday commands
```bash
cd app
pnpm dev --port 5173 --strictPort      # F's dev port (D 5174, E 5175, C 5176, B 5177). Vite full-reloads whenever ANY agent edits a file, which wipes a run in progress: for browser tests prefer the production build below.
pnpm build && pnpm preview --port 4173 --strictPort   # stable build for manual/browser testing; reads .env.local so it auto-connects Live
pnpm typecheck && pnpm test            # errors in other owners' paths are theirs (expect transient ones while they edit)
pnpm spectate:check --seconds 60       # read-only
pnpm verify:deploy https://run-bank-run.vercel.app --expect-build $(git rev-parse --short HEAD)
```
Browser testing tips: dispatching keys through the browser tool works with `window.dispatchEvent(new KeyboardEvent('keydown',{key:'w',bubbles:true}))`; the preflight takes ~4–6 s after load before the chip flips to `LIVE · sealed on Monad testnet`. The browser tool's offline emulation did not cut RPC traffic, so it proves nothing about outage handling (that is unit-tested instead).

## 5. Shared-bank protocol (important: one bank, one operator key, many agents)
- Several agents sending from one wallet caused "EOA nonce changed unexpectedly" and `runId` jumping 2→27. Agreed rules (A, C, F): (1) one writer at a time; (2) before sending, check `docs/status/*.md` for a `LIVE BANK:` line and take C's lock (`app/scripts/chain-lock.ts`: `acquireLock`, `guardLiveBank`, `findLiveBankLines`); (3) write `LIVE BANK: F until HH:MM` at the very top of this file while sending, replace with `LIVE BANK: none` after; (4) F uses the **backup key**, C's smoke and A's scripts use the primary; (5) if the bank is not Ready, `chain:smoke` resets it, which would kill your run — hence the line + lock.
- The controller itself never needs the lock (it's the app); only scripts do. The app's `start()` handles a bank left Running/Failed by resetting first.
- Cost: a full run is ≈0.05–0.2 MON; reset/setLevel ≈0.07 MON; every page load that auto-connects sends one ping.

## 6. How to do the recurring jobs
**One Live run through the stage UI (E's open request: verify the Live proof panel with real `streetHeld` and finalized ticks)**
1. Check no `LIVE BANK:` line and no `/tmp/run-bank.lock`; write `LIVE BANK: F until HH:MM` (≈10 min ahead) at the top of this file. Read the bank (`cast call 0x2cD8…F41D "snapshot()" --rpc-url https://testnet-rpc.monad.xyz`; status 0 = Ready).
2. `pnpm build && pnpm preview --port 4173`; open `http://localhost:4173/`, wait for the LIVE chip, press `2`, `W`, `Enter`, then `P` and read the proof panel (rumor tx, biggest batch, outcome tx, finalized, `N / N ticks: screen and chain agree`, "AUSD that left the bank" = Street balance). Note: this browser path signs with the **primary** key from `.env.local` (the app doesn't have a "use backup" default), so tell C/A in their status files and keep their scripts off. Report findings in `status/E.md` and here.
3. Clear the `LIVE BANK:` line.
**Re-record replays** (only needed if B changes the model/cards/configs/ledger; B froze it, so normally not): `LIVE BANK` line, then `pnpm live:e2e --record --runs 0:1,1:1,0:3`, delete stale files in `app/public/replays/` and fix `index.json`, check each plays at `/replay/<id>`, commit `app/public/replays`, redeploy. The run you record **last** becomes the `Shift+R` default (newest `recordedAt`) — record Bhau's × W last if that's the one you want as the fallback. Tell E (OG card figures come from the recorded `bhaus-w-failed` run: 4.2 s / 14 blocks; `pnpm og` needs Chrome).
**Redeploy** (needed after any final commit from A–E; Vercel uploads the **working tree at that moment**, not just committed files, so run typecheck/test/build first):
`cd /Users/shreyas/Desktop/blitz && pnpm dlx vercel@latest deploy --cwd app --prod --yes --build-env BUILD_SHA=$(git rev-parse --short HEAD)` (the tool may ask for the human's approval card), then `cd app && pnpm verify:deploy https://run-bank-run.vercel.app --expect-build $(git rev-parse --short HEAD)`. Vercel project `run-bank-run` (team `shreyas-sovanis-projects`, root dir `app`, Vite, `app/.vercel/project.json` gitignored). Deployment Protection does not block the public alias. No Vercel env vars are set (`VITE_PUBLIC_URL` falls back automatically). Do **not** add env vars; do not run `vercel env ls` unless the human approves it.
**Pull someone's change into the demo laptop**: the demo is `pnpm build && pnpm preview` from `app/` (runbook §1), not Vercel.

## 7. Open items — who does what (copy of the blocker table, updated 14:25)
| # | Item | Owner | Status / exact next step |
|---|---|---|---|
| 1 | **Redeploy production** so C's formula-gas default (`f9777f7`) and D's `6603b7a` are live | **F** | Run §6 Redeploy (needs the human's approval card). Then `verify:deploy`. |
| 2 | **Live proof-panel check** in the stage UI (E asked; Live-only fields) | **F** (with the human's OK to spend ~0.2 MON) | §6 first procedure. Not started: waits for nobody else to hold a `LIVE BANK:` line. |
| 3 | Re-check amber "Sealing delayed" in a real browser Live run after C's faster batches (C measured batch time mean 1.11 s → 0.83 s with the formula gas mode, ≈ +0.2 MON/run) | **F** to run (same live slot as #2), **D** to confirm it looks calm | Report the batch times and how often the chip appears. If still frequent, options for C: larger `maxTicksPerTx`, or tune `MAX_LEAD` (B owns the constant, PRD says 6). |
| 4 | Expose the live adapter's `gasLog` so `live:e2e` can print level-1 gas rows into `status/C.md` (A can tighten the level-1 envelope) | **F** | The controller doesn't expose `liveAdapter`. Add a read-only `controller.debug.gasLog()` (or return it from `connectWith`) and print in `live:e2e`. Nice to have. |
| 5 | Exercise `live:e2e`'s new backup-key + lock path once (`pnpm live:e2e --preflight`; then a normal run) | **F** | Do it inside the §6 live slot. Verify the lock file appears while it runs and is removed after. |
| 6 | Visual QA on a real display: 4 m projector legibility (card text and timer), 5 rehearsals (runbook §7 log; once with the network cut and `Shift+R`), demo-day checklist (BACKLOG "Demo-day checklist") | **Human** (D/E already verified headless screenshots, reduced motion, keyboard pass; see D.md 14:00 and E.md 14:55) | Outside the code. |
| 7 | PRD §5.1 script narrates "5.4 s / 13 blocks"; measured Bhau's × W is ~4.2 s / 14 blocks (fails tick 8). B froze the model unless the human asks for a retune (a retune changes `modelHash` → F re-records + redeploys, C re-verifies, E updates OG). Runbook already says "A dozen Monad blocks". | **Human decision** | If wanted, tell B in `status/B.md`; F's re-record procedure is §6. |
| 8 | `ReplayFile.rumor.sealedAtMs` | C now writes `0` explicitly; existing replays lack it (optional, harmless) | Only matters for new recordings; E shows the row only when it's present. |
| 9 | `app/scripts/**` is not type-checked by `pnpm typecheck` (`tsconfig.node.json` only includes `vite.config.ts`) | F (deliberate) | F's three scripts were checked once with a throwaway tsconfig (clean). Adding `scripts/**` to a tsconfig would pull other agents' scripts into F's typecheck; only do it if they are clean. |
| 10 | Final: after the last commits from A–E, run §6 Redeploy once more, `verify:deploy`, and tell the human the commit + URL. Code freeze per PRD §17.4 is T+5:45; after that only demo-blocking fixes approved by the human. | **F** | — |

## 8. Known behaviours / gotchas (so you don't "fix" them wrongly)
- **Mid-run page reload** leaves the bank Running onchain. The next `start()` reads the snapshot and resets it first ("Resetting the bank…"). Preflight shows "Bank status" as warn in that case; `/ops` has Reset.
- `RunView.onchain.status` can lag up to ~2 s after an outcome (poll + one extra read after each seal).
- Amber "Sealing delayed" is honest (queue's oldest pending > 2.5 s, or the engine is 6 ticks ahead). It clears itself. It is not an error.
- The stamp waits for the chain event (by design, "Monad decides"). If the event never arrives the stage shows "Sealing the verdict…" and the queue eventually pauses with a Retry error.
- Replay mirror counts are engine re-derivations (recorded files carry no per-tick chain summaries); the real check there is the decision check. In Spectate and Live the mirror compares chain summaries field-for-field.
- Replays recorded on an older model would drift visually (heard/panic), not break; hence re-record after any model change.
- `tickOnce` is driven by `setInterval(400)`; background tabs throttle timers. The demo browser must stay foreground/full screen.
- Don't import `@/app/store` or `@/ui/*` from `tsx` scripts (CSS modules). Use `@/app/controller`, `@/app/state`, `@/chain`, `@/engine`, `@/ui/copy`.
- `import.meta.env` is undefined under tsx; the controller reads it defensively (`viteEnv`).
- Dev server (5173) restarts/reloads constantly because other agents edit files; it died once. Restart with `nohup pnpm dev --port 5173 --strictPort &`.
- Vercel CLI uploads files without `.git`; that's why the build id uses `BUILD_SHA`.

## 9. Interface contract summary other agents rely on (all additive to PRD §16)
- `runActions.setMode(mode, { replayId?, auto? })`, `runActions.selectSeed(node|null)`, `RunView.seedNode?`, `ReplayFile.rumor.sealedAtMs?`, `HOTKEYS` includes `L`.
- Error actions are rendered by D (TopBar): `retry`→`runActions.retry()`, `reset`→`runActions.reset()`, `replay`→`setMode('replay')`, `backup`→`switchToBackupKey()`, `ops`→navigate `/ops`.
- Stage vault reads `RunView.onchain` in Live/Spectate; Practice reads the engine frame; Replay shows "Recorded from Monad testnet".
- F never edits others' files after bootstrap; the placeholder files F created at bootstrap now belong to their owners.

## 10. Where the evidence is
- Live runs on the tuned model (4 runs, mirror/decisions N/N): this file, 13:50 and 14:15 sections. C's `chain:smoke --run`: sealed 19 ticks in 8.41 s, 19/19, gap-free (14:40 section). Spectator on the live bank: 36/36 mirror, 36/36 decisions (13:30 section). Production verification: 14:15 and 14:55 sections.
- Other agents' final states: `A.md` (contracts verified, full match on explorers, 52/52 forge tests), `B.md` (model frozen, targets pass), `C.md` (live adapter, queue, spectator, lock, formula gas), `D.md` (14:00 verification matrix), `E.md` (14:55 closing out).

## 15:25 — finishing pass, Part 1 done (F); Parts 2 and 3 not started
Commit `8964192`. `pnpm typecheck` clean, `pnpm test` 273 passed / 7 skipped (32 files), `pnpm build` passes. No transactions sent (LIVE BANK: none).
- **PRD §12.5 environment rows**: preflight reports stored by the controller (autoConnect, connectOperator, runPreflight, plus the no-operator, bad-key and adapter-failure reports) now end with `fonts`, `audio`, `window` rows, always `critical: false`; they never change `report.ok`, and a re-run replaces them instead of duplicating. The rows come from a hook, `controller.setEnvChecks(() => PreflightCheck[])` (additive; `controller.ts` still imports no `@/ui/*`). `store.ts` registers `environmentChecks()` at load: fonts = `fontsLoaded()` (`fail` if not loaded), audio = `sfx.isUnlocked()` (`warn`, never `fail`, when not yet unlocked), window = `innerWidth >= 1280 && innerHeight >= 720` (`fail` otherwise, with the measured size in the detail). Scripts and tests register nothing and get no extra rows. The rows are a snapshot from the moment the preflight ran (audio is normally `warn` on page load until a key press; "Run checks again" on `/ops` refreshes them).
  **REQUEST → E** (optional): `/ops` may want to show non-critical `fail`/`warn` rows in an amber "advisory" style and not as blockers (`canGo` already ignores them via `report.ok`).
- **Gas log**: `controller.debug.gasLog()` returns a copy of the live adapter's `gasLog` (`[]` when not live). `scripts/live-e2e.ts` now tags each run's rows with the bank level and prints the full sealTicks table at the end (level, ticks, ids, distinctSlots, estimate, formula, gasLimit, gasUsed, mode). The level column is from the run, since C's `GasLogEntry` has no level field.
- **Tests**: `src/app/__tests__/envChecks.test.ts` (mocked adapter, no testnet): rows appended and forced non-critical, `ok` unchanged both ways, no duplicates on re-run, present on no-operator and bad-key reports, absent with no provider, the real provider's pass/warn/fail rules incl. the 1280×720 boundaries, and `gasLog` empty/live/read-only copy.
- **Waiting**: Part 2 (live check) starts only on the human's "F: go live". Part 3 (final deploy) starts when A, D and E post "done" or at 17:30. Production is still build `abfbdb9` until then.


## Gas rows for A (F, 15:31) — real testnet, backup key, formula gas mode (C's default), commit `8964192`
Printed by `pnpm live:e2e` (sealTicks only). `estimate` is `-` because formula mode skips `estimateGas`. On Monad `gasUsed` equals the limit that was charged, so used == limit in every row.
**Level 1 (Monad Mutual × W, survived tick 25), 12 batches**
```
level ticks   ids slots   estimate    formula   gasLimit    gasUsed  mode
    1     1     0     0          -      70500      70500      70500  formula
    1     2     0     0          -      79000      79000      79000  formula
    1     2     0     0          -      79000      79000      79000  formula
    1     1     2     2          -     266600     266600     266600  formula
    1     2    18    11          -     381700     385400     385400  formula
    1     2    53    37          -     591800     651000     651000  formula
    1     2    17    14          -     387300     627800     627800  formula
    1     3    15    15          -     411000     692200     692200  formula
    1     3     4     4          -     336200     595200     595200  formula
    1     2     0     0          -      79000      79000      79000  formula
    1     3     0     0          -      87500      87500      87500  formula
    1     2     0     0          -      79000      79000      79000  formula
```
**Level 0 (Bhau's Bank × W, failed tick 8), 4 batches** (formula was enough every time)
```
level ticks   ids slots   estimate    formula   gasLimit    gasUsed  mode
    0     1     0     0          -      70500      70500      70500  formula
    0     2     0     0          -      79000      79000      79000  formula
    0     2     3     2          -     298300     298300     298300  formula
    0     3   162    59          -    1091300    1091300    1091300  formula
```
**Reading for A / C**: at level 1 the formula undershot in **5 of 12** batches (limit had to be raised above the formula: 381,700→385,400; 591,800→651,000; 387,300→627,800; 411,000→692,200; 336,200→595,200, i.e. +1% to +77%). The expensive level-1 batches are not the ones with many *requested* ids (e.g. 17 ids → 627,800 gas, 53 ids → 651,000): cost follows how many depositors the speed-bump queue *serves* in the tick (queue pops from earlier ticks), which the batch's own `ids` don't show. A refit of the level-1 queue term (A's envelope, C's "queue hint") would avoid the raise/retry. Retries cost a failed or extra send: the biggest Mutual batch showed "Seal time 2.40 s" in the proof panel (vs 0.7–1.1 s typical). **REQUEST → A / C**: refit the level-1 gas envelope from these rows (or base it on predicted served count), then re-run `pnpm live:e2e --runs 1:1` with a `LIVE BANK:` line.

## Live UI check (F, 15:31)
Setup: `pnpm build && pnpm preview --port 4173` (production build, keys from `.env.local` so the browser signs with the PRIMARY key), in-IDE browser, viewport 628×678 (so the proof panel was the bottom sheet). `live:e2e` (backup key) had exited before the browser started. The lock file `/tmp/run-bank.lock` was present while `live:e2e` ran (agent F, purpose `live:e2e`, 15-min expiry) and gone after the preflight-only run, after `--runs 1:1` and after the cleanup run.
Pre-checks: no `LIVE BANK:` line in any status file, no lock, bank Ready (status 0, level 0, runId 31, 10,000 AUSD). `live:e2e --preflight` (backup key): all green, ping sealed in 1.6 s. `live:e2e --runs 1:1`: Mutual × W survived tick 25, wall 11.5 s, 38 blocks, mirror 25/25, decisions 25/25.

**/ops, new §12.5 rows (verified in the browser)**: "All critical checks pass." with three extra rows at the end: *Fonts loaded* **Pass · Optional** ("Self-hosted faces are ready"), *Audio unlocked* **Warning · Optional** ("Press any key once so the browser allows sound"), *Window at least 1280×720* **Fail · Optional** ("628×678: enlarge the window or press F for full screen"). The failing optional row did not block "Go to stage" or `report.ok`. Screenshot: `/tmp/run-live-check/01-ops-preflight.png` (shows steps 3 and 4; the rows are listed in the Preflight card below).

**Run 1 — Bhau's Bank × W (keys `1`, `W`, `Enter`, `P` during the run, `P` open after the stamp)** — the bank was at level 1 from the previous script, so `start()` did the setLevel(0) step first
| Item | Value |
|---|---|
| Outcome | **BANK FAILED, tick 8**, stamp "in 4.8 s · 16 Monad blocks" (stage clock; rumor receipt → verdict receipt) |
| Mirror / decisions | **8 / 8** ticks agree · **8 of 8** decisions match |
| Finalized | rumor tx `0x56ea…f725` block #69,795,585 **✓ finalized**; biggest batch `0xcfd7…8d2a` block #69,795,601 **✓ finalized** (138 depositors, gas used 940,300, seal time 0.72 s); verdict `BankFailed` tick 8 on the same tx, **✓ finalized**, 334 trapped with 3,445 AUSD (all uninsured); the explorer page for `0xcfd7…8d2a` shows Success / SealTicks / Logs (3) |
| "AUSD that left the bank" vs Street | Panel **7,080 AUSD** ($7.1B). Chain: `balanceOf(Street)` = **7,080.497326 AUSD**. ✓ match. (Vault "out the door" 6,055 + fire-sale loss 1,025 = 7,080; bank held 2,919.502674, matches the vault's "2,920 held by the contract") |
| Amber "Sealing delayed" | **0** stretches |
**Run 2 — Monad Mutual × W (keys `Esc`, `X`, `2`, `W`, `Enter`, `P` during the run)**
| Item | Value |
|---|---|
| Outcome | **SURVIVED, tick 25**, "PAID IN FULL in 13.7 s · 43 Monad blocks", 0 trapped |
| Mirror / decisions | **25 / 25** · **25 of 25** |
| Finalized | rumor `0xb50b…17d4` #69,795,801 **✓**; biggest batch `0xdc7c…af90` #69,795,820 **✓** (60 depositors, gas used 664,400, **seal time 2.40 s**); verdict `BankSurvived` tick 25 `0xe29d…d72c` #69,795,844 **✓ finalized** |
| "AUSD that left the bank" | Panel **5,554 AUSD** ($5.6B). Vault: out the door 5,363 + fire-sale loss 191 = 5,554 ✓. (Street balance not re-read separately for this run; it follows the same formula and equals the vault's paid + loss; the bank held 4,446, as the vault shows) |
| Amber "Sealing delayed" | **2 stretches: 2.6 s and 0.8 s; 3.4 s total of a 13.7 s run (25%)**, measured by polling the page text every 200 ms. For comparison, before C's faster batches, a similar run showed amber for about 4–5 s in one stretch plus another near the end. |
Cleanup: bank was Survived at level 1 after run 2, so `pnpm live:e2e --runs 0:1` (backup key, lock) reset it, set level 0 and ran Bhau's × W (failed tick 8, wall 4.3 s, 14 blocks, mirror 8/8, decisions 8/8), then reset. **Final bank (read by `cast`)**: status Ready (0), level 0, runId 35, bank holds 10,000 AUSD, Street 0. Wallets: operator 33.51 MON, backup 74.35 MON (this pass cost about 1.3 MON in total: operator 34.20 → 33.51, backup 74.99 → 74.35).
Screenshots saved to `/tmp/run-live-check/` (`01` ops, `02`/`03` run 1 proof panel during/after, `04`/`05` run 2). Caveat: the in-IDE browser tool returned a stale or scrolled frame for some captures (`04` still shows run 1's panel; `05` shows the bottom of the panel, "How the depositors decide"), so the numbers above come from reading the panel text and the live DOM, not from the images. No console errors were observed; one unexplained side effect is described under REQUEST → E.
Not re-recorded: replays (model frozen, committed replays still valid). Not done in this pass: production redeploy (Part 3).

**REQUEST → E** (proof panel, all small)
1. **Early "Biggest batch: 0 depositors tried to withdraw in one transaction"**: while the run is still in its quiet first ticks the panel shows a Biggest-batch block for a batch with 0 requested ids (gas 70,500, "not yet final"). Better to hide the block (or say "No withdrawals yet") until a sealed batch has at least one id.
2. **Unexplained new tab**: during run 1 a MonadVision tab for `0xcfd7…8d2a` (the biggest-batch link) opened by itself right after I opened the proof panel with `P`, and in the app tab that link was `[active, focused]`. I only sent synthetic key events (`1`, `W`, `Enter`, `P`), which don't activate links, so I can't attribute it for sure (it may be the browser tool). Please check whether opening the panel can put focus on a `TxLink` and whether the `Enter` hotkey (start the run) could also activate a focused link: on stage, pressing `P` and then `Enter` for the next run must not open an explorer tab. If focus really lands on a link, move it to the panel's close button or the panel container.
3. Nice to have: show "AUSD that left the bank" with the split ("6,055 paid + 1,025 fire-sale loss") since it differs from the vault's "out the door" figure (7,080 vs 6,055 in run 1) and a judge may ask.

**REQUEST → D** (amber "Sealing delayed")
- Numbers (Live, production build, formula gas mode): Bhau's × W **0** stretches; Mutual × W **2** stretches, **longest 2.6 s**, 3.4 s total of 13.7 s. The chip is calm and cleared by itself both times. Screenshots: `/tmp/run-live-check/` (see caveat above; `02`/`03` are proof-panel captures during and after run 1, `04`/`05` run 2).
- Nothing else to change from my side; the stage text in both runs matched the proof panel (stamp wording, "in 4.8 s · 16 Monad blocks", vault "held by the contract · live from Monad").

## FINAL (F, 15:45) — everything F owns is finished and deployed
**Production: https://run-bank-run.vercel.app, build `ad6be6f`** (commit `ad6be6f`). `pnpm verify:deploy https://run-bank-run.vercel.app --expect-build ad6be6f` → all checks passed: `/`, `/watch`, `/replay`, `/replay/<id>`, `/ops` 200; title correct; absolute `og:image` 200; neither local key in the bundle; build id matches the commit. `/replays/index.json` serves the three committed replays. No Vercel env vars were ever set. Pre-deploy: `pnpm typecheck` clean, `pnpm test` 277 passed / 7 skipped (32 files), `pnpm build` passes; no other agent's half-edit in `app/` at deploy time (the only modified tracked file was B's `app/scripts/gen-ledger.ts`, which is a script and not part of the bundle).
**Finishing pass, all three parts done**
- Part 1 (`8964192`): §12.5 `fonts` / `audio` / `window` preflight rows (non-critical, never change `ok`), `controller.debug.gasLog()`, `live:e2e` prints sealTicks gas rows; tests in `envChecks.test.ts`. E has since styled non-critical `fail` rows as amber advisory.
- Part 2 (`c7e067c`): live check on testnet. Results are in "Gas rows for A" and "Live UI check (15:31)" above: Bhau's × W failed tick 8 (4.8 s, 16 blocks, 8/8, 8/8), Mutual × W survived tick 25 (13.7 s, 43 blocks, 25/25, 25/25), Street balance matches "AUSD that left the bank", ✓ finalized on every row, amber "Sealing delayed" 0 and 2 stretches (longest 2.6 s). Bank left Ready / level 0 / 10,000 AUSD / Street 0; `LIVE BANK: none`.
- Part 3 (this entry): runbook and README now use the measured numbers (Bhau's × W ≈ 4–5 s over 14–16 blocks; Mutual ≈ 11–14 s over 37–43 blocks; "Four seconds. Fourteen Monad blocks." in the script row, plus a "what the screen really shows" paragraph). Redeployed and verified as above. B was not asked to retune.
**What is left, and who owns it**
| Item | Owner |
|---|---|
| Proof-panel follow-ups from the live check: hide the empty "Biggest batch (0 depositors)" block; look into the unexplained MonadVision tab that opened after `P` (focus on a `TxLink`?); optional paid-vs-loss split. **Not in the deployed build** if E fixes them after `ad6be6f`: then one more redeploy (§6 of the handoff) + `verify:deploy` | **E** (F redeploys) |
| Refit the level-1 gas envelope (formula undershot in 5 of 12 Mutual batches; A has already adjusted level-0 `perId`) | **A / C** |
| Visual/rehearsal items only a person can do: 4 m projector legibility, five rehearsals (runbook §7 log, once with the network cut and `Shift+R`), demo-day checklist, operator balance (33.5 MON now; refuse < 10.5, warn < 15) and the backup (74.4 MON) | **Human** |
| Any change to `model.json`, `cards.json`, `configs.json`, `ledger.json` after this point: re-record replays (`pnpm live:e2e --record`, handoff §6), redeploy, `verify:deploy` | **B → F** |
Handoff section above ("HANDOFF (F, 14:25)") remains accurate except the state table: current production build is **`ad6be6f`** (not `abfbdb9`), tests are 277 passed, the bank is Ready at level 0, the operator holds ~33.5 MON, and open items 1–5 and 10 of its §7 table are now done (redeploy, live proof-panel check, amber re-check, `gasLog`, backup-key + lock path exercised, final deploy).
