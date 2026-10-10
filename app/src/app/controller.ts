// RunController (PRD §7.2). MODULE SINGLETON: no React state, idempotent init/start/setMode, one tick
// interval and one block watcher per session, so React StrictMode's double effects can never start two runners.
//
// Practice runs the full loop against the mock adapter. Live (F-06), Replay (F-07) and Spectate (F-08)
// plug into the same session shape: `dispose()` tears everything down before another mode starts.
import type { Hex } from 'viem';
import {
  addressOfKey,
  clearOperatorKeys,
  createLiveAdapter,
  createMockAdapter,
  createRecorder,
  createSealQueue,
  createSpectator,
  deployment,
  listReplays,
  loadOperatorKeys,
  loadReplay,
  saveOperatorKeys,
  translateError,
} from '@/chain';
import type { ChainAdapter, Recorder, SealQueue } from '@/chain';
import {
  MAX_LEAD,
  TICK_MS,
  createRun,
  defaultParams,
  hashConfig,
  loadModel,
  stepRun,
  stepRunWithRequested,
  verifyDecisions,
} from '@/engine';
import { initialRunView, patchPending, patchRun, runStore } from '@/app/state';
import { stopFakeRun } from '@/app/fixtures/fakeRun';
import type {
  BankLevel,
  BankSnapshotView,
  Model,
  Outcome,
  OutcomeEvent,
  PreflightReport,
  ReplayFile,
  RumorCard,
  RumorEvent,
  RunMode,
  RunParams,
  RunPhase,
  RunState,
  SealRecord,
  SealResult,
  TickPayload,
  TickResult,
  TickSealedEvent,
  UiError,
} from '@/types';

type ChainStatus = 'ready' | 'running' | 'failed' | 'survived';

// PRD §12.4: below 15 MON warn, below 10.5 MON refuse (Monad's 10 MON reserve throttles the account).
const MON = 10n ** 18n;
const LOW_BALANCE_WARN = 15n * MON;
const LOW_BALANCE_REFUSE = (21n * MON) / 2n;

interface Session {
  mode: RunMode;
  replayId: string | null;
  dispose(): void;
}

// `import.meta.env` is undefined when the controller runs under tsx (scripts/live-e2e.ts), so read it defensively.
const viteEnv = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env;
const log = (...a: unknown[]) => {
  if (viteEnv?.DEV) console.debug('[run]', ...a);
};

// ── Module-level singleton state ────────────────────────────────────────
let model: Model | null = null;
let session: Session | null = null;

// Per-session chain objects (practice/live).
let adapter: ChainAdapter | null = null;
let queue: SealQueue | null = null;
let recorder: Recorder = createRecorder();
let lastReplay: ReplayFile | null = null;
let unsubQueue: (() => void)[] = [];

// Per-run state.
let run: RunState | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickResults = new Map<number, TickResult>();
let rumorResult: SealResult | null = null;
let chainStatus: ChainStatus = 'ready';
let chainLevel: BankLevel = 0;
let pausedFrom: RunPhase | null = null;
let busy = false; // start/reset/switch in flight: second calls are ignored (StrictMode, key repeat)
let runToken = 0; // bumped on every new run/reset so stale async results are ignored

// Live mode (F-06). The adapter outlives sessions (practice ↔ live ↔ replay); the keys live only inside it.
let liveAdapter: ChainAdapter | null = null;
let chainTicks: TickPayload[] = []; // request lists exactly as sealed onchain (feeds the decision check)
let snapshotBusy = false;
let snapshotDirty = false; // a read was requested while one was in flight: re-read when it lands (the in-flight one may predate the tx)

const view = () => runStore.getState();

// ── Decision check (F-09) ───────────────────────────────────────────────
// Re-runs the public depositor model from the chain's recorded request lists and counts agreeing decisions.
// Deferred so it never delays the stamp.
function scheduleDecisionCheck(m: Model, params: RunParams, ticks: TickPayload[], token: number): void {
  if (ticks.length === 0) return;
  const copy = ticks.map((t) => ({ tick: t.tick, requested: [...t.requested] }));
  setTimeout(() => {
    if (token !== runToken) return;
    try {
      const r = verifyDecisions(m, params, copy);
      if (token === runToken) patchRun({ decisions: { matched: r.matched, total: r.total } });
      log('decision check', r);
    } catch {
      // verification is informational; a failure here must never break the stage
    }
  }, 0);
}

// Seals arrive as "sealed, finalizing…"; flip them to finalized once the chain's finalized height passes their block
// (Monad finality is ~800 ms after the block). Only touches the store when something actually changes.
function markFinalized(finalized: bigint): void {
  const seals = view().seals;
  if (!seals.some((r) => !r.finalized && r.blockNumber !== null && r.blockNumber <= finalized)) return;
  patchRun({
    seals: seals.map((r) => (!r.finalized && r.blockNumber !== null && r.blockNumber <= finalized ? { ...r, finalized: true } : r)),
  });
}

