// B-08: tuner. `pnpm tune` prints every level × card; `pnpm tune --search [--write]` searches the panic constants and the
// card seed nodes for the PRD §10.4 targets and (with --write) writes data/model.json + data/cards.json.
// Seeded and deterministic: the same command always finds the same winner. Never Math.random.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RumorCard } from '../src/types';
import { checkStory, checkTargets, evaluateAll, totalPenalty } from '../src/engine/eval';
import type { Row } from '../src/engine/eval';
import { buildModelFile, deriveModel, loadModel, tuningOf } from '../src/engine/model';
import type { Tuning } from '../src/engine/model';
import { u } from '../src/engine/prng';

const dataDir = fileURLToPath(new URL('../src/engine/data/', import.meta.url));
const args = new Set(process.argv.slice(2));
const NAMES = ['Q', 'W', 'E', 'R'];

function table(rows: Row[]): string {
  const head = ['bank', 'card', 'outcome', 'tick', 'sec', 'heard%', 'reqd%', 'whales%', 'smalls%', 'peak', 'queue', 'loss', 'loss/eq%', 'trapped'];
  const lines = [head.join('\t')];
  for (const r of rows) {
    lines.push([
      r.level === 0 ? "Bhau's" : 'Mutual', NAMES[r.card], r.outcome, r.tick, r.seconds.toFixed(1), r.heardPct.toFixed(0), r.requestedPct.toFixed(0),
      r.whalesOutPct.toFixed(0), r.smallRequestedPct.toFixed(0), r.peakRequests, r.peakQueue, r.loss.toFixed(1), r.lossPctOfEquity.toFixed(0), r.trapped,
    ].join('\t'));
  }
  return lines.join('\n');
}

function report(rows: Row[]): number {
  console.log(table(rows));
  const v = [...checkTargets(rows), ...checkStory(rows)];
  if (v.length === 0) console.log('\nALL PRD §10.4 TARGETS AND STORY GUARD RAILS PASS');
  else for (const x of v) console.log(`FAIL  ${x.row.level === 0 ? "Bhau's" : 'Mutual'} × ${NAMES[x.row.card]}: ${x.rule} (penalty ${x.penalty.toFixed(1)})`);
  return totalPenalty(v);
}

const base = loadModel();
if (!args.has('--search')) {
  report(evaluateAll(base));
  process.exit(0);
}

// ── search ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Num = Record<string, number>;
interface Knob { path: 'weights' | 'thresholds'; key: string; lo: number; hi: number; step: number }
const KNOBS: Knob[] = [
  { path: 'weights', key: 'tellBase', lo: 0, hi: 0.5, step: 0.0125 },
  { path: 'weights', key: 'tellStrength', lo: 0.0125, hi: 0.8, step: 0.0125 },
  { path: 'weights', key: 'whaleTellMult', lo: 1, hi: 2, step: 0.1 },
  { path: 'weights', key: 'strengthW', lo: 0.2, hi: 1.2, step: 0.05 },
  { path: 'weights', key: 'goneW', lo: 0.1, hi: 1.5, step: 0.05 },
  { path: 'weights', key: 'cashW', lo: 0.05, hi: 1.2, step: 0.05 },
  { path: 'weights', key: 'queueW', lo: 0, hi: 0.6, step: 0.05 },
  { path: 'weights', key: 'haircutW', lo: 0, hi: 0.8, step: 0.05 },
  { path: 'weights', key: 'insuredW', lo: 0.4, hi: 1.2, step: 0.05 },
  { path: 'weights', key: 'fadeTicks', lo: 6, hi: 30, step: 1 },
  { path: 'thresholds', key: 'whaleBase', lo: 0.05, hi: 0.8, step: 0.025 },
  { path: 'thresholds', key: 'whaleSpan', lo: 0.05, hi: 2.0, step: 0.05 },
  { path: 'thresholds', key: 'otherBase', lo: 0.1, hi: 1.2, step: 0.025 },
  { path: 'thresholds', key: 'otherSpan', lo: 0.1, hi: 2.5, step: 0.05 },
];

// seed-node candidates per card, from the graph: Q a mid-size hub, W/E/R among the biggest hubs (PRD §10.2)
const byDegree = [...base.graph.nodes].sort((a, b) => b.degree - a.degree || a.id - b.id).map((n) => n.id);
const whalesByBalance = base.graph.nodes.filter((n) => n.whale).map((n) => n.id)
  .sort((a, b) => Number(base.ledger.balances[b] - base.ledger.balances[a]) || a - b);
const SEED_CANDIDATES: number[][] = [byDegree.slice(15, 45), whalesByBalance.slice(0, 12), byDegree.slice(0, 8), byDegree.slice(0, 4)];

interface Cand { tuning: Tuning; seeds: number[]; strengths: number[] }
const clone = (c: Cand): Cand => ({
  tuning: { weights: { ...c.tuning.weights }, thresholds: { ...c.tuning.thresholds }, modelSeeds: c.tuning.modelSeeds.slice() },
  seeds: c.seeds.slice(),
  strengths: c.strengths.slice(),
});

