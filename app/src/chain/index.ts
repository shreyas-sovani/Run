// Placeholder from F-00. Owner: C. Replace freely.
// Frozen barrel (PRD §16.3). Working mock adapter, naive sequential SealQueue, stub spectator.
import { keccak256, toHex } from 'viem';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { applyTick, hashConfig, initialBank } from '@/engine';
import deploymentJson from '@/config/deployment.testnet.json';
import { NETWORK, explorerAddress, explorerTx } from '@/config/network';
import type {
  BankConfig,
  BankLevel,
  BankSnapshotView,
  Model,
  OutcomeEvent,
  PreflightReport,
  ReplayFile,
  ReplayIndexEntry,
  RumorEvent,
  RunParams,
  SealHealth,
  SealRecord,
  SealResult,
  TickPayload,
  TickSealedEvent,
  TxKind,
  UiError,
} from '@/types';

export { NETWORK, explorerAddress, explorerTx };

// ── Deployment ──────────────────────────────────────────────────────────
const dj = deploymentJson as {
  runBank: Address | null;
  street: Address | null;
  ausd: Address;
  deployBlock: number | string | null;
  tokenKind: 'AUSD' | 'MOCK';
};
export const deployment: {
  runBank: Address | null;
  street: Address | null;
  ausd: Address;
  deployBlock: bigint | null;
  tokenKind: 'AUSD' | 'MOCK';
} = {
  runBank: dj.runBank,
  street: dj.street,
  ausd: dj.ausd,
  deployBlock: dj.deployBlock === null ? null : BigInt(dj.deployBlock),
  tokenKind: dj.tokenKind,
};

// ── Errors ──────────────────────────────────────────────────────────────
export function translateError(e: unknown): UiError {
  const raw = e instanceof Error ? e.message : String(e);
  const short = raw.replace(/0x[0-9a-fA-F]{64}/g, '0x…').slice(0, 160);
  return {
    code: 'unknown',
    title: 'Sealing failed',
    detail: `Sealing failed: ${short}. Press Retry, or Shift+R for the recorded run.`,
    action: { label: 'Retry', run: 'retry' },
  };
}

// ── Operator keys (sessionStorage only; never log) ──────────────────────
const PK_PRIMARY = 'run.operatorPk';
const PK_BACKUP = 'run.backupPk';

function normalizePk(s: string | null | undefined): Hex | null {
  if (!s) return null;
  const t = s.trim();
  const h = t.startsWith('0x') ? t : `0x${t}`;
  return /^0x[0-9a-fA-F]{64}$/.test(h) ? (h as Hex) : null;
}

export function loadOperatorKeys(): { primary: Hex | null; backup: Hex | null; source: 'session' | 'env' | null } {
  const ss = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  const sp = normalizePk(ss?.getItem(PK_PRIMARY));
  if (sp) return { primary: sp, backup: normalizePk(ss?.getItem(PK_BACKUP)), source: 'session' };
  const ep = normalizePk(import.meta.env.VITE_OPERATOR_PK);
  if (ep) return { primary: ep, backup: normalizePk(import.meta.env.VITE_BACKUP_PK), source: 'env' };
  return { primary: null, backup: null, source: null };
}

export function saveOperatorKeys(keys: { primary: Hex; backup?: Hex | null }): void {
  sessionStorage.setItem(PK_PRIMARY, keys.primary);
  if (keys.backup) sessionStorage.setItem(PK_BACKUP, keys.backup);
  else sessionStorage.removeItem(PK_BACKUP);
}

export function clearOperatorKeys(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PK_PRIMARY);
  sessionStorage.removeItem(PK_BACKUP);
}

export function addressOfKey(pk: Hex): Address {
  return privateKeyToAccount(pk).address;
}

// ── Adapters ────────────────────────────────────────────────────────────
export interface ChainAdapter {
  readonly kind: 'live' | 'mock';
  readonly operator: Address | null;
  preflight(model: Model): Promise<PreflightReport>;
  readSnapshot(): Promise<BankSnapshotView>;
  setLevel(level: BankLevel, cfg: BankConfig): Promise<SealResult>;
  startRumor(params: RunParams, modelHash: Hex): Promise<SealResult>;
  sealTicks(firstTick: number, ticks: number[][]): Promise<SealResult>;
  reset(): Promise<SealResult>;
  ping(): Promise<SealResult>;
  fundBank(amount: bigint): Promise<SealResult>;
  balances(): Promise<{ primary: bigint; backup: bigint | null }>;
  switchToBackup(): boolean;
  watchBlocks(cb: (b: { number: bigint; finalized: bigint | null }) => void): () => void;
}

