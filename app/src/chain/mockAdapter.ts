// Mock adapter (PRD §6, §16.3, C-02). An in-memory bank driven by the engine's `applyTick` mirror, with realistic
// latency and fake block numbers. Every record is `simulated: true` with `txHash: null`; the SealResult shape is
// identical to the live adapter's, so Practice mode exercises the same SealQueue and controller code.
import type { Hex } from 'viem';
import { applyTick, hashConfig, initialBank } from '@/engine';
import type {
  BankLevel,
  BankSnapshotView,
  BankState,
  Model,
  OutcomeEvent,
  PreflightReport,
  RumorEvent,
  SealRecord,
  SealResult,
  TickSealedEvent,
  TxKind,
} from '@/types';
import { ZERO_HASH } from './decode';
import { RunBankRevert } from './errors';
import type { BlockInfo, ChainAdapter } from './types';

const STATUS_INDEX = { ready: 0, running: 1, failed: 2, survived: 3 } as const;
const MOCK_BASE_BLOCK = 69_800_000n;

export interface MockAdapterOptions {
  /** Round-trip latency range per transaction. Default [450, 900], like a live sync send. */
  latencyMs?: [number, number];
  /** Test hook: runs after the latency, before the call takes effect. Throw to simulate a failure. */
  beforeApply?: (kind: TxKind) => void | Promise<void>;
  /** Random source (tests pass a deterministic one). */
  random?: () => number;
}

export interface MockAdapter extends ChainAdapter {
  readonly kind: 'mock';
}

