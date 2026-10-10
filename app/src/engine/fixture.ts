// Placeholder from F-00. Owner: B. Replace freely.
// Fixture engine: fake graph (jittered grid, ring + random edges), uniform ledger, scripted spread.
// The bank maths in applyTick follow PRD §9.4. The spread is NOT the real panic model: it requests
// a fixed number of depositors per tick so Bhau's Bank fails at tick 12 and Monad Mutual survives at tick 25.
import { encodeAbiParameters, encodePacked, keccak256, toHex } from 'viem';
import type { Hex } from 'viem';
import { NodeState } from '@/types';
import type {
  BankConfig,
  BankLevel,
  BankState,
  GraphData,
  Ledger,
  Model,
  RumorCard,
  RumorCardDef,
  RunParams,
  RunState,
  SimFrame,
  TickPayload,
  TickResult,
} from '@/types';

export const TICK_MS = 400;
export const MAX_LEAD = 6;

const N = 500;
const BPS = 10_000n;
const AUSD = 1_000_000n;

function mix(...xs: number[]): number {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

function buildGraph(): GraphData {
  const cols = 25;
  const rows = 20;
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  const add = (a: number, b: number) => {
    if (a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push([lo, hi]);
  };
  for (let i = 0; i < N; i++) {
    add(i, (i + 1) % N);
    add(i, Math.floor(mix(i, 1) * N));
    if (mix(i, 2) < 0.5) add(i, Math.floor(mix(i, 3) * N));
  }
  const neighbors: number[][] = Array.from({ length: N }, () => []);
  for (const [a, b] of edges) {
    neighbors[a].push(b);
    neighbors[b].push(a);
  }
  const byDegree = Array.from({ length: N }, (_, i) => i).sort(
    (a, b) => neighbors[b].length - neighbors[a].length || a - b,
  );
  const whales = new Set(byDegree.slice(0, 25));
  const nodes = Array.from({ length: N }, (_, id) => {
    const col = id % cols;
    const row = Math.floor(id / cols);
    const x = Math.min(0.98, Math.max(0.02, (col + 0.5 + (mix(id, 4) - 0.5) * 0.7) / cols));
    const y = Math.min(0.98, Math.max(0.02, (row + 0.5 + (mix(id, 5) - 0.5) * 0.7) / rows));
    return { id, x, y, degree: neighbors[id].length, whale: whales.has(id) };
  });
  return { nodes, edges, neighbors };
}

function buildLedger(): Ledger {
  const balances = Array.from({ length: N }, () => 19n * AUSD);
  const packed: bigint[] = [];
  for (let w = 0; w < 63; w++) {
    let word = 0n;
    for (let k = 0; k < 8; k++) {
      const id = w * 8 + k;
      if (id < N) word |= balances[id] << BigInt(32 * k);
    }
    packed.push(word);
  }
  const ledgerHash = keccak256(encodePacked(packed.map(() => 'uint256' as const), packed));
  return { balances, deposits0: balances.reduce((a, b) => a + b, 0n), packed, ledgerHash };
}

const CONFIGS: Record<BankLevel, BankConfig> = {
  0: {
    cash0: 1500n * AUSD, bonds0: 8500n * AUSD, speedBumpBps: 0, insuredCap: 0n,
    haircutBaseBps: 200, haircutSlopeBps: 6000, haircutMaxBps: 9000, quietTicks: 8,
  },
  1: {
    cash0: 1500n * AUSD, bonds0: 8500n * AUSD, speedBumpBps: 300, insuredCap: 50n * AUSD,
    haircutBaseBps: 200, haircutSlopeBps: 6000, haircutMaxBps: 9000, quietTicks: 8,
  },
};

export function hashConfig(cfg: BankConfig): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint64' }, { type: 'uint64' }, { type: 'uint16' }, { type: 'uint64' },
        { type: 'uint16' }, { type: 'uint16' }, { type: 'uint16' }, { type: 'uint16' },
      ],
      [cfg.cash0, cfg.bonds0, cfg.speedBumpBps, cfg.insuredCap, cfg.haircutBaseBps, cfg.haircutSlopeBps, cfg.haircutMaxBps, cfg.quietTicks],
    ),
  );
}

let cached: Model | null = null;

export function loadModel(): Model {
  if (cached) return cached;
  const graph = buildGraph();
  const ledger = buildLedger();
  const hubs = [...graph.nodes].sort((a, b) => b.degree - a.degree || a.id - b.id);
  const mid = hubs[Math.floor(hubs.length / 10)].id;
  const cards: RumorCardDef[] = [
    { id: 0, hotkey: 'Q', text: 'The CEO just bought a yacht.', strength: 0.4, seedNode: mid },
    { id: 1, hotkey: 'W', text: 'The audit is delayed.', strength: 0.6, seedNode: hubs[0].id },
    { id: 2, hotkey: 'E', text: 'Heard the founder flew to Dubai.', strength: 0.8, seedNode: hubs[1].id },
    { id: 3, hotkey: 'R', text: 'Screenshot: the vault is empty.', strength: 1.0, seedNode: hubs[0].id },
  ];
  cached = {
    graph, ledger, configs: CONFIGS, cards,
    modelHash: keccak256(toHex('run-fixture-model')),
    modelVersion: 'fixture-0',
  };
  return cached;
}