// ── Chain snapshot and balances (live) ──────────────────────────────────
async function refreshSnapshot(): Promise<BankSnapshotView | null> {
  const a = adapter;
  if (!a || a.kind !== 'live') return null;
  if (snapshotBusy) {
    snapshotDirty = true;
    return null;
  }
  snapshotBusy = true;
  try {
    const snap = await a.readSnapshot();
    if (adapter === a) patchRun({ onchain: snap });
    return snap;
  } catch {
    return null; // the seal path surfaces real errors; a missed read is harmless
  } finally {
    snapshotBusy = false;
    if (snapshotDirty) {
      snapshotDirty = false;
      void refreshSnapshot();
    }
  }
}

async function refreshBalances(): Promise<void> {
  const a = liveAdapter;
  if (!a) return;
  try {
    const b = await a.balances();
    patchRun((v) => ({
      operator: { ...v.operator, balanceWei: v.operator.usingBackup && b.backup !== null ? b.backup : b.primary },
    }));
  } catch {
    // leave the last known balance
  }
}

function activeBalance(b: { primary: bigint; backup: bigint | null }): bigint {
  return view().operator.usingBackup && b.backup !== null ? b.backup : b.primary;
}

function requireModel(): Model {
  if (!model) model = loadModel();
  return model;
}

// ── Mirror check ────────────────────────────────────────────────────────
function sameTick(e: TickSealedEvent, r: TickResult): boolean {
  return (
    e.served === r.served.length &&
    e.skipped === r.skipped &&
    e.haircutBps === r.haircutBps &&
    e.queueLengthAfter === r.queueLengthAfter &&
    e.paid === r.paid &&
    e.bondsSold === r.bondsSold &&
    e.fireSaleLoss === r.fireSaleLoss &&
    e.cashAfter === r.cashAfter &&
    e.bondsAfter === r.bondsAfter &&
    e.depositsOwedAfter === r.depositsOwedAfter
  );
}

function stopTicking(): void {
  if (tickTimer !== null) clearInterval(tickTimer);
  tickTimer = null;
}

function stopChainObjects(): void {
  stopTicking();
  unsubQueue.forEach((u) => u());
  unsubQueue = [];
  queue?.stop();
  queue = null;
}

// ── The run loop ────────────────────────────────────────────────────────
function tickOnce(): void {
  const v = view();
  if (!run || !queue || !model || v.phase !== 'running') return;
  if (run.frame.tick - queue.sealedTick >= MAX_LEAD) {
    // Engine is too far ahead of the chain: hold and say so (PRD §7.2 step 3).
    if (v.health !== 'delayed') patchRun({ health: 'delayed' });
    return;
  }
  const step = stepRun(model, run);
  run = step.run;
  tickResults.set(step.result.tick, step.result);
  log('tick', step.result.tick, 'requested', step.payload.requested.length);
  queue.push(step.payload);
  patchRun({ frame: run.frame, elapsedMs: v.startedAtMs ? Date.now() - v.startedAtMs : 0 });
  if (step.result.statusAfter === 'failed' || step.result.statusAfter === 'survived') {
    // Engine predicts the verdict. Freeze and wait for the chain's event before the stamp.
    stopTicking();
    patchRun({ phase: step.result.statusAfter === 'failed' ? 'failing' : 'surviving' });
  }
}

function onSealed(res: SealResult, token: number): void {
  if (token !== runToken) return;
  if (res.record.kind === 'ticks') {
    let matched = 0;
    let firstMismatch: number | null = null;
    for (const e of res.ticks) {
      const mine = tickResults.get(e.tick);
      if (mine && sameTick(e, mine)) matched += 1;
      else if (firstMismatch === null) firstMismatch = e.tick;
    }
    const allMatch = firstMismatch === null;
    const record: SealRecord = { ...res.record, mirrorMatch: allMatch };
    recorder.add({ ...res, record });
    for (const e of res.ticks) {
      if (chainTicks.length === 0 || e.tick > chainTicks[chainTicks.length - 1].tick) {
        chainTicks.push({ tick: e.tick, requested: e.requested });
      }
    }
    void refreshSnapshot();
    patchRun((v) => ({
      seals: [...v.seals, record],
      sealedTick: queue?.sealedTick ?? v.sealedTick,
      mirror: {
        matched: v.mirror.matched + matched,
        total: v.mirror.total + res.ticks.length,
        firstMismatchTick: v.mirror.firstMismatchTick ?? firstMismatch,
      },
      blockNumber: record.blockNumber ?? v.blockNumber,
      finalizedBlock: record.finalized && record.blockNumber ? record.blockNumber : v.finalizedBlock,
    }));
    if (!allMatch) {
      stopTicking();
      queue?.stop();
      patchRun({
        phase: 'paused',
        health: 'paused',
        error: {
          code: 'mirror-mismatch',
          title: 'Screen and chain disagree',
          detail: `Screen and chain disagree on tick ${firstMismatch}. Press Reset to start clean.`,
          action: { label: 'Reset', run: 'reset' },
        },
      });
      return;
    }
  }
  if (res.outcome) finalizeOutcome(res, token);
}

