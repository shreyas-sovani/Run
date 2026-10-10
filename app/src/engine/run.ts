// Run stepping (B-06, B-07): spread the rumor, score every listener, decide who requests, apply the PRD §9 mirror.
// A run is immutable: every step returns a new RunState; typed arrays inside a frame are never written again after the step.
// Only + - × ÷ min max and comparisons on doubles, plus the hash `u`: identical decisions in every browser (PRD §10.3).
import { NodeState } from '@/types';
import type { BankState, Model, RunParams, RunState, SimFrame, TickPayload, TickResult } from '@/types';
import { applyTick, initialBank } from './bank';
import { tuningOf } from './model';
import { bankPressure, listeningState, panicScore, tellProbability, thresholdOf } from './panic';
import type { PanicParams } from './panic';
import { foldSeed, u } from './prng';

const MICRO = 1_000_000;

/** Per-model constants that never change during a run (AUSD as plain numbers, whale flags, insurance caps). */
interface Static {
  n: number;
  bal: Float64Array; // AUSD
  neighborBal: Float64Array; // Σ balance of neighbours, AUSD
  whale: Uint8Array;
  insuredShare: Float64Array[]; // by level: min(b, cap) / b
}
const statics = new WeakMap<Model, Static>();

function staticOf(model: Model): Static {
  const hit = statics.get(model);
  if (hit) return hit;
  const n = model.graph.nodes.length;
  const bal = new Float64Array(n);
  const whale = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    bal[i] = Number(model.ledger.balances[i]) / MICRO;
    whale[i] = model.graph.nodes[i].whale ? 1 : 0;
  }
  const neighborBal = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const k of model.graph.neighbors[i]) s += bal[k];
    neighborBal[i] = s;
  }
  const insuredShare = ([0, 1] as const).map((level) => {
    const cap = Number(model.configs[level].insuredCap) / MICRO;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = cap > 0 && bal[i] > 0 ? (bal[i] < cap ? bal[i] : cap) / bal[i] : 0;
    return out;
  });
  const s: Static = { n, bal, neighborBal, whale, insuredShare };
  statics.set(model, s);
  return s;
}

/** Run-private state, carried in `RunState.internal` (opaque to everyone else). */
interface Internal {
  seed: number; // folded modelSeed
  tuning: PanicParams;
  strength: number;
  threshold: Float64Array; // per node, fixed for the run
  heardAt: Int16Array;
  goneAt: Int16Array; // tick at which the node requested; -1 if not yet
  servedPrev: number[]; // ids paid last tick: their neighbours saw it happen
}

export interface StepOutput {
  run: RunState;
  payload: TickPayload;
  result: TickResult;
}

function frameOf(
  model: Model, st: Static, it: Internal, bank: BankState, tick: number, last: TickResult | null,
  score: Float64Array, newlyHeard: number[], newlyRequested: number[], newlyServed: number[],
): SimFrame {
  const n = st.n;
  const nodeState = new Uint8Array(n);
  const panic = new Float32Array(n);
  const failed = bank.status === 'failed';
  void model;
  for (let i = 0; i < n; i++) {
    let s: NodeState = NodeState.Calm;
    if (it.heardAt[i] >= 0) {
      const p = score[i] / it.threshold[i];
      panic[i] = p > 0 ? (p < 2 ? p : 2) : 0;
      s = listeningState(it.tuning.thresholds, score[i], it.threshold[i]);
    }
    if (bank.withdrawn[i]) s = NodeState.Withdrawn;
    else if (failed) s = NodeState.Trapped;
    else if (bank.queued[i]) s = NodeState.Queued;
    nodeState[i] = s;
  }
  return { tick, nodeState, panic, heardAt: it.heardAt, goneAt: it.goneAt, newlyHeard, newlyRequested, newlyServed, bank, last };
}

export function createRun(model: Model, params: RunParams): RunState {
  const st = staticOf(model);
  const n = st.n;
  const tuning = tuningOf(model);
  const seed = foldSeed(params.modelSeed);
  const threshold = new Float64Array(n);
  for (let i = 0; i < n; i++) threshold[i] = thresholdOf(tuning.thresholds, st.whale[i] === 1, u(seed, 0, i, 1));
  const heardAt = new Int16Array(n).fill(-1);
  heardAt[params.seedNode] = 0;
  const goneAt = new Int16Array(n).fill(-1);
  const it: Internal = { seed, tuning, strength: model.cards[params.card].strength, threshold, heardAt, goneAt, servedPrev: [] };
  const bank: BankState = { ...initialBank(model, params.level), status: 'running' };
  // tick 0: only the seed has heard; scores are the starting ones (everyone listening starts below their threshold)
  const score = new Float64Array(n);
  score[params.seedNode] = tuning.weights.strengthW * it.strength;
  const frame = frameOf(model, st, it, bank, 0, null, score, [params.seedNode], [], []);
  return { params, frame, history: [], internal: it };
}

/**
 * One tick. `given === null`: the model decides who requests. Otherwise `given` (spectate / replay) are the requests,
 * but spread and scores are still recomputed so the picture is right. `decided` is what the model would have asked for.
 */