export function defaultParams(model: Model, level: BankLevel, card: RumorCard): RunParams {
  return { level, card, seedNode: model.cards[card].seedNode, modelSeed: BigInt(card + 1) };
}

export function initialBank(model: Model, level: BankLevel): BankState {
  const cfg = model.configs[level];
  let insuredOwed = 0n;
  for (const b of model.ledger.balances) insuredOwed += b < cfg.insuredCap ? b : cfg.insuredCap;
  return {
    status: 'ready', tick: 0,
    cash: cfg.cash0, bonds: cfg.bonds0, depositsOwed: model.ledger.deposits0, insuredOwed,
    deposits0: model.ledger.deposits0, cumulativeLoss: 0n, lastHaircutBps: 0, quietCount: 0, withdrawnCount: 0,
    queue: [], withdrawn: new Uint8Array(N), queued: new Uint8Array(N),
  };
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** PRD §9.4 mirror. */
export function applyTick(
  bank: BankState,
  cfg: BankConfig,
  ledger: Ledger,
  requested: number[],
): { bank: BankState; result: TickResult } {
  if (bank.status !== 'running') throw new Error(`bank is ${bank.status}`);
  const b: BankState = { ...bank, queue: bank.queue.slice(), withdrawn: bank.withdrawn.slice(), queued: bank.queued.slice() };
  b.tick += 1;
  const serve: number[] = [];
  let newCount = 0;
  let skipped = 0;
  for (const id of requested) {
    if (b.withdrawn[id] || b.queued[id]) { skipped += 1; continue; }
    newCount += 1;
    if (cfg.speedBumpBps === 0) serve.push(id);
    else { b.queue.push(id); b.queued[id] = 1; }
  }
  if (cfg.speedBumpBps > 0) {
    const cap = (b.deposits0 * BigInt(cfg.speedBumpBps)) / BPS;
    let used = 0n;
    while (b.queue.length > 0 && used < cap) {
      const id = b.queue.shift()!;
      b.queued[id] = 0;
      serve.push(id);
      used += ledger.balances[id];
    }
  }
  let demand = 0n;
  for (const id of serve) demand += ledger.balances[id];
  const shortfall = demand > b.cash ? demand - b.cash : 0n;
  const haircutBps =
    shortfall === 0n
      ? 0
      : Math.min(cfg.haircutMaxBps, cfg.haircutBaseBps + Number((BigInt(cfg.haircutSlopeBps) * shortfall) / cfg.bonds0));
  let paid = 0n;
  let bondsSold = 0n;
  let loss = 0n;
  let failedNow = false;
  const servedIds: number[] = [];
  for (const id of serve) {
    const bal = ledger.balances[id];
    if (b.cash >= bal) b.cash -= bal;
    else {
      const need = bal - b.cash;
      const sell = ceilDiv(need * BPS, BPS - BigInt(haircutBps));
      if (sell > b.bonds) { failedNow = true; break; }
      b.bonds -= sell;
      bondsSold += sell;
      loss += sell - need;
      b.cash = 0n;
    }
    b.withdrawn[id] = 1;
    b.withdrawnCount += 1;
    paid += bal;
    b.depositsOwed -= bal;
    b.insuredOwed -= min(bal, cfg.insuredCap);
    servedIds.push(id);
  }
  b.cumulativeLoss += loss;
  b.lastHaircutBps = haircutBps;
  if (failedNow || b.cash + b.bonds < b.depositsOwed) b.status = 'failed';
  else if (newCount === 0 && b.queue.length === 0) {
    b.quietCount += 1;
    if (b.quietCount >= cfg.quietTicks) b.status = 'survived';
  } else b.quietCount = 0;
  const result: TickResult = {
    tick: b.tick, requested: requested.slice(), served: servedIds, skipped,
    paid, bondsSold, fireSaleLoss: loss, haircutBps,
    cashAfter: b.cash, bondsAfter: b.bonds, depositsOwedAfter: b.depositsOwed, queueLengthAfter: b.queue.length,
    statusAfter: b.status,
    trapped:
      b.status === 'failed'
        ? { count: N - b.withdrawnCount, amount: b.depositsOwed, uninsured: b.depositsOwed - b.insuredOwed }
        : null,
  };
  return { bank: b, result };
}

interface Internal { order: number[]; cursor: number; dist: Int16Array; goneAt: Int16Array }

function bfs(graph: GraphData, seed: number): Int16Array {
  const dist = new Int16Array(N).fill(-1);
  dist[seed] = 0;
  const q = [seed];
  for (let h = 0; h < q.length; h++) {
    for (const k of graph.neighbors[q[h]]) {
      if (dist[k] === -1) { dist[k] = dist[q[h]] + 1; q.push(k); }
    }
  }
  return dist;
}

function frameOf(model: Model, params: RunParams, internal: Internal, bank: BankState, tick: number, last: TickResult | null, requested: number[]): SimFrame {
  const nodeState = new Uint8Array(N);
  const panic = new Float32Array(N);
  const heardAt = new Int16Array(N).fill(-1);
  const newlyHeard: number[] = [];
  for (let i = 0; i < N; i++) {
    const d = internal.dist[i];
    if (d >= 0 && d <= tick) {
      heardAt[i] = d;
      if (d === tick && tick > 0) newlyHeard.push(i);
    }
    let s: number = NodeState.Calm;
    if (heardAt[i] >= 0) {
      panic[i] = Math.min(1.5, (tick - heardAt[i] + 1) / 8 + 0.1 * mix(i, 6));
      s = panic[i] >= 0.6 ? NodeState.Panicking : NodeState.Heard;
    }
    if (bank.queued[i]) s = NodeState.Queued;
    if (bank.withdrawn[i]) s = NodeState.Withdrawn;
    else if (bank.status === 'failed') s = NodeState.Trapped;
    nodeState[i] = s;
  }
  if (tick === 0) newlyHeard.push(params.seedNode);
  void model;
  return {
    tick, nodeState, panic, heardAt, goneAt: internal.goneAt.slice(),
    newlyHeard, newlyRequested: requested.slice(), newlyServed: last ? last.served.slice() : [],
    bank, last,
  };
}

export function createRun(model: Model, params: RunParams): RunState {
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => mix(a, 9, Number(params.modelSeed)) - mix(b, 9, Number(params.modelSeed)));
  const internal: Internal = { order, cursor: 0, dist: bfs(model.graph, params.seedNode), goneAt: new Int16Array(N).fill(-1) };
  const bank: BankState = { ...initialBank(model, params.level), status: 'running' };
  return { params, frame: frameOf(model, params, internal, bank, 0, null, []), history: [], internal };
}