function finalizeOutcome(res: SealResult, token: number): void {
  if (token !== runToken || !res.outcome || !run) return;
  const o = res.outcome;
  stopTicking();
  const predicted = run.frame.bank.status;
  const rumorRec = rumorResult?.record ?? null;
  const rumorBlock = rumorRec?.blockNumber ?? null;
  const wallMs = rumorRec?.sealedAtMs && res.record.sealedAtMs ? res.record.sealedAtMs - rumorRec.sealedAtMs : null;
  const bank = run.frame.bank;
  const outcome: Outcome = {
    kind: o.kind,
    tick: o.tick,
    wallMs,
    blocks: rumorBlock !== null ? Math.max(1, Number(o.blockNumber - rumorBlock)) : null,
    rumorBlock,
    outcomeBlock: o.blockNumber,
    trappedCount: o.trappedCount,
    trappedAmount: o.trappedAmount,
    uninsuredTrapped: o.uninsuredTrapped,
    withdrawnAmount: bank.deposits0 - bank.depositsOwed,
    sealed: adapter?.kind === 'live',
  };
  lastReplay = recorder.finish(o) ?? lastReplay;
  chainStatus = o.kind;
  scheduleDecisionCheck(requireModel(), run.params, chainTicks, token);
  void refreshSnapshot();
  patchRun({
    phase: o.kind,
    outcome,
    health: 'idle',
    elapsedMs: wallMs ?? view().elapsedMs,
    sealedTick: Math.max(view().sealedTick, o.tick),
    ...(predicted !== o.kind
      ? {
          error: {
            code: 'mirror-mismatch',
            title: 'Screen and chain disagree',
            detail: `The screen expected the bank to ${predicted === 'failed' ? 'fail' : 'survive'} but Monad says it ${o.kind === 'failed' ? 'failed' : 'survived'}.`,
            action: null,
          } satisfies UiError,
        }
      : {}),
  });
  log('outcome', o.kind, 'tick', o.tick, 'wallMs', wallMs);
}

function onQueueError(err: UiError, token: number): void {
  if (token !== runToken) return;
  const phase = view().phase;
  if (phase === 'running' || phase === 'failing' || phase === 'surviving') pausedFrom = phase;
  stopTicking();
  patchRun({ phase: 'paused', health: 'paused', error: err });
}

function newQueue(token: number): SealQueue {
  if (!adapter) throw new Error('no adapter');
  const q = createSealQueue(adapter);
  unsubQueue = [
    q.onSealed((r) => onSealed(r, token)),
    q.onHealth((h) => {
      if (token === runToken) patchRun({ health: h });
    }),
    q.onError((e) => onQueueError(e, token)),
  ];
  return q;
}

// ── Sessions ────────────────────────────────────────────────────────────
function clearRunView(keep?: Partial<ReturnType<typeof initialRunView>>): void {
  const v = view();
  const base = initialRunView();
  patchRun({
    phase: 'idle',
    frame: null,
    sealedTick: 0,
    seals: [],
    health: 'idle',
    startedAtMs: null,
    elapsedMs: 0,
    outcome: null,
    onchain: null,
    pending: base.pending,
    error: null,
    mirror: base.mirror,
    decisions: null,
    replay: null,
    seedNode: null,
    level: v.level,
    card: v.card,
    ...keep,
  });
}

function resetRunState(): void {
  runToken += 1;
  run = null;
  tickResults = new Map();
  rumorResult = null;
  pausedFrom = null;
  busy = false;
  chainTicks = [];
  recorder = createRecorder();
}

function startPracticeSession(): Session {
  const m = requireModel();
  adapter = createMockAdapter(m);
  chainLevel = 0;
  chainStatus = 'ready';
  const stopBlocks = adapter.watchBlocks((b) => patchRun({ blockNumber: b.number, finalizedBlock: b.finalized }));
  return {
    mode: 'practice',
    replayId: null,
    dispose() {
      stopBlocks();
      stopFakeRun();
      stopChainObjects();
      resetRunState();
      adapter = null;
    },
  };
}


// ── Replay (F-07) ───────────────────────────────────────────────────────
// Plays a recorded real run at its recorded pace. The engine re-derives every frame from the recorded
// per-tick request lists; seals and the outcome appear at their recorded times and keep their real tx hashes.
async function newestReplayId(): Promise<string | null> {
  let index: Awaited<ReturnType<typeof listReplays>> = [];
  try {
    index = await listReplays();
  } catch {
    index = [];
  }
  if (!Array.isArray(index) || index.length === 0) return null;
  return [...index].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0].id;
}