export function createMockAdapter(model: Model, opts?: MockAdapterOptions): MockAdapter {
  const [lo, hi] = opts?.latencyMs ?? [450, 900];
  const rnd = opts?.random ?? Math.random;
  const t0 = Date.now();
  const blockNow = (): bigint => MOCK_BASE_BLOCK + BigInt(Math.floor((Date.now() - t0) / 400));
  const delay = () => new Promise<void>((r) => setTimeout(r, lo + rnd() * Math.max(0, hi - lo)));

  let level: BankLevel = 0;
  let bank: BankState = initialBank(model, 0);
  let runId = 0;
  let startBlock = 0n;
  let nextId = 1;
  const sealedTicks = new Map<number, { event: TickSealedEvent; record: SealRecord }>();
  let lastOutcome: OutcomeEvent | null = null;
  const funded = model.configs[0].cash0 + model.configs[0].bonds0;

  const open = (kind: TxKind, extra: Partial<SealRecord> = {}): SealRecord => ({
    id: nextId++, kind, simulated: true, fromTick: null, toTick: null, requestedCount: null,
    txHash: null, blockNumber: null, sentAtMs: Date.now(), sealedAtMs: null,
    gasLimit: null, gasUsed: null, status: 'pending', finalized: false, mirrorMatch: null, rpc: 'mock', ...extra,
  });
  const close = (r: SealRecord, gasUsed = 100_000n): SealRecord => ({
    ...r, status: 'sealed', sealedAtMs: Date.now(), blockNumber: blockNow(), finalized: true, gasLimit: gasUsed, gasUsed,
  });
  const wrongStatus = (expected: keyof typeof STATUS_INDEX) =>
    new RunBankRevert('WrongStatus', [STATUS_INDEX[expected], STATUS_INDEX[bank.status]]);

  async function step(kind: TxKind, extra?: Partial<SealRecord>): Promise<SealRecord> {
    const r = open(kind, extra);
    await delay();
    await opts?.beforeApply?.(kind);
    return r;
  }

  const plain = async (kind: TxKind): Promise<SealResult> => {
    const r = await step(kind);
    return { record: close(r), rumor: null, ticks: [], outcome: null };
  };

  const snapshot = (): BankSnapshotView => {
    const held = bank.cash + bank.bonds;
    return {
      status: bank.status, level, runId, tick: bank.tick,
      cash: bank.cash, bonds: bank.bonds, depositsOwed: bank.depositsOwed, insuredOwed: bank.insuredOwed, deposits0: bank.deposits0,
      cumulativeLoss: bank.cumulativeLoss, lastHaircutBps: bank.lastHaircutBps, queueLength: bank.queue.length,
      quietCount: bank.quietCount, withdrawnCount: bank.withdrawnCount, startBlock,
      ausdHeld: held, streetHeld: funded > held ? funded - held : 0n,
      ledgerHash: model.ledger.ledgerHash, configHash: hashConfig(model.configs[level]), readAtBlock: blockNow(),
    };
  };

  return {
    kind: 'mock',
    operator: null,

    async preflight(): Promise<PreflightReport> {
      const ms = (lo + hi) / 2;
      const detail = 'simulated';
      return {
        ok: true,
        at: Date.now(),
        checks: [
          { id: 'rpc', label: 'Monad RPC', status: 'pass', detail: `${detail} · ${Math.round(ms / 4)} ms`, critical: true },
          { id: 'blocks', label: 'Block feed', status: 'pass', detail, critical: true },
          { id: 'key', label: 'Operator key', status: 'pass', detail: `${detail} · practice needs no key`, critical: true },
          { id: 'operatorMon', label: 'Operator MON', status: 'pass', detail, critical: true },
          { id: 'backupMon', label: 'Backup MON', status: 'pass', detail, critical: false },
          { id: 'bank', label: 'RunBank contract', status: 'pass', detail, critical: true },
          { id: 'status', label: 'Bank status', status: 'pass', detail: `${detail} · ready`, critical: true },
          { id: 'ausd', label: 'AUSD held by the bank', status: 'pass', detail, critical: true },
          { id: 'ledger', label: 'Ledger matches the engine', status: 'pass', detail, critical: true },
          { id: 'config', label: 'Bank config matches the engine', status: 'pass', detail, critical: false },
          { id: 'ping', label: 'Test transaction', status: 'pass', detail: `${detail} · ${(ms / 1000).toFixed(1)} s`, critical: true },
        ],
      };
    },

    async readSnapshot() {
      return snapshot();
    },

    async setLevel(l) {
      const r = await step('setLevel');
      if (bank.status !== 'ready') throw wrongStatus('ready');
      level = l;
      bank = initialBank(model, l);
      return { record: close(r, 600_000n), rumor: null, ticks: [], outcome: null };
    },

    async startRumor(params, modelHash: Hex) {
      const r = await step('rumor');
      if (bank.status !== 'ready') throw wrongStatus('ready');
      bank = { ...bank, status: 'running' };
      runId += 1;
      startBlock = blockNow();
      sealedTicks.clear();
      lastOutcome = null;
      const done = close(r, 60_000n);
      const rumor: RumorEvent = {
        runId, level: params.level, card: params.card, seedNode: params.seedNode, modelSeed: params.modelSeed,
        modelHash, startBlock, txHash: ZERO_HASH, blockNumber: done.blockNumber!,
      };
      return { record: done, rumor, ticks: [], outcome: null };
    },

    async sealTicks(firstTick, ticks) {
      const requestedCount = ticks.reduce((n, t) => n + t.length, 0);
      const r = await step('ticks', { fromTick: firstTick, toTick: firstTick + ticks.length - 1, requestedCount });
      if (bank.status !== 'running') throw wrongStatus('running');
      if (firstTick !== bank.tick + 1) throw new RunBankRevert('TickMismatch', [bank.tick + 1, firstTick], firstTick);
      const done = close(r, BigInt(200_000 + ticks.length * 60_000 + requestedCount * 25_000));
      const events: TickSealedEvent[] = [];
      let outcome: OutcomeEvent | null = null;
      for (const ids of ticks) {
        if (bank.status !== 'running') break; // like the contract: stops silently once the run is over
        let stepped;
        try {
          stepped = applyTick(bank, model.configs[level], model.ledger, ids);
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === 'NotAscending' || code === 'BadDepositor') throw new RunBankRevert(code, [], bank.tick + 1, { cause: e });
          throw e;
        }
        bank = stepped.bank;
        const x = stepped.result;
        const event: TickSealedEvent = {
          runId, tick: x.tick, requested: ids, served: x.served.length, skipped: x.skipped, haircutBps: x.haircutBps,
          queueLengthAfter: x.queueLengthAfter, paid: x.paid, bondsSold: x.bondsSold, fireSaleLoss: x.fireSaleLoss,
          cashAfter: x.cashAfter, bondsAfter: x.bondsAfter, depositsOwedAfter: x.depositsOwedAfter,
          txHash: ZERO_HASH, blockNumber: done.blockNumber!, logIndex: events.length,
        };
        events.push(event);
        sealedTicks.set(x.tick, { event, record: done });
        if (x.statusAfter === 'failed' || x.statusAfter === 'survived') {
          outcome = {
            kind: x.statusAfter, runId, tick: x.tick,
            trappedCount: x.trapped?.count ?? 0, trappedAmount: x.trapped?.amount ?? 0n, uninsuredTrapped: x.trapped?.uninsured ?? 0n,
            txHash: ZERO_HASH, blockNumber: done.blockNumber!,
          };
          lastOutcome = outcome;
        }
      }
      const toTick = events.length ? events[events.length - 1].tick : done.fromTick;
      return { record: { ...done, toTick }, rumor: null, ticks: events, outcome };
    },

    async reset() {
      const r = await step('reset');
      if (bank.status === 'ready') throw wrongStatus('running'); // the contract rejects reset from Ready
      bank = initialBank(model, level);
      sealedTicks.clear();
      lastOutcome = null;
      return { record: close(r, 120_000n), rumor: null, ticks: [], outcome: null };
    },

    ping: () => plain('ping'),
    fundBank: () => plain('fund'),

    async balances() {
      return { primary: 40n * 10n ** 18n, backup: 25n * 10n ** 18n };
    },

    switchToBackup() {
      return false;
    },

    watchBlocks(cb: (b: BlockInfo) => void) {
      const emit = () => cb({ number: blockNow(), finalized: blockNow() - 2n });
      emit();
      const id = setInterval(emit, 400);
      return () => clearInterval(id);
    },

    async recoverTicks(fromTick, toTick) {
      const hits: { event: TickSealedEvent; record: SealRecord }[] = [];
      for (let t = fromTick; t <= toTick; t++) {
        const h = sealedTicks.get(t);
        if (!h) return null;
        hits.push(h);
      }
      if (!hits.length) return null;
      const last = hits[hits.length - 1];
      const outcome = lastOutcome && lastOutcome.tick <= toTick ? lastOutcome : null;
      return { record: { ...last.record, fromTick, toTick }, rumor: null, ticks: hits.map((h) => h.event), outcome };
    },
  };
}
