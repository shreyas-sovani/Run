// RunController (PRD §7.2). MODULE SINGLETON: no React state, idempotent init/start/setMode, one tick
// interval and one block watcher per session, so React StrictMode's double effects can never start two runners.
//
// Practice runs the full loop against the mock adapter. Live (F-06), Replay (F-07) and Spectate (F-08)
// plug into the same session shape: `dispose()` tears everything down before another mode starts.
import type { Hex } from 'viem';
import {
  createMockAdapter,
  createRecorder,
  createSealQueue,
  translateError,
} from '@/chain';
import type { ChainAdapter, Recorder, SealQueue } from '@/chain';
import { MAX_LEAD, TICK_MS, createRun, defaultParams, loadModel, stepRun } from '@/engine';
import { initialRunView, patchPending, patchRun, runStore } from '@/app/state';
import { stopFakeRun } from '@/app/fixtures/fakeRun';
import type {
  BankLevel,
  Model,
  Outcome,
  PreflightReport,
  ReplayFile,
  RumorCard,
  RunMode,
  RunPhase,
  RunState,
  SealRecord,
  SealResult,
  TickResult,
  TickSealedEvent,
  UiError,
} from '@/types';

type ChainStatus = 'ready' | 'running' | 'failed' | 'survived';

interface Session {
  mode: RunMode;
  replayId: string | null;
  dispose(): void;
}

const log = (...a: unknown[]) => {
  if (import.meta.env.DEV) console.debug('[run]', ...a);
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

const view = () => runStore.getState();

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

function startPlaceholderSession(mode: RunMode, replayId: string | null): Session {
  // Replay (F-07) and Spectate (F-08) land here; for now they only label the stage.
  return { mode, replayId, dispose() { resetRunState(); } };
}

function switchSession(mode: RunMode, replayId: string | null): void {
  session?.dispose();
  session = null;
  clearRunView();
  patchRun({ mode });
  session = mode === 'practice' ? startPracticeSession() : startPlaceholderSession(mode, replayId);
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
    const params = defaultParams(m, level, v.card);
    tickResults = new Map();
    rumorResult = null;
    recorder = createRecorder();
    patchRun({ error: null, outcome: null, seals: [], sealedTick: 0, mirror: { matched: 0, total: 0, firstMismatchTick: null } });
    try {
      if (chainLevel !== level) {
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
      const err = translateError(e);
      patchRun({ phase: 'idle', error: err });
    } finally {
      if (token === runToken) busy = false;
    }
  },

  async reset(): Promise<void> {
    const v = view();
    if (v.mode === 'replay' || v.mode === 'spectate') return;
    if (v.phase === 'resetting') return;
    const needsChainReset = chainStatus !== 'ready';
    const token = ++runToken; // invalidate everything in flight
    stopFakeRun();
    stopChainObjects();
    run = null;
    tickResults = new Map();
    rumorResult = null;
    pausedFrom = null;
    busy = true;
    patchRun({ phase: 'resetting', error: null });
    patchPending({ resetting: true });
    try {
      if (adapter && needsChainReset) await adapter.reset();
      chainStatus = 'ready';
      recorder = createRecorder();
      clearRunView();
      if (token === runToken) patchRun({ phase: 'idle' });
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

  setMode(mode: RunMode, opts?: { replayId?: string }): void {
    const replayId = opts?.replayId ?? null;
    if (session && session.mode === mode && session.replayId === replayId) return; // idempotent (StrictMode)
    switchSession(mode, replayId);
  },

  // ── Live mode lands in F-06 ──
  async connectOperator(_keys: { primary: Hex; backup?: Hex | null; rpcOverride?: string | null }): Promise<void> {},
  disconnectOperator(): void {},
  switchToBackupKey(): void {},
  async runPreflight(): Promise<PreflightReport> {
    return { checks: [], ok: false, at: Date.now() };
  },
  async fundBank(): Promise<void> {},
  async ping(): Promise<void> {},

  saveReplay(): ReplayFile | null {
    return lastReplay ?? recorder.current();
  },
};