export function createLiveAdapter(_opts: { primaryPk: Hex; backupPk?: Hex | null; rpcOverride?: string | null }): ChainAdapter {
  throw new Error('Live adapter is not implemented yet (C-03). Use practice mode.');
}

export function createMockAdapter(model: Model, opts?: { latencyMs?: [number, number] }): ChainAdapter {
  const [lo, hi] = opts?.latencyMs ?? [300, 900];
  const t0 = Date.now();
  const blockNow = () => 21_000_000n + BigInt(Math.floor((Date.now() - t0) / 400));
  const delay = () => new Promise<void>((r) => setTimeout(r, lo + Math.random() * (hi - lo)));
  let level: BankLevel = 0;
  let bank = initialBank(model, 0);
  let runId = 0;
  let startBlock = 0n;
  let nextId = 1;
  const fakeHash = (): Hex => keccak256(toHex(`mock-tx-${nextId}-${Date.now()}`));
  const total = model.configs[0].cash0 + model.configs[0].bonds0;

  const open = (kind: TxKind, extra: Partial<SealRecord> = {}): SealRecord => ({
    id: nextId++, kind, simulated: true, fromTick: null, toTick: null, requestedCount: null,
    txHash: fakeHash(), blockNumber: null, sentAtMs: Date.now(), sealedAtMs: null,
    gasLimit: null, gasUsed: null, status: 'pending', finalized: false, mirrorMatch: null, rpc: 'mock', ...extra,
  });
  const close = (r: SealRecord): SealRecord => ({
    ...r, status: 'sealed', sealedAtMs: Date.now(), blockNumber: blockNow(), finalized: true, gasUsed: 100_000n,
  });
  const plain = async (kind: TxKind): Promise<SealResult> => {
    const r = open(kind);
    await delay();
    return { record: close(r), rumor: null, ticks: [], outcome: null };
  };
  const snapshot = (): BankSnapshotView => ({
    status: bank.status, level, runId, tick: bank.tick,
    cash: bank.cash, bonds: bank.bonds, depositsOwed: bank.depositsOwed, insuredOwed: bank.insuredOwed, deposits0: bank.deposits0,
    cumulativeLoss: bank.cumulativeLoss, lastHaircutBps: bank.lastHaircutBps, queueLength: bank.queue.length,
    quietCount: bank.quietCount, withdrawnCount: bank.withdrawnCount, startBlock,
    ausdHeld: bank.cash + bank.bonds, streetHeld: total - (bank.cash + bank.bonds),
    ledgerHash: model.ledger.ledgerHash, configHash: hashConfig(model.configs[level]), readAtBlock: blockNow(),
  });

  return {
    kind: 'mock',
    operator: null,
    async preflight(): Promise<PreflightReport> {
      return {
        ok: true, at: Date.now(),
        checks: [
          { id: 'mock', label: 'Mock adapter', status: 'pass', detail: 'Simulated in the browser', critical: false },
        ],
      };
    },
    async readSnapshot() { return snapshot(); },
    async setLevel(l) {
      const r = open('setLevel');
      await delay();
      if (bank.status !== 'ready') throw new Error(`WrongStatus: bank is ${bank.status}`);
      level = l;
      bank = initialBank(model, l);
      return { record: close(r), rumor: null, ticks: [], outcome: null };
    },
    async startRumor(params, modelHash) {
      const r = open('rumor');
      await delay();
      if (bank.status !== 'ready') throw new Error(`WrongStatus: bank is ${bank.status}`);
      bank = { ...bank, status: 'running' };
      runId += 1;
      startBlock = blockNow();
      const done = close(r);
      const rumor: RumorEvent = {
        runId, level: params.level, card: params.card, seedNode: params.seedNode, modelSeed: params.modelSeed,
        modelHash, startBlock, txHash: done.txHash!, blockNumber: done.blockNumber!,
      };
      return { record: done, rumor, ticks: [], outcome: null };
    },
    async sealTicks(firstTick, ticks) {
      const r = open('ticks', { fromTick: firstTick, toTick: firstTick + ticks.length - 1, requestedCount: ticks.reduce((n, t) => n + t.length, 0) });
      await delay();
      if (firstTick !== bank.tick + 1) throw new Error(`TickMismatch: expected ${bank.tick + 1}, got ${firstTick}`);
      const done = close(r);
      const events: TickSealedEvent[] = [];
      let outcome: OutcomeEvent | null = null;
      for (const ids of ticks) {
        if (bank.status !== 'running') break;
        const step = applyTick(bank, model.configs[level], model.ledger, ids);
        bank = step.bank;
        const x = step.result;
        events.push({
          runId, tick: x.tick, requested: ids, served: x.served.length, skipped: x.skipped, haircutBps: x.haircutBps,
          queueLengthAfter: x.queueLengthAfter, paid: x.paid, bondsSold: x.bondsSold, fireSaleLoss: x.fireSaleLoss,
          cashAfter: x.cashAfter, bondsAfter: x.bondsAfter, depositsOwedAfter: x.depositsOwedAfter,
          txHash: done.txHash!, blockNumber: done.blockNumber!, logIndex: events.length,
        });
        if (x.statusAfter === 'failed' || x.statusAfter === 'survived') {
          outcome = {
            kind: x.statusAfter, runId, tick: x.tick,
            trappedCount: x.trapped?.count ?? 0, trappedAmount: x.trapped?.amount ?? 0n, uninsuredTrapped: x.trapped?.uninsured ?? 0n,
            txHash: done.txHash!, blockNumber: done.blockNumber!,
          };
        }
      }
      return { record: { ...done, toTick: events.length ? events[events.length - 1].tick : done.fromTick }, rumor: null, ticks: events, outcome };
    },
    async reset() {
      const r = open('reset');
      await delay();
      bank = initialBank(model, level);
      return { record: close(r), rumor: null, ticks: [], outcome: null };
    },
    ping: () => plain('ping'),
    fundBank: () => plain('fund'),
    async balances() { return { primary: 40n * 10n ** 18n, backup: 25n * 10n ** 18n }; },
    switchToBackup() { return false; },
    watchBlocks(cb) {
      const id = setInterval(() => cb({ number: blockNow(), finalized: blockNow() - 2n }), 400);
      return () => clearInterval(id);
    },
  };
}

