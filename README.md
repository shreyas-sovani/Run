# RUN!

**Start one rumor. Watch 500 depositors run an onchain bank dry in seconds.**

RUN! is "Plague Inc. for bank runs", built for Monad Blitz Pune. You pick a fictional bank and a rumor card and press Enter. The rumor spreads through a network of 500 simulated depositors, who panic and withdraw. The bank is a real smart contract on **Monad testnet** holding real testnet **AUSD**. Every tick of the run (about one 400 ms block) is sealed in a real transaction: withdrawals move AUSD out of the bank, forced asset sales lose AUSD to a "vulture fund", and the contract itself decides when the bank fails. Then you switch to a bank with defences (a withdrawal speed bump and deposit insurance), play the same rumor, and it survives.

- Bhau's Bank (no defences) fails in about 5 seconds, a dozen blocks. Monad Mutual survives the same rumor.
- Depositors are simulated by design: each decides only from public inputs (the rumor event, the bank's state, its neighbours' withdrawals), with an open, deterministic model that anyone can recompute from chain history.
- Testnet only. Display scale: 1 AUSD = $1M, always labelled. All banks are fictional.

The product spec is [`docs/PRD.md`](docs/PRD.md); the work breakdown is [`docs/BACKLOG.md`](docs/BACKLOG.md); the stage script and fallbacks are [`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md).

## Modes

| Mode | Where | What it does |
|---|---|---|
| **Live** | Presenter laptop with an operator key | Runs the bank on Monad testnet. Chip: `LIVE · sealed on Monad testnet` |
| **Practice** | Anywhere, no key | The same engine against a mock chain in the browser. Chip: `PRACTICE · simulated in your browser, not onchain` |
| **Replay** | `/replay`, `/replay/:id`, `Shift+R` | Plays a recorded real run; every tick links to a real transaction |
| **Spectate** | `/watch` | Rebuilds the live run from chain data alone |

## Run it locally

Requirements: Node 22+, pnpm.

```bash
cd app
pnpm install
cp .env.example .env.local      # testnet-only keys; see below
pnpm dev                        # http://localhost:5173
pnpm build && pnpm preview      # the stage: http://localhost:4173
pnpm test                       # engine, chain, controller and UI tests
pnpm typecheck
```

`.env.local` (never committed):

```text
VITE_OPERATOR_PK=0x…   # testnet-only key that operates the bank
VITE_BACKUP_PK=0x…     # testnet-only backup key
VITE_RPC_URL=          # optional dedicated RPC (first in the failover list)
VITE_PUBLIC_URL=http://localhost:4173
```

You can also paste the keys on `/ops`; they stay in that tab's `sessionStorage`. Use testnet-only keys: a local build embeds `VITE_*` variables in the JavaScript.

Hotkeys: `1`/`2` bank, `Q W E R` rumor, `Enter` start, `P` proof, `C` passbook, `X` reset, `F` full screen, `M` mute, `H` help, `Shift+O` ops, `Shift+R` latest recorded run.

## Contracts (Monad testnet, chain 10143)

| Contract | Address |
|---|---|
| `RunBank` | [`0x2cD82EE2b3C19E996Fa9da80052e912A2E90F41D`](https://testnet.monadvision.com/address/0x2cD82EE2b3C19E996Fa9da80052e912A2E90F41D) |
| `Street` | [`0x7998f16710Ab81AD2D68d7C0B7F0fd296CC7927D`](https://testnet.monadvision.com/address/0x7998f16710Ab81AD2D68d7C0B7F0fd296CC7927D) |
| AUSD (Agora, 6 decimals) | [`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`](https://testnet.monadvision.com/address/0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC) |

Deployment details are in `app/src/config/deployment.testnet.json`. Foundry project, tests and deploy scripts: `contracts/` (`forge test`).

## Deploy (Vercel)

Static Vite build, root directory `app`, framework Vite, install `pnpm install`, build `pnpm build`, output `dist`. `app/vercel.json` rewrites every path to `index.html`.

```bash
pnpm dlx vercel@latest login
pnpm dlx vercel@latest --cwd app          # preview
pnpm dlx vercel@latest --cwd app --prod   # production
```

- **Never** put a `VITE_*PK` variable in Vercel. `vite.config.ts` fails the build if one is present on Vercel, and `app/.vercelignore` keeps `.env*` out of the upload. Don't use `--prebuilt` from a machine with `.env.local`.
- `VITE_PUBLIC_URL` sets the absolute `og:image` URL; on Vercel it falls back to the production domain.
- After a deploy: every route returns 200 (`/`, `/watch`, `/replay`, `/ops`), `og:image` is an absolute URL that returns 200, the build id in the `/ops` footer matches `git rev-parse --short HEAD`, and no key appears in the deployed JavaScript.

Public URL: https://run-bank-run.vercel.app (Vercel project `run-bank-run`; live after the first production deploy).

## Architecture

```text
                   Presenter laptop (Chrome) — Vite + React SPA (same build as Vercel)

 ui/stage  ui/panels  ui/brand ── read ──► app/store (RunView, UiState)
                                                 ▲
                                  app/controller (module singleton: modes, hotkeys, run loop)
                     every 400 ms │                 │ TickPayloads
                                  ▼                 ▼
                      engine/ (pure TS)          chain/ (viem)
                      graph, ledger, panic       operator key, RPC failover, SealQueue
                      model, bank-maths mirror   (1 tx in flight), block feed, preflight,
                                                 recorder, spectator
                                                          │
                                       Monad testnet: RunBank.sol ──AUSD──► Street.sol
```

- `contracts/`: `RunBank` (ledger of 500 balances, cash, bonds, queue, insurance, failure logic), `Street`, `MockAUSD` fallback.
- `app/src/engine/`: deterministic depositor model and a TypeScript mirror of the contract's bank maths, proven against shared golden vectors.
- `app/src/chain/`: clients, keys, adapters (live, mock), SealQueue, preflight, error translation, spectator, recorder.
- `app/src/app/`: store, controller (Practice, Live, Replay, Spectate), routes, hotkeys.
- `app/src/ui/`: stage, brand kit, panels.

## Credits

Built at Monad Blitz Pune. Historical figures come from the Federal Reserve's reviews of SVB (2023) and RBI press releases on PMC Bank (2019); see PRD §8.1. Typefaces: Big Shoulders Display, Atkinson Hyperlegible Next and Mono, Doto, Tiro Devanagari Marathi (all via `@fontsource`, self-hosted). Built with the monskills guidance for Monad.