function playReplay(file: ReplayFile, m: Model, onDone: (stop: () => void) => void): () => void {
  const params: RunParams = {
    level: file.params.level,
    card: file.params.card,
    seedNode: file.params.seedNode,
    modelSeed: BigInt(file.params.modelSeed),
  };
  let eng = createRun(m, params);
  const token = runToken;
  const t0 = Date.now();
  const rumorBlock = BigInt(file.rumor.blockNumber);
  const toRecord = (id: number, kind: SealRecord['kind'], over: Partial<SealRecord>): SealRecord => ({
    id, kind, simulated: false, fromTick: null, toTick: null, requestedCount: null, txHash: null, blockNumber: null,
    sentAtMs: t0, sealedAtMs: t0, gasLimit: null, gasUsed: null, status: 'sealed', finalized: true, mirrorMatch: null,
    rpc: 'recorded', ...over,
  });
  const counts = new Map(file.ticks.map((t) => [t.tick, t.requested.length]));
  const lastTick = file.ticks.length ? file.ticks[file.ticks.length - 1].tick : 0;

  type Ev = { at: number; order: number; run(): void };
  const events: Ev[] = [];
  for (const tp of file.ticks) {
    events.push({
      at: tp.tick * TICK_MS, order: 0,
      run() {
        if (eng.frame.bank.status !== 'running') return;
        eng = stepRunWithRequested(m, eng, tp.requested).run;
        const st = eng.frame.bank.status;
        patchRun({
          frame: eng.frame, elapsedMs: Date.now() - t0,
          ...(st === 'failed' ? { phase: 'failing' as const } : st === 'survived' ? { phase: 'surviving' as const } : {}),
        });
      },
    });
  }
  file.seals.forEach((sl, i) => {
    events.push({
      at: Math.max(sl.sealedAtMs, sl.toTick * TICK_MS + 1), order: 1,
      run() {
        let requested = 0;
        for (let t = sl.fromTick; t <= sl.toTick; t++) requested += counts.get(t) ?? 0;
        const rec = toRecord(i + 2, 'ticks', {
          fromTick: sl.fromTick, toTick: sl.toTick, requestedCount: requested, txHash: sl.txHash,
          blockNumber: BigInt(sl.blockNumber), sentAtMs: t0 + sl.sentAtMs, sealedAtMs: t0 + sl.sealedAtMs,
          gasUsed: BigInt(sl.gasUsed),
        });
        const n = sl.toTick - sl.fromTick + 1;
        patchRun((v) => ({
          seals: [...v.seals, rec], sealedTick: sl.toTick, blockNumber: rec.blockNumber, finalizedBlock: rec.blockNumber,
          // Recorded runs carry no per-tick chain summaries, so this counts engine ticks re-derived from recorded
          // chain inputs (the real check is the decision check, F-09). Labelled REPLAY everywhere.
          mirror: { matched: v.mirror.matched + n, total: v.mirror.total + n, firstMismatchTick: null },
        }));
      },
    });
  });
  events.push({
    at: Math.max(file.outcome.atMs, lastTick * TICK_MS + 2), order: 2,
    run() {
      const o = file.outcome;
      const outcomeBlock = BigInt(o.blockNumber);
      const bank = eng.frame.bank;
      const outcome: Outcome = {
        kind: o.kind, tick: o.tick, wallMs: o.atMs, blocks: Math.max(1, Number(outcomeBlock - rumorBlock)),
        rumorBlock, outcomeBlock, trappedCount: o.trappedCount, trappedAmount: BigInt(o.trappedAmount),
        uninsuredTrapped: BigInt(o.uninsuredTrapped), withdrawnAmount: bank.deposits0 - bank.depositsOwed, sealed: true,
      };
      patchRun({ phase: o.kind, outcome, health: 'idle', elapsedMs: o.atMs, blockNumber: outcomeBlock, finalizedBlock: outcomeBlock });
      scheduleDecisionCheck(m, params, file.ticks, token);
      onDone(stop);
    },
  });
  events.sort((a, b) => a.at - b.at || a.order - b.order);

  patchRun({
    mode: 'replay', phase: 'running', level: params.level, card: params.card, frame: eng.frame, startedAtMs: t0, elapsedMs: 0,
    outcome: null, error: null, sealedTick: 0, mirror: { matched: 0, total: 0, firstMismatchTick: null }, health: 'idle',
    seals: [toRecord(1, 'rumor', { txHash: file.rumor.txHash, blockNumber: rumorBlock, sealedAtMs: t0 + (file.rumor.sealedAtMs ?? 0) })],
    blockNumber: rumorBlock, finalizedBlock: rumorBlock,
    replay: { id: file.id, name: file.name, recordedAt: file.recordedAt },
  });
  let next = 0;
  const timer = setInterval(() => {
    const el = Date.now() - t0;
    while (next < events.length && events[next].at <= el) events[next++].run();
  }, 40);
  function stop() { clearInterval(timer); }
  return stop;
}

function startReplaySession(replayId: string | null): Session {
  let disposed = false;
  let stop: (() => void) | null = null;
  const s: Session = {
    mode: 'replay',
    replayId,
    dispose() {
      disposed = true;
      stop?.();
      resetRunState();
    },
  };
  void (async () => {
    patchRun({ phase: 'starting' });
    patchPending({ starting: true });
    try {
      const m = requireModel();
      const id = replayId ?? (await newestReplayId());
      if (!id) throw new Error('No recorded runs are available yet.');
      const file = await loadReplay(id);
      if (disposed) return;
      stop = playReplay(file, m, () => {});
      log('replay playing', file.id);
    } catch (e) {
      if (disposed) return;
      patchRun({
        phase: 'idle',
        error: {
          code: 'replay-unavailable',
          title: 'Recorded run unavailable',
          detail: `Couldn't load a recorded run: ${e instanceof Error ? e.message.slice(0, 120) : 'unknown error'}.`,
          action: null,
        },
      });
    } finally {
      if (!disposed) patchPending({ starting: false });
    }
  })();
  return s;
}

