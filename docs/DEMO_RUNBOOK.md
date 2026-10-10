# RUN! — Demo runbook

One page for the presenter. Everything here is testnet only (Monad testnet, chain ID `10143`). Nothing in this file is a secret; keys live in `app/.env.local`, which is never committed.

**What you are running**: `pnpm build && pnpm preview` from `app/`, on `http://localhost:4173`. The stage does not depend on Vercel or venue WiFi. Vercel is only the public link.

---

## 0. The day before and the morning of

| ✓ | Task | How to check |
|---|---|---|
| ☐ | Laptop: dedicated Chrome profile, no extensions, notifications off, Do Not Disturb on, sleep and screen saver disabled, battery saver off | Chrome menu shows the demo profile; `chrome://extensions` is empty |
| ☐ | Phone hotspot works with the laptop; venue WiFi is **off** on the laptop | System network panel shows only the hotspot |
| ☐ | Projector adapter tested; display set to 1920×1080 (must also hold at 1280×720) | Mirror the display and press `F` |
| ☐ | Operator wallet ≥ 15 MON, backup ≥ 10.5 MON | `/ops` shows both balances, or `cast balance <addr> --ether --rpc-url https://testnet-rpc.monad.xyz` |
| ☐ | Bank is `Ready` and holds 10,000 AUSD; ledger and config hashes match | `/ops` preflight is all green |
| ☐ | `app/.env.local` exists with `VITE_OPERATOR_PK`, `VITE_BACKUP_PK`, `VITE_PUBLIC_URL=http://localhost:4173` | `ls -a app` (never `cat` it on a projector) |
| ☐ | At least two recorded runs are in `app/public/replays/` and `Shift+R` plays one | Press `Shift+R` on the stage |
| ☐ | A screen recording of a good rehearsal is on the desktop (last-resort fallback) | Open it once |
| ☐ | Vercel URL open on your phone (for the QR and the closing line) | Practice runs on the phone |
| ☐ | Rehearsed 5× today, once with the network cut | Tick in the rehearsal log below |

---

## 1. Start the stage

```bash
cd ~/Desktop/blitz/app
pnpm install        # first time only
pnpm build && pnpm preview     # serves http://localhost:4173
```

1. Open `http://localhost:4173/ops` in the demo Chrome profile.
2. The keys are loaded from `.env.local`; if not, paste the operator and backup keys (testnet-only; they stay in this tab and are cleared when it closes).
3. Run the preflight. **Every critical check must be green**: RPC reachable on chain 10143, block feed live, operator key, MON balance, bank code and operator role, bank status `Ready`, AUSD held ≥ 10,000, ledger hash, test transaction (`ping`) sealed within 2 s.
4. If the bank is not `Ready`, press **Reset the bank** on `/ops`. If AUSD held is short, press **Fund the bank**. If the config hash differs it's a warning only: it is set automatically when you switch bank.
5. Click **Go to stage** (this also unlocks audio). Press `F` for full screen.
6. The mode chip must read `LIVE · sealed on Monad testnet`. If it says `PRACTICE`, the preflight is not green: go back to `/ops`.

Reload the page and the app reconnects and runs preflight by itself, so a refresh on stage is safe.

---

## 2. The 3-minute script (PRD §5.1)

| Time | You press | You see | You say |
|---|---|---|---|
| 0:00 | nothing | Bhau's Bank at rest. 500 calm depositors. `10,000 AUSD · real balance on Monad` | "On 9 March 2023, Silicon Valley Bank lost $42 billion in one day, a quarter of its deposits, because of group chats. Onchain, a run takes seconds. So I'll start one, live, with real AUSD on Monad." |
| 0:25 | `W` | The rumor chit "The audit is delayed." lifts | "Bhau's Bank. No defences. One rumor." |
| 0:30 | `Enter` | "Starting the run…", then `Sealed ✓ block #…` | — |
| 0:32 | watch | Amber rings from the biggest depositor; whales go red first; cash hits zero; bonds sell at a loss | "The big depositors know each other. They go first, like SVB's VCs. Cash is gone; now it's dumping bonds at a loss." |
| 0:40 | — | "Sealing the verdict…" then the **BANK FAILED** stamp | "Monad decides when the bank fails. Not my screen." |
| 0:45 | `C` (auto-opens) | Passbook: WaMu $19B / 16 days · Wachovia ~$10B / 8 days · SVB $42B / 1 day · Bhau's Bank in seconds | "Four seconds. Fourteen Monad blocks." (Say what the stamp shows: measured on testnet, Bhau's × W fails in 4–5 s over 14–16 blocks.) |
| 1:00 | `P` | Proof panel: rumor tx, a big batch, the failure event, finalized, `N / N ticks: screen and chain agree ✓` | "Every withdrawal moved real AUSD. Here's the block." |
| 1:30 | `X`, then `2`, `W`, `Enter` | Monad Mutual: speed bump + deposit insurance; a queue forms; violet halos | "Same rumor. This bank pays at most 3% of deposits per block and insures the first 50 AUSD. In 2019 the RBI capped PMC Bank withdrawals at ₹1,000." |
| 2:05 | — | **SURVIVED** seal | "Survived." |
| 2:15 | — | Closing card with the QR to the Vercel link | "It's a game for people and a stress test for protocols: plug in your stablecoin's redemption logic and see if it survives a block-speed run. The link's live: watch, replay, or play." |
| 2:45 | — | — | Q&A |

**What the screen really shows (measured on testnet, 10 Oct):** Bhau's Bank × W fails at tick 8 in about 4.2–4.8 s over 14–16 blocks (× R: tick 10, about 6 s, 20 blocks); Monad Mutual × W survives at tick 25 in about 11–14 s over 37–43 blocks (× R: tick 34, about 16 s). Read the number off the stamp and the passbook; don't quote the old 5.4 s / 13 blocks.