// Robustness: the tuned model must also pass for other model seeds (the shipped one is just one draw).
const ALT_SEEDS = [1001n, 2002n];
// TUNE_LEVELS=0 searches Bhau's Bank alone (stage 1: fast); default searches both banks.
const LEVELS_SEARCHED = (process.env.TUNE_LEVELS ?? '0,1').split(',').map((x) => Number(x) as 0 | 1);
function penaltyOf(c: Cand): { rows: Row[]; penalty: number } {
  const cards = base.cards.map((card, i) => ({ ...card, seedNode: c.seeds[i], strength: c.strengths[i] }));
  const m = deriveModel(base, { tuning: c.tuning, cards });
  const rows = evaluateAll(m, undefined, LEVELS_SEARCHED);
  const score = (r: Row[]) => totalPenalty(checkTargets(r, 1)) + totalPenalty(checkStory(r)); // aim 1 tick inside the window for headroom
  let penalty = score(rows);
  for (const alt of ALT_SEEDS) penalty += 0.3 * score(evaluateAll(m, (card) => alt + BigInt(card), LEVELS_SEARCHED));
  return { rows, penalty };
}

const startOverride = JSON.parse(process.env.TUNE_START ?? '{}') as { weights?: Num; thresholds?: Num; seeds?: number[]; strengths?: number[] };
const startTuning = tuningOf(base);
let cur: Cand = {
  tuning: {
    ...startTuning,
    weights: { ...startTuning.weights, ...startOverride.weights },
    thresholds: { ...startTuning.thresholds, ...startOverride.thresholds },
  },
  seeds: startOverride.seeds ?? base.cards.map((c) => c.seedNode),
  strengths: startOverride.strengths ?? base.cards.map((c) => c.strength),
};
let curEval = penaltyOf(cur);
let best = cur;
let bestEval = curEval;
console.log(`start penalty ${bestEval.penalty.toFixed(2)}`);
const budget = Number(process.env.TUNE_EVALS ?? 6000);
const S = Number(process.env.TUNE_SEED ?? 0) * 16; // different seeds = different search paths
for (let i = 0; i < budget && bestEval.penalty > 0; i++) {
  const temp = 3 * (1 - i / budget) + 0.01;
  const cand = clone(cur);
  const moves = 1 + Math.floor(u(S + 1, i, 0, 0) * 3);
  for (let m = 0; m < moves; m++) {
    if (u(S + 9, i, m, 0) < 0.06) {
      // nudge one card's strength, keeping Q ≤ W ≤ E ≤ R
      const card = Math.floor(u(S + 10, i, m, 0) * 4);
      const v = Math.round((cand.strengths[card] + (u(S + 11, i, m, 0) < 0.5 ? -0.05 : 0.05)) * 100) / 100;
      const lo = card === 0 ? 0.2 : cand.strengths[card - 1] + 0.1; // cards stay strictly ordered, at least 0.1 apart
      const hi = card === 3 ? 1 : cand.strengths[card + 1] - 0.1;
      cand.strengths[card] = Math.min(hi, Math.max(lo, v));
      continue;
    }
    if (u(S + 5, i, m, 0) < 0.08) {
      const card = Math.floor(u(S + 6, i, m, 0) * 4);
      const list = SEED_CANDIDATES[card];
      cand.seeds[card] = list[Math.floor(u(S + 7, i, m, 0) * list.length)];
      continue;
    }
    const k = KNOBS[Math.floor(u(S + 2, i, m, 0) * KNOBS.length)];
    const val = (cand.tuning[k.path] as unknown as Num)[k.key];
    const dir = u(S + 3, i, m, 0) < 0.5 ? -1 : 1;
    const mult = 1 + Math.floor(u(S + 4, i, m, 0) * 4);
    (cand.tuning[k.path] as unknown as Num)[k.key] = Math.min(k.hi, Math.max(k.lo, Math.round((val + dir * mult * k.step) / k.step) * k.step));
  }
  const e = penaltyOf(cand);
  if (e.penalty <= curEval.penalty || u(S + 8, i, 0, 0) < Math.exp((curEval.penalty - e.penalty) / temp)) {
    cur = cand;
    curEval = e;
    if (e.penalty < bestEval.penalty) {
      best = cand;
      bestEval = e;
      console.log(`eval ${i}: penalty ${e.penalty.toFixed(2)}`);
    }
  }
}

console.log('\nbest tuning:', JSON.stringify({ weights: best.tuning.weights, thresholds: best.tuning.thresholds, seeds: best.seeds, strengths: best.strengths }));
const cards = base.cards.map((card, i) => ({ ...card, seedNode: best.seeds[i], strength: best.strengths[i] }));
const finalModel = deriveModel(base, { tuning: best.tuning, cards });
const penalty = report(evaluateAll(finalModel));
console.log(`robustness penalty (alt model seeds): ${ALT_SEEDS.map((a) => (() => { const r = evaluateAll(finalModel, (card) => a + BigInt(card)); return totalPenalty(checkTargets(r)) + totalPenalty(checkStory(r)); })().toFixed(1)).join(', ')}`);
if (args.has('--write')) {
  const version = process.env.MODEL_VERSION ?? 'v1-tuned';
  const file = buildModelFile(finalModel, best.tuning, version);
  writeFileSync(dataDir + 'model.json', JSON.stringify(file, null, 1) + '\n');
  const raw = JSON.parse(readFileSync(dataDir + 'cards.json', 'utf8')) as unknown[];
  for (const c of raw as { id: RumorCard; seedNode: number; strength: number }[]) {
    c.seedNode = best.seeds[c.id];
    c.strength = best.strengths[c.id];
  }
  writeFileSync(dataDir + 'cards.json', JSON.stringify(raw, null, 1) + '\n');
  console.log(`wrote model.json ${file.modelHash} and cards.json seeds ${best.seeds.join(', ')} (penalty ${penalty.toFixed(2)})`);
}