// ── Live (F-06) ─────────────────────────────────────────────────────────
function startLiveSession(): Session {
  const a = liveAdapter;
  if (!a) throw new Error('No operator connected');
  adapter = a;
  chainLevel = 0;
  chainStatus = 'ready';
  const stopBlocks = a.watchBlocks((b) => {
    patchRun({ blockNumber: b.number, finalizedBlock: b.finalized });
    if (b.finalized !== null) markFinalized(b.finalized);
  });
  const snapTimer = setInterval(() => void refreshSnapshot(), 2000);
  const balTimer = setInterval(() => void refreshBalances(), 10_000);
  void refreshSnapshot();
  void refreshBalances();
  return {
    mode: 'live',
    replayId: null,
    dispose() {
      stopBlocks();
      clearInterval(snapTimer);
      clearInterval(balTimer);
      stopFakeRun();
      stopChainObjects();
      resetRunState();
      adapter = null;
    },
  };
}

// ── Spectate (F-08) ─────────────────────────────────────────────────────
// Rebuilds the run from chain events alone: the rumor event gives the params, every TickSealed gives the
// request list, the engine re-derives the frames, and the per-tick summaries are checked against the mirror.
function startSpectateSession(): Session {
  const m = requireModel();
  const token = runToken;
  const sp = createSpectator();
  let eng: RunState | null = null;
  let rumor: RumorEvent | null = null;
  const waiting = new Map<number, TickSealedEvent>();
  const mirrorResults = new Map<number, TickResult>();
  const spectated: TickPayload[] = [];
  let nextRecordId = 2;
  let heardAt = 0;

  const blankRecord = (kind: SealRecord['kind'], over: Partial<SealRecord>): SealRecord => ({
    id: nextRecordId++, kind, simulated: false, fromTick: null, toTick: null, requestedCount: null, txHash: null,
    blockNumber: null, sentAtMs: Date.now(), sealedAtMs: Date.now(), gasLimit: null, gasUsed: null, status: 'sealed',
    finalized: false, mirrorMatch: null, rpc: 'chain', ...over,
  });

  const begin = (e: RumorEvent) => {
    if (rumor && rumor.runId === e.runId) return; // already following this run
    rumor = e;
    waiting.clear();
    mirrorResults.clear();
    spectated.length = 0;
    heardAt = Date.now();
    const params: RunParams = { level: e.level, card: e.card, seedNode: e.seedNode, modelSeed: e.modelSeed };
    eng = createRun(m, params);
    patchRun({
      phase: 'running', level: e.level, card: e.card, frame: eng.frame, outcome: null, error: null, decisions: null,
      startedAtMs: heardAt, elapsedMs: 0, sealedTick: 0, mirror: { matched: 0, total: 0, firstMismatchTick: null },
      seals: [blankRecord('rumor', { txHash: e.txHash, blockNumber: e.blockNumber })],
      blockNumber: e.blockNumber, health: 'idle',
    });
  };

  const applyReady = () => {
    if (!eng || !rumor) return;
    let matched = 0;
    let total = 0;
    let firstMismatch: number | null = null;
    let lastBlock: bigint | null = null;
    const byTx = new Map<Hex, { from: number; to: number; requested: number; block: bigint; ok: boolean }>();
    while (waiting.has(eng.frame.tick + 1) && eng.frame.bank.status === 'running') {
      const ev = waiting.get(eng.frame.tick + 1)!;
      waiting.delete(ev.tick);
      const step = stepRunWithRequested(m, eng, ev.requested);
      eng = step.run;
      mirrorResults.set(ev.tick, step.result);
      spectated.push({ tick: ev.tick, requested: ev.requested });
      const ok = sameTick(ev, step.result);
      total += 1;
      if (ok) matched += 1;
      else if (firstMismatch === null) firstMismatch = ev.tick;
      lastBlock = ev.blockNumber;
      const g = byTx.get(ev.txHash);
      if (g) {
        g.to = ev.tick;
        g.requested += ev.requested.length;
        g.ok &&= ok;
      } else {
        byTx.set(ev.txHash, { from: ev.tick, to: ev.tick, requested: ev.requested.length, block: ev.blockNumber, ok });
      }
    }
    if (total === 0) return;
    const records = [...byTx.entries()].map(([txHash, g]) =>
      blankRecord('ticks', { fromTick: g.from, toTick: g.to, requestedCount: g.requested, txHash, blockNumber: g.block, mirrorMatch: g.ok }),
    );
    const st = eng.frame.bank.status;
    const frame = eng.frame;
    patchRun((v) => ({
      frame,
      seals: [...v.seals, ...records],
      sealedTick: frame.tick,
      elapsedMs: Date.now() - heardAt,
      blockNumber: lastBlock ?? v.blockNumber,
      mirror: {
        matched: v.mirror.matched + matched,
        total: v.mirror.total + total,
        firstMismatchTick: v.mirror.firstMismatchTick ?? firstMismatch,
      },
      ...(st === 'failed' ? { phase: 'failing' as const } : st === 'survived' ? { phase: 'surviving' as const } : {}),
    }));
  };

  const offs = [
    sp.onRumor(begin),
    sp.onTicks((evs) => {
      if (!rumor) return; // joined mid-run without its rumor: wait for the spectator's backfill
      for (const e of evs) if (e.runId === rumor.runId && e.tick > (eng?.frame.tick ?? 0)) waiting.set(e.tick, e);
      applyReady();
    }),
    sp.onOutcome((o: OutcomeEvent) => {
      if (!eng || !rumor || o.runId !== rumor.runId) return;
      applyReady();
      const bank = eng.frame.bank;
      const blocks = Math.max(1, Number(o.blockNumber - rumor.blockNumber));
      const outcome: Outcome = {
        kind: o.kind, tick: o.tick,
        wallMs: blocks * TICK_MS, // estimated from block count (400 ms blocks); spectators don't see the presenter's clock
        blocks, rumorBlock: rumor.blockNumber, outcomeBlock: o.blockNumber,
        trappedCount: o.trappedCount, trappedAmount: o.trappedAmount, uninsuredTrapped: o.uninsuredTrapped,
        withdrawnAmount: bank.deposits0 - bank.depositsOwed, sealed: true,
      };
      patchRun((v) => ({
        phase: o.kind, outcome, health: 'idle', blockNumber: o.blockNumber, sealedTick: Math.max(v.sealedTick, o.tick),
        elapsedMs: blocks * TICK_MS,
      }));
      scheduleDecisionCheck(m, { level: rumor.level, card: rumor.card, seedNode: rumor.seedNode, modelSeed: rumor.modelSeed }, spectated, token);
    }),
    sp.onReset(() => {
      rumor = null;
      eng = null;
      waiting.clear();
      clearRunView();
      patchRun({ mode: 'spectate' });
    }),
    sp.onSnapshot((snap) => {
      patchRun({ onchain: snap, blockNumber: snap.readAtBlock ?? view().blockNumber });
    }),
  ];
  sp.start();
  return {
    mode: 'spectate',
    replayId: null,
    dispose() {
      offs.forEach((off) => off());
      sp.stop();
      resetRunState();
    },
  };
}

