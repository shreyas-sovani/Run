// Headless live end-to-end on Monad testnet, driven through the real RunController (BACKLOG F-06 / F-12).
//   pnpm live:e2e                 → Bhau's Bank × W (fails), then Monad Mutual × W (survives); prints the proof data
//   pnpm live:e2e --record        → also writes app/public/replays/<id>.json and updates index.json
//   pnpm live:e2e --runs 0:1,1:1  → custom sequence of level:card pairs (card 0=Q 1=W 2=E 3=R)
//   pnpm live:e2e --preflight     → connect and run the preflight only (one ping transaction), then exit
// Testnet only. Keys come from app/.env.local (VITE_OPERATOR_PK / VITE_BACKUP_PK) and are never printed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { controller } from '@/app/controller';
import { runStore } from '@/app/state'; // not '@/app/store': that barrel pulls in UI modules (CSS) that tsx can't load

const getRunView = () => runStore.getState();
const runActions = controller;
import { copy } from '@/ui/copy';
import type { BankLevel, ReplayFile, ReplayIndexEntry, RumorCard } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const REPLAYS = resolve(here, '../public/replays');
const record = process.argv.includes('--record');
const runsArg = process.argv.indexOf('--runs');
const sequence: { level: BankLevel; card: RumorCard }[] = (runsArg > 0 ? process.argv[runsArg + 1] : '0:1,1:1')
  .split(',')
  .map((p) => {
    const [l, c] = p.split(':').map(Number);
    return { level: l as BankLevel, card: c as RumorCard };
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred: () => boolean, ms: number, label: string): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${label}${describeError()}`);
    await sleep(100);
  }
}
const describeError = () => {
  const e = getRunView().error;
  return e ? ` (error: ${e.title}: ${e.detail})` : '';
};

function saveReplay(file: ReplayFile, level: BankLevel, card: RumorCard): void {
  const stamp = file.recordedAt.slice(0, 16).replace(/[-:T]/g, '');
  const bank = level === 0 ? 'bhaus' : 'mutual';
  const cardKey = 'qwer'[card];
  const id = `${bank}-${cardKey}-${file.outcome.kind}-${stamp}`;
  const name = `${copy.banks[level].name} × “${copy.cards[card].text}”`;
  const out: ReplayFile = { ...file, id, name };
  mkdirSync(REPLAYS, { recursive: true });
  writeFileSync(resolve(REPLAYS, `${id}.json`), `${JSON.stringify(out, null, 2)}\n`);
  let index: ReplayIndexEntry[] = [];
  try {
    index = JSON.parse(readFileSync(resolve(REPLAYS, 'index.json'), 'utf8')) as ReplayIndexEntry[];
  } catch {
    index = [];
  }
  index = [{ id, name, recordedAt: out.recordedAt, kind: out.outcome.kind, level }, ...index.filter((e) => e.id !== id)];
  writeFileSync(resolve(REPLAYS, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`  saved replay ${id}`);
}

async function main() {
  const primary = process.env.VITE_OPERATOR_PK as `0x${string}` | undefined;
  const backup = (process.env.VITE_BACKUP_PK as `0x${string}` | undefined) ?? null;
  if (!primary) throw new Error('VITE_OPERATOR_PK is not set (run via `pnpm live:e2e`, which loads .env.local).');

  controller.init();
  console.log('Connecting and running preflight…');
  await runActions.connectOperator({ primary, backup });
  const report = getRunView().preflight;
  for (const c of report?.checks ?? []) console.log(`  [${c.status.padEnd(7)}] ${c.label}: ${c.detail}`);
  if (!report?.ok) throw new Error('Preflight is not green; fix the failing checks first.');
  if (process.argv.includes('--preflight')) {
    console.log('Preflight is green.');
    process.exit(0);
  }

  runActions.setMode('live');
  if (getRunView().mode !== 'live') throw new Error('Controller did not enter live mode.');
  console.log(`Mode: live · operator ${getRunView().operator.address}`);

  for (const [i, step] of sequence.entries()) {
    console.log(`\nRun ${i + 1}: ${copy.banks[step.level].name} × ${copy.cards[step.card].text}`);
    await waitFor(() => ['idle', 'failed', 'survived'].includes(getRunView().phase), 120_000, 'idle');
    if (getRunView().phase !== 'idle') {
      runActions.reset();
      await waitFor(() => getRunView().phase === 'idle', 120_000, 'reset');
    }
    runActions.selectLevel(step.level);
    runActions.selectCard(step.card);
    const t0 = Date.now();
    void runActions.start();
    await waitFor(() => ['failed', 'survived'].includes(getRunView().phase), 180_000, 'outcome');
    const v = getRunView();
    const o = v.outcome!;
    console.log(
      `  ${o.kind.toUpperCase()} at tick ${o.tick} · wall ${o.wallMs !== null ? (o.wallMs / 1000).toFixed(1) : '?'} s · ` +
        `${o.blocks ?? '?'} blocks · trapped ${o.trappedCount} · script total ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    );
    console.log(`  mirror ${v.mirror.matched}/${v.mirror.total} · sealed=${o.sealed} · seals ${v.seals.length} (${v.seals.map((s) => s.kind[0]).join('')})`);
    const batches = v.seals.filter((s) => s.kind === 'ticks');
    const biggest = batches.reduce((m, s) => Math.max(m, s.requestedCount ?? 0), 0);
    console.log(`  batches ${batches.length}, biggest ${biggest} requests; gas used ${batches.reduce((n, s) => n + (s.gasUsed ?? 0n), 0n)}`);
    await waitFor(() => getRunView().decisions !== null, 10_000, 'decision check').catch(() => undefined);
    const d = getRunView().decisions;
    console.log(`  decision check ${d ? `${d.matched}/${d.total}` : 'n/a'} · onchain status ${getRunView().onchain?.status ?? 'n/a'}`);
    if (v.mirror.matched !== v.mirror.total) throw new Error('Mirror disagreed with the chain.');
    const file = controller.saveReplay();
    if (record && file) saveReplay(file, step.level, step.card);
    else if (!file) console.log('  (no replay file produced)');
  }

  console.log('\nResetting the bank…');
  runActions.reset();
  await waitFor(() => getRunView().phase === 'idle', 120_000, 'final reset');
  console.log('Bank is Ready. Live end-to-end passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error('live-e2e failed:', e instanceof Error ? e.message.replace(/0x[0-9a-fA-F]{64}/g, '0x…') : e);
  process.exit(1);
});
