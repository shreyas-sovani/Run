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