function startSession(mode: RunMode, replayId: string | null): Session {
  switch (mode) {
    case 'live':
      return liveAdapter ? startLiveSession() : startPracticeSession();
    case 'replay':
      return startReplaySession(replayId);
    case 'spectate':
      return startSpectateSession();
    default:
      return startPracticeSession();
  }
}

function switchSession(mode: RunMode, replayId: string | null): void {
  session?.dispose();
  session = null;
  clearRunView();
  patchRun({ mode });
  session = startSession(mode, replayId);
  if (session.mode !== mode) patchRun({ mode: session.mode }); // live requested without a connected operator → practice
}

// ── Public controller ───────────────────────────────────────────────────
export const controller = {
  init(): void {
    if (session) return; // idempotent
    patchRun({ model: requireModel() });
    switchSession(view().mode, null);
  },

  selectLevel(level: BankLevel): void {
    const v = view();
    if (v.mode === 'replay' || v.mode === 'spectate') return;
    if (v.phase === 'failed' || v.phase === 'survived' || v.phase === 'paused') {
      void this.reset().then(() => patchRun({ level }));
      return;
    }
    if (v.phase !== 'idle') return; // mid-run, switching, resetting: ignore
    patchRun({ level });
  },

  selectCard(card: RumorCard): void {
    if (view().phase !== 'idle') return;
    patchRun({ card });
  },

  /** P2: pick which depositor starts the rumor. `null` (or an invalid id) goes back to the card's own seed node. */
  selectSeed(node: number | null): void {
    const v = view();
    if (v.phase !== 'idle' || (v.mode !== 'practice' && v.mode !== 'live')) return;
    const n = v.model?.graph.nodes.length ?? 0;
    patchRun({ seedNode: node !== null && Number.isInteger(node) && node >= 0 && node < n ? node : null });
  },

  async start(): Promise<void> {
    const v = view();
    if (v.phase !== 'idle' || busy) return; // idempotent: Enter key repeat, StrictMode, double click
    if (v.mode !== 'practice' && v.mode !== 'live') return;
    if (v.card === null || !adapter || !model) return; // "Pick a rumor to start the run"
    busy = true;
    const token = ++runToken;
    const a = adapter;
    const m = model;
    const level = v.level;
    const params = defaultParams(m, level, v.card, v.seedNode ?? undefined);
    tickResults = new Map();
    chainTicks = [];
    rumorResult = null;
    recorder = createRecorder();
    patchRun({
      error: null, outcome: null, seals: [], sealedTick: 0, decisions: null,
      mirror: { matched: 0, total: 0, firstMismatchTick: null },
    });
    try {
      // Low-balance guard (PRD §12.4): Monad's 10 MON reserve throttles an account below that line.
      if (a.kind === 'live') {
        const bal = activeBalance(await a.balances());
        patchRun((s) => ({ operator: { ...s.operator, balanceWei: bal } }));
        if (token !== runToken) return;
        if (bal < LOW_BALANCE_REFUSE) {
          const backup = view().operator.backupAddress !== null && !view().operator.usingBackup;
          patchRun({
            phase: 'idle',
            error: {
              code: 'low-balance',
              title: 'Operator wallet is low on MON',
              detail: `The operator wallet is low on MON (${(Number(bal / 10n ** 15n) / 1000).toFixed(2)}). ${
                backup ? 'Switch to the backup key.' : 'Top it up above 15 MON before starting a run.'
              }`,
              action: backup ? { label: 'Switch to backup key', run: 'backup' } : null,
            },
          });
          return;
        }
        if (bal < LOW_BALANCE_WARN) log('operator balance below 15 MON', bal);
      }

      // Bring the bank to the state this run needs: Ready, at the right level and config.
      let snap: BankSnapshotView | null = null;
      try {
        snap = await a.readSnapshot();
      } catch {
        snap = null;
      }
      if (token !== runToken) return;
      const status = snap?.status ?? chainStatus;
      if (status !== 'ready') {
        patchRun({ phase: 'resetting' });
        patchPending({ resetting: true });
        try {
          const res = await a.reset();
          if (token !== runToken) return;
          chainStatus = 'ready';
          patchRun((s) => ({ seals: [...s.seals, res.record] }));
          snap = await a.readSnapshot().catch(() => null);
        } finally {
          patchPending({ resetting: false });
        }
      }
      const needsLevel = snap
        ? snap.level !== level || snap.configHash !== hashConfig(m.configs[level])
        : chainLevel !== level;
      if (needsLevel) {
        patchRun({ phase: 'switching' });
        patchPending({ switching: true });
        try {
          const res = await a.setLevel(level, m.configs[level]);
          if (token !== runToken) return;
          chainLevel = level;
          patchRun((s) => ({ seals: [...s.seals, res.record] }));
        } finally {
          patchPending({ switching: false });
        }
      } else {
        chainLevel = level;
      }
      patchRun({ phase: 'starting' });
      patchPending({ starting: true });
      try {
        const res = await a.startRumor(params, m.modelHash);
        if (token !== runToken) return;
        if (!res.rumor) throw new Error('The chain returned no rumor event');
        rumorResult = res;
        chainStatus = 'running';
        run = createRun(m, params);
        queue = newQueue(token);
        recorder.begin(params, res.rumor, m.modelHash);
        const startedAtMs = res.record.sealedAtMs ?? Date.now();
        patchRun((s) => ({
          phase: 'running',
          frame: run!.frame,
          startedAtMs,
          elapsedMs: 0,
          seals: [...s.seals, res.record],
          blockNumber: res.record.blockNumber ?? s.blockNumber,
        }));
        stopTicking();
        tickTimer = setInterval(tickOnce, TICK_MS);
        log('run started', { level, card: v.card });
      } finally {
        patchPending({ starting: false });
      }
    } catch (e) {
      if (token !== runToken) return;
      patchRun({ phase: 'idle', error: translateError(e) });
    } finally {
      if (token === runToken) busy = false;
    }
  },

  async reset(): Promise<void> {
    const v = view();
    if (v.mode === 'replay') {
      // "Reset" in replay mode plays the same recorded run again.
      if (session) switchSession('replay', session.replayId ?? view().replay?.id ?? null);
      return;
    }
    if (v.mode === 'spectate') return;
    if (v.phase === 'resetting') return;
    const token = ++runToken; // invalidate everything in flight
    stopFakeRun();
    stopChainObjects();
    run = null;
    tickResults = new Map();
    chainTicks = [];
    rumorResult = null;
    pausedFrom = null;
    busy = true;
    patchRun({ phase: 'resetting', error: null });
    patchPending({ resetting: true });
    try {
      let needsChainReset = chainStatus !== 'ready';
      if (adapter?.kind === 'live') {
        // Ask the chain, not our memory: the bank may be Failed from an earlier session or stuck mid-run.
        try {
          needsChainReset = (await adapter.readSnapshot()).status !== 'ready';
        } catch {
          needsChainReset = true;
        }
      }
      if (adapter && needsChainReset) {
        const res = await adapter.reset();
        if (token === runToken) patchRun((s) => ({ seals: [...s.seals, res.record] }));
      }
      chainStatus = 'ready';
      recorder = createRecorder();
      if (token === runToken) {
        clearRunView({ seals: [] });
        patchRun({ phase: 'idle' });
      }
      void refreshSnapshot();
    } catch (e) {
      patchRun({ phase: 'paused', error: translateError(e) });
    } finally {
      patchPending({ resetting: false });
      if (token === runToken) busy = false;
    }
  },

  retry(): void {
    const v = view();
    if (v.phase !== 'paused' || !queue) return;
    patchRun({ error: null, phase: pausedFrom ?? 'running' });
    queue.retry();
    if ((pausedFrom ?? 'running') === 'running' && tickTimer === null) tickTimer = setInterval(tickOnce, TICK_MS);
    pausedFrom = null;
  },

  dismissError(): void {
    patchRun({ error: null });
  },

  setMode(mode: RunMode, opts?: { replayId?: string; auto?: boolean }): void {
    const replayId = opts?.replayId ?? null;
    const effective: RunMode = mode === 'live' && !liveAdapter ? 'practice' : mode;
    if (session && session.mode === effective && session.replayId === replayId) return; // idempotent (StrictMode)
    if (opts?.auto) {
      // Route-driven switch (e.g. preflight turned green): never tear down a run in progress.
      const p = view().phase;
      if (session && (session.mode === 'practice' || session.mode === 'live') && p !== 'idle' && p !== 'failed' && p !== 'survived') return;
    }
    switchSession(effective, replayId);
  },

  // ── Live mode (F-06) ──
  /** Called once at startup: if keys are loaded (session or local env) and the bank is deployed, connect and preflight. */
  async autoConnect(): Promise<void> {
    if (liveAdapter || !deployment.runBank) return;
    const keys = loadOperatorKeys();
    if (!keys.primary) return;
    await connectWith({ primary: keys.primary, backup: keys.backup, rpcOverride: envRpc() });
  },

  async connectOperator(keys: { primary: Hex; backup?: Hex | null; rpcOverride?: string | null }): Promise<void> {
    try {
      addressOfKey(keys.primary); // validates; throws without echoing the key
      if (keys.backup) addressOfKey(keys.backup);
    } catch (e) {
      patchRun({ preflight: failedReport('keys', 'Operator key', e), error: translateError(e) });
      return;
    }
    try {
      saveOperatorKeys({ primary: keys.primary, backup: keys.backup ?? null });
    } catch {
      // sessionStorage unavailable (private mode / tests): the key still works for this page load
    }
    await connectWith({ primary: keys.primary, backup: keys.backup ?? null, rpcOverride: keys.rpcOverride ?? envRpc() });
  },

  disconnectOperator(): void {
    if (session?.mode === 'live') switchSession('practice', null);
    liveAdapter = null;
    clearOperatorKeys();
    patchRun({
      preflight: null,
      operator: { address: null, balanceWei: null, backupAddress: null, usingBackup: false },
    });
  },

  switchToBackupKey(): void {
    if (!liveAdapter || !liveAdapter.switchToBackup()) return;
    patchRun((v) => ({
      operator: { ...v.operator, usingBackup: true, address: liveAdapter?.operator ?? v.operator.address },
      error: null,
    }));
    void refreshBalances();
    if (view().phase === 'paused') controller.retry();
  },

  async runPreflight(): Promise<PreflightReport> {
    if (!liveAdapter) {
      const report = failedReport('operator', 'Operator key loaded', new Error('Load the operator key on the Ops page.'));
      patchRun({ preflight: report });
      return report;
    }
    patchPending({ preflight: true });
    try {
      const report = await liveAdapter.preflight(requireModel());
      patchRun({ preflight: report });
      return report;
    } catch (e) {
      const report = failedReport('preflight', 'Preflight', e);
      patchRun({ preflight: report });
      return report;
    } finally {
      patchPending({ preflight: false });
    }
  },

  /** Tops the bank up to its starting balance sheet (cash0 + bonds0) from the operator's AUSD. */
  async fundBank(): Promise<void> {
    const a = liveAdapter;
    const m = requireModel();
    if (!a || view().pending.funding) return;
    patchPending({ funding: true });
    try {
      const need = m.configs[view().level].cash0 + m.configs[view().level].bonds0;
      const snap = await a.readSnapshot();
      const missing = need > snap.ausdHeld ? need - snap.ausdHeld : 0n;
      if (missing > 0n) await a.fundBank(missing);
      patchRun({ error: null });
      await refreshSnapshotFrom(a);
    } catch (e) {
      patchRun({ error: translateError(e) });
    } finally {
      patchPending({ funding: false });
    }
  },

  async ping(): Promise<void> {
    const a = liveAdapter;
    if (!a || view().pending.pinging) return;
    patchPending({ pinging: true });
    try {
      const res = await a.ping();
      patchRun((v) => ({ blockNumber: res.record.blockNumber ?? v.blockNumber, error: null }));
    } catch (e) {
      patchRun({ error: translateError(e) });
    } finally {
      patchPending({ pinging: false });
    }
  },

  saveReplay(): ReplayFile | null {
    return lastReplay ?? recorder.current();
  },
};