function step(model: Model, run: RunState, given: number[] | null): StepOutput & { decided: number[] } {
  const st = staticOf(model);
  const it = run.internal as Internal;
  const w = it.tuning.weights;
  const n = st.n;
  const prev = run.frame;
  const bank = prev.bank;
  const t = prev.tick + 1;
  const neighbors = model.graph.neighbors;
  const heardAt = it.heardAt.slice();
  const goneAt = it.goneAt.slice();
  const newlyHeard: number[] = [];

  // 1. spread: everyone who heard before t tells each un-heard neighbour with probability pTell; neighbours of someone
  //    paid last tick also hear (they saw it)
  for (let j = 0; j < n; j++) {
    if (it.heardAt[j] < 0) continue;
    const p = tellProbability(w, it.strength, st.whale[j] === 1);
    const nb = neighbors[j];
    for (let x = 0; x < nb.length; x++) {
      const k = nb[x];
      if (heardAt[k] >= 0) continue;
      if (u(it.seed, t, j, k) < p) {
        heardAt[k] = t;
        newlyHeard.push(k);
      }
    }
  }
  for (const id of it.servedPrev) {
    const nb = neighbors[id];
    for (let x = 0; x < nb.length; x++) {
      const k = nb[x];
      if (heardAt[k] < 0) {
        heardAt[k] = t;
        newlyHeard.push(k);
      }
    }
  }

  // 2. scores from the bank after t − 1
  const pressure = bankPressure(w, Number(bank.cash) / MICRO, Number(bank.depositsOwed) / MICRO, bank.queue.length, bank.lastHaircutBps);
  const shares = st.insuredShare[run.params.level];
  const score = new Float64Array(n);
  const decided: number[] = [];
  for (let i = 0; i < n; i++) {
    if (heardAt[i] < 0 || goneAt[i] >= 0) continue;
    let gone = 0;
    const nb = neighbors[i];
    for (let x = 0; x < nb.length; x++) {
      const k = nb[x];
      if (bank.withdrawn[k] === 1 || bank.queued[k] === 1) gone += st.bal[k];
    }
    const goneShare = st.neighborBal[i] > 0 ? gone / st.neighborBal[i] : 0;
    const s = panicScore(w, it.strength, t - heardAt[i], goneShare, shares[i], pressure);
    score[i] = s;
    // 3. decision
    if (s >= it.threshold[i]) decided.push(i);
  }

  // 4. the bank
  let requested = decided;
  if (given !== null) {
    requested = [...new Set(given)].sort((a, b) => a - b);
    for (const id of requested) {
      if (id >= 0 && id < n && heardAt[id] < 0) {
        heardAt[id] = t; // someone asked who never heard from us: show them as heard
        newlyHeard.push(id);
      }
    }
  }
  const { bank: nextBank, result } = applyTick(bank, model.configs[run.params.level], model.ledger, requested);
  const newlyRequested: number[] = [];
  for (const id of requested) {
    if (goneAt[id] < 0) {
      goneAt[id] = t;
      newlyRequested.push(id);
    }
  }
  const newlyServed = result.served.filter((id) => nextBank.withdrawn[id] === 1);
  const next: Internal = { ...it, heardAt, goneAt, servedPrev: newlyServed };
  const frame = frameOf(model, st, next, nextBank, t, result, score, newlyHeard, newlyRequested, newlyServed);
  const payload: TickPayload = { tick: t, requested: requested.slice() };
  return { run: { params: run.params, frame, history: [...run.history, payload], internal: next }, payload, result, decided };
}

/** Advance one tick; the depositors decide who asks for money. */
export function stepRun(model: Model, run: RunState): StepOutput {
  const { run: r, payload, result } = step(model, run, null);
  return { run: r, payload, result };
}

/** Advance one tick with the given requests (spectate, replay); spread and scores are still recomputed for the visuals. */
export function stepRunWithRequested(model: Model, run: RunState, requested: number[]): StepOutput {
  const { run: r, payload, result } = step(model, run, requested);
  return { run: r, payload, result };
}

export function replayTicks(model: Model, params: RunParams, ticks: TickPayload[]): { run: RunState; results: TickResult[] } {
  let run = createRun(model, params);
  const results: TickResult[] = [];
  for (const t of ticks) {
    if (run.frame.bank.status !== 'running') break;
    const s = stepRunWithRequested(model, run, t.requested);
    run = s.run;
    results.push(s.result);
  }
  return { run, results };
}

const sameList = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Re-derive each tick's requests from the model and compare them to the given lists. The run follows the given lists
 * (the chain is the truth), so a mismatch at tick k says "the chain did something the open model would not have".
 */
export function verifyDecisions(
  model: Model,
  params: RunParams,
  ticks: TickPayload[],
): { matched: number; total: number; firstMismatchTick: number | null } {
  let run = createRun(model, params);
  let matched = 0;
  let firstMismatchTick: number | null = null;
  for (const t of ticks) {
    if (run.frame.bank.status !== 'running') break;
    const s = step(model, run, t.requested);
    if (sameList(s.decided, s.payload.requested)) matched += 1;
    else if (firstMismatchTick === null) firstMismatchTick = t.tick;
    run = s.run;
  }
  return { matched, total: ticks.length, firstMismatchTick };
}
