// Scenario evaluation and the PRD §10.4 tuning targets. Shared by the tuner (scripts/tune.ts) and the guard-rail tests.
import type { BankLevel, Model, RumorCard, RunParams } from '@/types';
import { defaultParams } from './model';
import { createRun, stepRun } from './run';

export const MAX_EVAL_TICKS = 80;

export interface Row {
  level: BankLevel;
  card: RumorCard;
  outcome: 'failed' | 'survived' | 'running';
  tick: number;
  seconds: number; // tick × 0.4
  heardPct: number; // % of nodes that had heard when the run ended
  whalesOutPct: number; // % of whales paid before the end
  peakRequests: number; // max requests in a single tick
  peakQueue: number; // longest speed-bump queue seen after any tick
  loss: number; // cumulative fire-sale loss, AUSD
  lossPctOfEquity: number;
  trapped: number;
  requestedPct: number; // % of depositors who asked for their money
  smallRequestedPct: number; // % of non-whales who asked
  whaleMeanTick: number | null; // mean tick at which requesting whales asked
  smallMeanTick: number | null; // mean tick at which requesting non-whales asked
  hash: string; // digest of the full request history: pins determinism
}

/** FNV-1a over the request history. Not cryptographic: a cheap, stable fingerprint. */
function historyHash(history: { requested: number[] }[]): string {
  let h = 0x811c9dc5;
  const mix = (x: number) => {
    h ^= x & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (x >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  for (const t of history) {
    mix(0xffff);
    for (const id of t.requested) mix(id);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function evaluate(model: Model, params: RunParams, maxTicks = MAX_EVAL_TICKS): Row {
  let run = createRun(model, params);
  let peak = 0;
  let peakQueue = 0;
  while (run.frame.bank.status === 'running' && run.frame.tick < maxTicks) {
    const s = stepRun(model, run);
    run = s.run;
    if (s.payload.requested.length > peak) peak = s.payload.requested.length;
    if (run.frame.bank.queue.length > peakQueue) peakQueue = run.frame.bank.queue.length;
  }
  const f = run.frame;
  const n = model.graph.nodes.length;
  let heard = 0;
  let requested = 0;
  for (let i = 0; i < n; i++) {
    if (f.heardAt[i] >= 0) heard++;
    if (f.goneAt[i] >= 0) requested++;
  }
  let whales = 0;
  let whalesOut = 0;
  let smalls = 0;
  let smallsAsked = 0;
  let whaleTickSum = 0;
  let whaleAsked = 0;
  let smallTickSum = 0;
  for (const node of model.graph.nodes) {
    const asked = f.goneAt[node.id] >= 0;
    if (!node.whale) {
      smalls++;
      if (asked) {
        smallsAsked++;
        smallTickSum += f.goneAt[node.id];
      }
      continue;
    }
    whales++;
    if (f.bank.withdrawn[node.id]) whalesOut++;
    if (asked) {
      whaleAsked++;
      whaleTickSum += f.goneAt[node.id];
    }
  }
  const cfg = model.configs[params.level];
  const equity = Number(cfg.cash0 + cfg.bonds0 - model.ledger.deposits0) / 1e6;
  const loss = Number(f.bank.cumulativeLoss) / 1e6;
  const outcome = f.bank.status === 'failed' || f.bank.status === 'survived' ? f.bank.status : 'running';
  return {
    level: params.level,
    card: params.card,
    outcome,
    tick: f.tick,
    seconds: (f.tick * 400) / 1000,
    heardPct: (100 * heard) / n,
    whalesOutPct: whales > 0 ? (100 * whalesOut) / whales : 0,
    peakRequests: peak,
    peakQueue,
    loss,
    lossPctOfEquity: equity > 0 ? (100 * loss) / equity : 0,
    trapped: f.last?.trapped?.count ?? 0,
    requestedPct: (100 * requested) / n,
    smallRequestedPct: smalls > 0 ? (100 * smallsAsked) / smalls : 0,
    whaleMeanTick: whaleAsked > 0 ? whaleTickSum / whaleAsked : null,
    smallMeanTick: smallsAsked > 0 ? smallTickSum / smallsAsked : null,
    hash: historyHash(run.history),
  };
}

export const LEVELS = [0, 1] as const;
export const CARDS = [0, 1, 2, 3] as const;

export function evaluateAll(
  model: Model,
  seedOverride?: (card: RumorCard) => bigint | undefined,
  levels: readonly BankLevel[] = LEVELS,
): Row[] {
  const rows: Row[] = [];
  for (const level of levels) {
    for (const card of CARDS) {
      const p = defaultParams(model, level, card);
      const s = seedOverride?.(card);
      rows.push(evaluate(model, s === undefined ? p : { ...p, modelSeed: s }));
    }
  }
  return rows;
}

export interface Violation {
  row: Row;
  rule: string;
  /** 0 = fine; roughly "how many units away" for the search to minimise */
  penalty: number;
}

const BHAU_TICKS: [number, number] = [8, 16];

/** PRD §10.4. Returns every violated target; empty array = the model passes. */
export function checkTargets(rows: Row[], margin = 0): Violation[] {
  const out: Violation[] = [];
  const add = (row: Row, rule: string, penalty: number) => {
    if (penalty > 0) out.push({ row, rule, penalty });
  };
  for (const r of rows) {
    add(r, 'peak requests per tick ≤ 200', Math.max(0, r.peakRequests - 200) / 10);
    if (r.level === 0 && r.card !== 0) {
      add(r, "Bhau's × W/E/R fails", r.outcome === 'failed' ? 0 : 20);
      if (r.outcome === 'failed') {
        add(r, "Bhau's × W/E/R fails at tick 8–16", Math.max(0, BHAU_TICKS[0] + margin - r.tick, r.tick - (BHAU_TICKS[1] - margin)));
      }
    }
    if (r.level === 0 && r.card === 0) {
      // fails by tick 30 or fizzles (survives after the rumor dies)
      if (r.outcome === 'failed') add(r, "Bhau's × Q fails by tick 30", Math.max(0, r.tick - 30));
      else if (r.outcome === 'running') add(r, "Bhau's × Q ends (fails by 30 or fizzles)", 20);
    }
    if (r.level === 0 && r.card === 1) {
      add(r, "Bhau's × W: ≥ 60% of nodes heard at failure", Math.max(0, 60 - r.heardPct) / 5);
      add(r, "Bhau's × W: ≥ 70% of whales withdrew before failure", Math.max(0, 70 - r.whalesOutPct) / 5);
    }
    if (r.level === 1) {
      add(r, 'Monad Mutual survives', r.outcome === 'survived' ? 0 : 20);
      add(r, 'Monad Mutual: 0 trapped', r.trapped / 10);
      add(r, 'Monad Mutual: loss ≤ 80% of equity', Math.max(0, r.lossPctOfEquity - 80) / 5);
      add(r, 'Monad Mutual survives by tick 40', Math.max(0, r.tick - 40));
    }
  }
  return out;
}

/**
 * Demo-quality guard rails (not in PRD §10.4, but the §5.1 script depends on them): a run must look like the script.
 * Bhau's: a rumor that actually travels and a batch of dozens in one block. Mutual: depositors really do panic, a
 * queue forms outside the teller window, and the bank still survives.
 */
export function checkStory(rows: Row[]): Violation[] {
  const out: Violation[] = [];
  const add = (row: Row, rule: string, penalty: number) => {
    if (penalty > 0) out.push({ row, rule, penalty });
  };
  for (const r of rows) {
    if (r.level === 0 && r.card !== 0) {
      add(r, "story: Bhau's has a batch of ≥ 30 requests in one tick", Math.max(0, 30 - r.peakRequests) / 5);
      add(r, "story: Bhau's × W/E/R: ≥ 20% of depositors ask for their money", Math.max(0, 20 - r.requestedPct) / 3);
      add(r, "story: Bhau's × W/E/R: ≥ 50% of nodes heard at failure", Math.max(0, 50 - r.heardPct) / 5);
      if (r.whaleMeanTick !== null && r.smallMeanTick !== null) {
        add(r, "story: Bhau's × W/E/R: the whales go first (mean ask tick earlier than the small depositors')", Math.max(0, r.whaleMeanTick - r.smallMeanTick + 0.5) * 2);
      }
    }
    if (r.level === 0 && r.card === 0) add(r, 'story: Q still travels (≥ 20% heard)', Math.max(0, 20 - r.heardPct) / 5);
    if (r.level === 1 && r.card !== 0) {
      const need = r.card === 1 ? 12 : 20;
      add(r, 'story: Mutual × W/E/R: real panic (≥ 12–20% of depositors ask)', Math.max(0, need - r.requestedPct) / 3);
      add(r, 'story: Mutual × W/E/R: a queue forms (peak ≥ 10)', Math.max(0, 10 - r.peakQueue) / 3);
      add(r, 'story: Mutual × W/E/R: lasts at least 14 ticks', Math.max(0, 14 - r.tick) / 2);
      add(r, 'story: Mutual × W/E/R: the insured stay calm (≤ 60% of small depositors ask)', Math.max(0, r.smallRequestedPct - 60) / 3);
      if (r.whaleMeanTick !== null && r.smallMeanTick !== null) {
        add(r, 'story: Mutual × W/E/R: the whales go first', Math.max(0, r.whaleMeanTick - r.smallMeanTick + 0.5) * 2);
      }
    }
  }
  return out;
}

export function totalPenalty(v: Violation[]): number {
  let s = 0;
  for (const x of v) s += x.penalty;
  return s;
}