// ── Live helpers (need `controller`, so they live below it) ─────────────
function envRpc(): string | null {
  const v = viteEnv?.VITE_RPC_URL ?? (typeof process !== 'undefined' ? process.env?.VITE_RPC_URL : undefined);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function failedReport(id: string, label: string, e: unknown): PreflightReport {
  const detail = e instanceof Error ? e.message.replace(/0x[0-9a-fA-F]{64}/g, '0x…').slice(0, 160) : 'failed';
  return { ok: false, at: Date.now(), checks: [{ id, label, status: 'fail', detail, critical: true }] };
}

async function refreshSnapshotFrom(a: ChainAdapter): Promise<void> {
  try {
    patchRun({ onchain: await a.readSnapshot() });
  } catch {
    // the next poll will catch up
  }
}

async function connectWith(keys: { primary: Hex; backup: Hex | null; rpcOverride: string | null }): Promise<void> {
  if (session?.mode === 'live') switchSession('practice', null); // drop the old live session before swapping adapters
  liveAdapter = null;
  try {
    liveAdapter = createLiveAdapter({ primaryPk: keys.primary, backupPk: keys.backup, rpcOverride: keys.rpcOverride });
  } catch (e) {
    patchRun({ preflight: failedReport('adapter', 'Chain connection', e) });
    return;
  }
  const a = liveAdapter;
  let primaryAddr: RunViewAddress = null;
  let backupAddr: RunViewAddress = null;
  try {
    primaryAddr = addressOfKey(keys.primary);
    if (keys.backup) backupAddr = addressOfKey(keys.backup);
  } catch {
    // invalid key material: addresses stay null (never echo the key)
  }
  patchRun({ operator: { address: a.operator ?? primaryAddr, balanceWei: null, backupAddress: backupAddr, usingBackup: false } });
  await refreshBalances();
  await controller.runPreflight();
}

type RunViewAddress = ReturnType<typeof addressOfKey> | null;
