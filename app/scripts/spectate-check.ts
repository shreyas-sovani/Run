// Headless spectator check (BACKLOG F-08): follows the deployed bank through the real RunController in Spectate mode
// and prints what a /watch viewer would see. Run it, then start a live run elsewhere (`pnpm live:e2e`).
//   pnpm spectate:check [--seconds 120]
// Read-only: no key, no transactions.
import { controller } from '@/app/controller';
import { runStore } from '@/app/state'; // not '@/app/store': that barrel pulls in UI modules (CSS) that tsx can't load

const sIdx = process.argv.indexOf('--seconds');
const budgetMs = (sIdx > 0 ? Number(process.argv[sIdx + 1]) : 120) * 1000;
const v = () => runStore.getState();

controller.init();
controller.setMode('spectate');
console.log(`Spectating the deployed bank for up to ${budgetMs / 1000} s…`);

let lastPhase = '';
let lastTick = -1;
const t0 = Date.now();
const timer = setInterval(() => {
  const s = v();
  const tick = s.frame?.tick ?? 0;
  if (s.phase !== lastPhase || tick !== lastTick) {
    console.log(
      `  +${((Date.now() - t0) / 1000).toFixed(1)} s phase=${s.phase} tick=${tick} sealed=${s.sealedTick} mirror=${s.mirror.matched}/${s.mirror.total} onchain=${s.onchain?.status ?? 'n/a'}`,
    );
    lastPhase = s.phase;
    lastTick = tick;
  }
  if (s.outcome && s.decisions) {
    clearInterval(timer);
    console.log(
      `Outcome ${s.outcome.kind} at tick ${s.outcome.tick}, ${s.outcome.blocks} blocks; mirror ${s.mirror.matched}/${s.mirror.total}; decisions ${s.decisions.matched}/${s.decisions.total}.`,
    );
    process.exit(s.mirror.matched === s.mirror.total && s.decisions.matched === s.decisions.total ? 0 : 1);
  }
  if (Date.now() - t0 > budgetMs) {
    clearInterval(timer);
    console.log('Time is up without a finished run (idle bank or no run started).');
    process.exit(3);
  }
}, 250);