export function stepRunWithRequested(
  model: Model,
  run: RunState,
  requested: number[],
): { run: RunState; payload: TickPayload; result: TickResult } {
  const prev = run.internal as Internal;
  const sorted = [...new Set(requested)].sort((a, b) => a - b);
  const { bank, result } = applyTick(run.frame.bank, model.configs[run.params.level], model.ledger, sorted);
  const goneAt = prev.goneAt.slice();
  for (const id of sorted) if (goneAt[id] === -1) goneAt[id] = result.tick;
  const internal: Internal = { ...prev, goneAt };
  const payload: TickPayload = { tick: result.tick, requested: sorted };
  const frame = frameOf(model, run.params, internal, bank, result.tick, result, sorted);
  return { run: { params: run.params, frame, history: [...run.history, payload], internal }, payload, result };
}

function scriptedWant(level: BankLevel, tick: number): number {
  if (level === 0) return tick <= 11 ? 15 : tick === 12 ? 200 : 0;
  return tick <= 17 ? 10 : 0;
}

export function stepRun(model: Model, run: RunState): { run: RunState; payload: TickPayload; result: TickResult } {
  const internal = run.internal as Internal;
  const tick = run.frame.tick + 1;
  const want = scriptedWant(run.params.level, tick);
  const requested = internal.order.slice(internal.cursor, internal.cursor + want);
  const advanced: RunState = { ...run, internal: { ...internal, cursor: Math.min(N, internal.cursor + want) } };
  return stepRunWithRequested(model, advanced, requested);
}

export function replayTicks(
  model: Model,
  params: RunParams,
  ticks: TickPayload[],
): { run: RunState; results: TickResult[] } {
  let run = createRun(model, params);
  const results: TickResult[] = [];
  for (const t of ticks) {
    if (run.frame.bank.status !== 'running') break;
    const step = stepRunWithRequested(model, run, t.requested);
    run = step.run;
    results.push(step.result);
  }
  return { run, results };
}

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
    const predicted = stepRun(model, run).payload.requested;
    const ok = predicted.length === t.requested.length && predicted.every((v, i) => v === t.requested[i]);
    if (ok) matched += 1;
    else if (firstMismatchTick === null) firstMismatchTick = t.tick;
    run = stepRunWithRequested(model, { ...run, internal: { ...(run.internal as Internal), cursor: (run.internal as Internal).cursor + t.requested.length } }, t.requested).run;
  }
  return { matched, total: ticks.length, firstMismatchTick };
}