// ── SealQueue (naive sequential) ────────────────────────────────────────
export interface SealQueue {
  push(p: TickPayload): void;
  readonly sealedTick: number;
  readonly pending: number;
  readonly health: SealHealth;
  onSealed(cb: (r: SealResult) => void): () => void;
  onHealth(cb: (h: SealHealth) => void): () => void;
  onError(cb: (e: UiError) => void): () => void;
  drain(): Promise<void>;
  retry(): void;
  stop(): void;
}

export function createSealQueue(adapter: ChainAdapter, opts?: { maxTicksPerTx?: number; delayedAfterMs?: number }): SealQueue {
  const maxTicks = opts?.maxTicksPerTx ?? 8;
  const delayedAfterMs = opts?.delayedAfterMs ?? 2500;
  let queue: { p: TickPayload; at: number }[] = [];
  let inflight = false;
  let sealedTick = 0;
  let health: SealHealth = 'idle';
  let stopped = false;
  let paused = false;
  const sealed = new Set<(r: SealResult) => void>();
  const healthCbs = new Set<(h: SealHealth) => void>();
  const errors = new Set<(e: UiError) => void>();
  const setHealth = (h: SealHealth) => {
    if (h === health) return;
    health = h;
    healthCbs.forEach((cb) => cb(h));
  };
  const watchdog = setInterval(() => {
    if (!inflight || paused || stopped || queue.length === 0) return;
    if (Date.now() - queue[0].at > delayedAfterMs) setHealth('delayed');
  }, 500);

  async function pump(): Promise<void> {
    if (inflight || stopped || paused || queue.length === 0) return;
    inflight = true;
    setHealth('sealing');
    const batch = queue.slice(0, maxTicks);
    try {
      const res = await adapter.sealTicks(batch[0].p.tick, batch.map((b) => b.p.requested));
      if (stopped) return;
      if (res.ticks.length) sealedTick = res.ticks[res.ticks.length - 1].tick;
      queue = res.outcome ? [] : queue.slice(batch.length);
      sealed.forEach((cb) => cb(res));
    } catch (e) {
      paused = true;
      setHealth('paused');
      errors.forEach((cb) => cb(translateError(e)));
      return;
    } finally {
      inflight = false;
    }
    setHealth(queue.length ? 'sealing' : 'idle');
    void pump();
  }

  return {
    push(p) { queue.push({ p, at: Date.now() }); void pump(); },
    get sealedTick() { return sealedTick; },
    get pending() { return queue.length; },
    get health() { return health; },
    onSealed(cb) { sealed.add(cb); return () => sealed.delete(cb); },
    onHealth(cb) { healthCbs.add(cb); return () => healthCbs.delete(cb); },
    onError(cb) { errors.add(cb); return () => errors.delete(cb); },
    async drain() {
      while (!stopped && !paused && (queue.length > 0 || inflight)) await new Promise((r) => setTimeout(r, 50));
    },
    retry() { paused = false; setHealth('sealing'); void pump(); },
    stop() { stopped = true; queue = []; clearInterval(watchdog); setHealth('idle'); },
  };
}