PMC Bank is a real event in which real people lost access to their savings. Say it respectfully, as the real-world version of a withdrawal speed bump. All banks in the game are fictional.

### Hotkeys

| Key | Action |
|---|---|
| `1` / `2` | Bhau's Bank / Monad Mutual (resets first if needed) |
| `Q` `W` `E` `R` | Pick rumor card |
| `Enter` | Start the run |
| `P` | Proof panel |
| `C` | Comparison passbook |
| `X` | Reset the bank |
| `F` | Full screen |
| `M` | Mute |
| `H` or `?` | Help overlay |
| `Esc` | Close overlay |
| `Shift+O` | Ops page |
| `Shift+R` | Switch to the latest recorded run |

Hotkeys are ignored while the cursor is in a text field.

---

## 3. Between demos (reset)

1. Press `X`. The stage shows "Resetting the bank…", then returns to idle. The bank sweeps its AUSD back from `Street` and is `Ready`.
2. Pick the bank (`1` or `2`) and a card. Starting a run on a bank that is not `Ready` resets it for you first.
3. Check the operator balance on `/ops` (`Shift+O`) before the next judge group: above 15 MON is healthy. Each full demo costs about 1.5–2.5 MON.

---

## 4. Fallback ladder (each step is labelled on screen)

1. **Live with the primary key.** The default.
2. **Live with the backup key.** If you see "The operator wallet is low on MON" or a reserve-balance message: press the **Switch to backup key** button in the error banner (or on `/ops`). The run continues.
3. **Replay of a recorded real run.** `Shift+R` at any time. The chip reads `REPLAY · recorded …` and every tick links to a real transaction. Say so: "This is a recorded run from this morning; every link is a real transaction."
4. **Screen recording** on the desktop. Last resort.

---

## 5. If something goes wrong

| Symptom | Do this |
|---|---|
| Stage says `PRACTICE`, not `LIVE` | The preflight is not green. `Shift+O`, read the red line, fix it, **Go to stage**. Or just demo Practice and say so |
| Amber "Sealing delayed" | Testnet is slow. The stamp waits for the chain; it is honest. Keep talking for a few seconds. If it persists past 10 s, `Shift+R` |
| "Can't reach Monad testnet. Retrying every 2 s." | Check the hotspot. If it doesn't return in 10 s, `Shift+R` |
| "The bank is {status}. Reset the bank first." | Press `X`, then start again |
| "Screen and chain disagree on the tick" | Press `X` to start clean. If it repeats, `Shift+R` and tell us after the demo |
| "The operator wallet is low on MON" | **Switch to backup key**, then **Retry sealing** if offered |
| "Sealing failed: …" | **Retry sealing** once. If it fails again, `Shift+R` |
| The page looks frozen | Reload (`Cmd+R`). The app reconnects and re-runs preflight. The bank may need `X` |
| No sound | Press any key once (browsers block audio until a key press), check `M` isn't muting |
| Projector shows wrong size | `F` to toggle full screen; the layout holds at 1280×720 |
| Everything is down | The screen recording on the desktop, then the Vercel link on a phone |

Never paste a private key on a projected screen. `/ops` shows only addresses.

---

## 6. Judge Q&A (PRD §20.2)

- **"Are the depositors real?"** "Simulated, and that's the premise. Each one decides only from public onchain inputs with an open model, and anyone can recompute every decision from chain history. Every withdrawal is a real AUSD transfer."
- **"Can't you just make it fail?"** "The contract decides failure. My browser proposes withdrawals; the contract pays, prices the fire sale, and declares insolvency. The stamp waits for that event."
- **"Why Monad?"** "A real run plays out in about fifteen 400 ms blocks (14–16 in our runs) with 800 ms finality, so you can watch it. On a 12-second chain the same run takes minutes and the drama is gone. And the stress test only means something if it runs at the speed a real onchain run would."
- **"Why onchain at all?"** "The bank's rules are the product. A stress test against a real contract is a real stress test, and the run is replayable from chain history."
- **"Parallel execution?"** "Honestly, a bank run is the opposite of parallel: every withdrawal touches the same vault. What matters here is block time, finality and cheap gas."
- **"Business?"** "Consumers: a strategy game that teaches how bank runs work. Protocols: plug your redemption contract into the harness and measure time-to-failure under a modelled run."
- **"Isn't this gambling?"** "No money is at stake. It's a simulation with testnet tokens."
- **"How do I know the screen isn't faking it?"** Press `P`: the proof panel lists the transactions with explorer links, and `N / N ticks: screen and chain agree`, plus the decision check from the public model.

---

## 6a. Public link (Vercel)

- `/` Practice (simulated in the browser, labelled), `/watch` follows the live bank, `/replay` and `/replay/:id` play recorded real runs, `/ops` is the operator page (harmless without a key).
- No key is ever set in Vercel. Do not deploy with `vercel --prebuilt` from this laptop: a local build embeds `app/.env.local` into the JavaScript. Use `pnpm dlx vercel@latest deploy --cwd app --prod --build-env BUILD_SHA=$(git rev-parse --short HEAD)` (the build happens on Vercel, `.env*` is ignored via `app/.vercelignore`).

## 7. Rehearsal log

| # | Time | Network | Bhau's (s / blocks) | Mutual survived | Notes |
|---|---|---|---|---|---|
| 1 | | hotspot | | ☐ | |
| 2 | | hotspot | | ☐ | |
| 3 | | hotspot | | ☐ | |
| 4 | | hotspot | | ☐ | |
| 5 | | network cut: `Shift+R` | | ☐ | |
