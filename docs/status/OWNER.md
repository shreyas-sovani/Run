# Owner status

**LIVE BANK: none.** The owner pass sent no transactions; every check below ran in Practice or against recorded replays.

## 10 Oct, 16:20 — finishing pass and frontend makeover

The human asked for: finish the agents' leftovers, update the docs, and a two-page frontend (a landing page and the app) with every route reachable from the landing. Decisions taken with the human: evolve the existing identity (cheque paper, violet stamp ink), keep the stage's internals as tested and refresh the frame around them, and move the stage to `/app`.

### What changed

| Area | Change | Files |
|---|---|---|
| Routes | `/` is the new landing page; the stage moved to `/app`. `/watch`, `/replay`, `/replay/:id`, `/ops` and the labs are unchanged. One route list (`PATHS`, `isStageRoute`, `navSectionOf`) is re-exported from `@/app/store`. Every link that meant "the stage" now goes to `/app` (ops "Go to stage", replay picker, mode banner, 404) | `app/src/app/paths.ts`, `routes.tsx`, `store.ts`; `ui/panels/{OpsPage,OpsView,ReplayPicker,ModeBanner}.tsx` |
| Landing (`/`) | Hero headline and lead, two calls to action (Start a bank run → `/app`, Watch a sealed run → newest recording). Signature: a passbook that prints WaMu, Wachovia and SVB in dot-matrix, then the last line of the recorded Bhau's × W run (year, $5.9B, 4.2 s, computed from the replay with the engine), and E's BANK FAILED stamp lands on it. Then: four ways in as deposit slips (`/app`, `/watch`, `/replay`, `/ops`), three network frames from the recording (ticks 6, 7, 8), the recordings list (each links to `/replay/:id`), the contract addresses with explorer links, and a footer with all five builder labs and the build id | `app/src/ui/site/**` (new barrel `@/ui/site`) |
| App frame | A slim nav bar (Home · Play · Watch live · Recorded runs · Operator) on the stage, the replay list, ops and the 404; the current section is underlined in stamp ink. It replaces the mode banner on stage pages (the mode chip in the top bar still labels every mode). The nav hides in full screen (`F`), so the projector shows only the stage. The stage's RUN! wordmark links home. Replay and ops pages lost their "Back to the stage" links (the nav covers it) and set their titles in the display face | `ui/site/SiteNav.*`, `ui/stage/TopBar.*`, `ui/panels/{ReplayPicker,OpsPage}.module.css` |
| Hotkeys | Stage hotkeys act only on stage routes (`/app`, `/watch`, `/replay/:id`, `/lab/stage`): a key press on the landing can't start a run off screen | `app/src/app/hotkeys.ts` |
| D's leftover | The closing card is modal for the keyboard: while it is open only `L`, `Esc`, `F`, `M` (and Tab) act, so `H`/`P`/`C`/`Enter` can't open overlays or start a run underneath it | `ui/panels/ClosingCard.tsx` |
| A's leftover (for C) | `gasLog.formula` now records the limit formula mode actually sends (with the speed-bump queue hint), so the next gas table can't be misread | `chain/liveAdapter.ts`, `chain/types.ts` |
| Copy | New `copy.nav` and `copy.landing` groups; `copy.stage.homeTitle` | `ui/copy.ts`, `ui/stage/stageCopy.ts` |
| Docs | README (pages table, `/app`, hotkey scope, deploy checks), runbook (stage at `/app`, `F` hides the nav, `L` closing card), PRD §5.2, §5.3, §13.1, §13.4, §15.3, §16.5, §17.2, backlog ownership map; `verify:deploy` also checks `/app` | `README.md`, `docs/*.md`, `app/scripts/verify-deploy.ts` |

### Verification

- `pnpm typecheck` clean; `pnpm test` 34 files, 292 passed, 7 skipped; `npx oxlint src scripts` clean; `pnpm build` passes.
- New tests: `app/src/app/__tests__/paths.test.ts` (stage-route scope, nav sections), `app/src/ui/site/__tests__/landingModel.test.ts` (featured-recording choice; passbook line and frames recomputed from the committed Bhau's × W replay: 4.2 s, 14 blocks, 335 trapped).
- Browser checks (headless Chrome, keyless dev server so no `ping` was sent): landing at 1920×1080, 1440×900, 1280×720 and 375×812; mid-print frame; `/app`, `/replay`, `/replay/:id`, `/ops` with the nav; `Shift+O` does nothing on `/` and opens `/ops` from `/app`; with the closing card open `H` and `C` do nothing, and help opens normally after `Esc`.

### Deployed

Production https://run-bank-run.vercel.app is build `693b9fe` (this pass, plus E's last proof-panel fixes `f605f52`, which `ad6be6f` did not have). `pnpm verify:deploy https://run-bank-run.vercel.app --expect-build 693b9fe`: `/`, `/app`, `/watch`, `/replay`, `/replay/<id>`, `/ops` all 200, title correct, absolute `og:image` 200, neither key in the bundle, build id matches.

### Still open

- **Human**: five rehearsals (runbook §7), projector legibility from 4 m, demo-day checklist. The presenter now opens `http://localhost:4173/app` (or clicks **Start a bank run** on the landing).
- `docs/PRD.md` and `docs/BACKLOG.md` are untracked in git; commit them if they should ship with the repo.
- Optional, unchanged: an absolute rumor sealed time in `ReplayFile` (E item 3), a tighter level-1 gas envelope if someone records `estimate`-mode rows (A §6.4).