// ── Spectator (stub) ────────────────────────────────────────────────────
export interface Spectator {
  start(): void;
  stop(): void;
  onRumor(cb: (e: RumorEvent) => void): () => void;
  onTicks(cb: (e: TickSealedEvent[]) => void): () => void;
  onOutcome(cb: (e: OutcomeEvent) => void): () => void;
  onReset(cb: (runId: number) => void): () => void;
  onSnapshot(cb: (s: BankSnapshotView) => void): () => void;
}

export function createSpectator(_opts?: { pollMs?: number }): Spectator {
  const noop = () => () => {};
  return { start() {}, stop() {}, onRumor: noop, onTicks: noop, onOutcome: noop, onReset: noop, onSnapshot: noop };
}

// ── Recorder ────────────────────────────────────────────────────────────
export interface Recorder {
  begin(params: RunParams, rumor: RumorEvent, modelHash: Hex): void;
  add(r: SealResult): void;
  finish(o: OutcomeEvent): ReplayFile | null;
  current(): ReplayFile | null;
}

export function createRecorder(): Recorder {
  let partial: Omit<ReplayFile, 'outcome'> | null = null;
  let done: ReplayFile | null = null;
  let t0 = 0;
  return {
    begin(params, rumor, modelHash) {
      t0 = Date.now();
      done = null;
      partial = {
        version: 1, id: `run-${rumor.runId}-${t0}`, name: `Run ${rumor.runId}`, recordedAt: new Date(t0).toISOString(),
        chainId: NETWORK.chainId, runBank: deployment.runBank ?? '0x0000000000000000000000000000000000000000', runId: rumor.runId,
        params: { level: params.level, card: params.card, seedNode: params.seedNode, modelSeed: params.modelSeed.toString(), modelHash },
        rumor: { txHash: rumor.txHash, blockNumber: rumor.blockNumber.toString() },
        ticks: [], seals: [],
      };
    },
    add(r) {
      if (!partial || r.record.kind !== 'ticks' || r.record.txHash === null) return;
      for (const t of r.ticks) partial.ticks.push({ tick: t.tick, requested: t.requested });
      partial.seals.push({
        fromTick: r.record.fromTick ?? 0, toTick: r.record.toTick ?? 0, txHash: r.record.txHash,
        blockNumber: (r.record.blockNumber ?? 0n).toString(), sentAtMs: r.record.sentAtMs - t0,
        sealedAtMs: (r.record.sealedAtMs ?? Date.now()) - t0, gasUsed: (r.record.gasUsed ?? 0n).toString(),
      });
    },
    finish(o) {
      if (!partial) return null;
      done = {
        ...partial,
        outcome: {
          kind: o.kind, tick: o.tick, txHash: o.txHash, blockNumber: o.blockNumber.toString(), atMs: Date.now() - t0,
          trappedCount: o.trappedCount, trappedAmount: o.trappedAmount.toString(), uninsuredTrapped: o.uninsuredTrapped.toString(),
        },
      };
      return done;
    },
    current() { return done; },
  };
}

export async function listReplays(): Promise<ReplayIndexEntry[]> {
  const res = await fetch('/replays/index.json');
  if (!res.ok) return [];
  return (await res.json()) as ReplayIndexEntry[];
}

export async function loadReplay(id: string): Promise<ReplayFile> {
  const res = await fetch(`/replays/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error(`Replay ${id} not found`);
  return (await res.json()) as ReplayFile;
}
