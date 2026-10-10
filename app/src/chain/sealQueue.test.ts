import { describe, expect, it } from 'vitest';
import type { BankSnapshotView, OutcomeEvent, SealHealth, SealRecord, SealResult, TickSealedEvent, UiError } from '@/types';
import { AllRpcsDownError, ChainTimeoutError, RunBankRevert } from './errors';
import { ZERO_HASH } from './decode';
import { createSealQueue } from './sealQueue';
import type { ChainAdapter } from './types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function ev(tick: number, requested: number[] = []): TickSealedEvent {
  return {
    runId: 1, tick, requested, served: requested.length, skipped: 0, haircutBps: 0, queueLengthAfter: 0, paid: 0n, bondsSold: 0n,
    fireSaleLoss: 0n, cashAfter: 0n, bondsAfter: 0n, depositsOwedAfter: 0n, txHash: ZERO_HASH, blockNumber: 1n, logIndex: tick,
  };
}
function result(ticks: number[][], first: number, outcome: OutcomeEvent | null = null): SealResult {
  const events = ticks.map((t, i) => ev(first + i, t));
  const record: SealRecord = {
    id: 1, kind: 'ticks', simulated: false, fromTick: first, toTick: first + ticks.length - 1, requestedCount: 0, txHash: ZERO_HASH,
    blockNumber: 1n, sentAtMs: 0, sealedAtMs: 1, gasLimit: null, gasUsed: null, status: 'sealed', finalized: false, mirrorMatch: null, rpc: null,
  };
  return { record, rumor: null, ticks: events, outcome };
}
const snap = (tick: number, status: BankSnapshotView['status'] = 'running'): BankSnapshotView =>
  ({ status, tick, runId: 1 }) as BankSnapshotView;

interface Fake extends ChainAdapter {
  calls: { first: number; ticks: number[][] }[];
}
function fakeAdapter(over: {
  sealTicks?: (call: number, first: number, ticks: number[][]) => Promise<SealResult>;
  readSnapshot?: () => Promise<BankSnapshotView>;
  recoverTicks?: (from: number, to: number) => Promise<SealResult | null>;
  latencyMs?: number;
}): Fake {
  const calls: Fake['calls'] = [];
  return {
    calls,
    kind: 'mock',
    operator: null,
    preflight: async () => ({ ok: true, checks: [], at: 0 }),
    readSnapshot: over.readSnapshot ?? (async () => snap(0)),
    setLevel: async () => result([], 0),
    startRumor: async () => result([], 0),
    reset: async () => result([], 0),
    ping: async () => result([], 0),
    fundBank: async () => result([], 0),
    balances: async () => ({ primary: 0n, backup: null }),
    switchToBackup: () => false,
    watchBlocks: () => () => {},
    recoverTicks: over.recoverTicks,
    async sealTicks(first, ticks) {
      calls.push({ first, ticks });
      await sleep(over.latencyMs ?? 20);
      return over.sealTicks ? over.sealTicks(calls.length, first, ticks) : result(ticks, first);
    },
  };
}

const opts = { retryDelayMs: 5, delayedAfterMs: 60 };

describe('SealQueue', () => {
  it('keeps one tx in flight and merges the ticks that piled up behind it', async () => {
    const a = fakeAdapter({ latencyMs: 40 });
    const q = createSealQueue(a, opts);
    const sealed: SealResult[] = [];
    q.onSealed((r) => sealed.push(r));
    q.push({ tick: 1, requested: [1] });
    await sleep(5);
    for (let t = 2; t <= 6; t++) q.push({ tick: t, requested: [t] });
    await q.drain();
    expect(a.calls.map((c) => [c.first, c.ticks.length])).toEqual([[1, 1], [2, 5]]);
    expect(sealed.flatMap((r) => r.ticks.map((t) => t.tick))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(q.sealedTick).toBe(6);
    expect(q.pending).toBe(0);
    expect(q.health).toBe('idle');
    q.stop();
  });

  it('never sends more than maxTicksPerTx in one transaction', async () => {
    const a = fakeAdapter({ latencyMs: 30 });
    const q = createSealQueue(a, { ...opts, maxTicksPerTx: 3 });
    q.push({ tick: 1, requested: [] });
    await sleep(5);
    for (let t = 2; t <= 8; t++) q.push({ tick: t, requested: [] });
    await q.drain();
    expect(a.calls.every((c) => c.ticks.length <= 3)).toBe(true);
    expect(a.calls.flatMap((c) => c.ticks.map((_, i) => c.first + i))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    q.stop();
  });

  it('ignores duplicate or already-pushed ticks', async () => {
    const a = fakeAdapter({});
    const q = createSealQueue(a, opts);
    q.push({ tick: 1, requested: [] });
    q.push({ tick: 1, requested: [] });
    q.push({ tick: 2, requested: [] });
    q.push({ tick: 1, requested: [] });
    await q.drain();
    expect(a.calls.flatMap((c) => c.ticks.map((_, i) => c.first + i))).toEqual([1, 2]);
    q.stop();
  });

  it('drain resolves immediately when nothing was pushed, and after stop()', async () => {
    const q = createSealQueue(fakeAdapter({}), opts);
    await q.drain();
    q.push({ tick: 1, requested: [] });
    q.stop();
    await q.drain();
  });

  it('reports delayed when the oldest tick waits too long, then recovers', async () => {
    const a = fakeAdapter({ latencyMs: 150 });
    const q = createSealQueue(a, { ...opts, delayedAfterMs: 50 });
    const seen: SealHealth[] = [];
    q.onHealth((h) => seen.push(h));
    q.push({ tick: 1, requested: [] });
    await q.drain();
    expect(seen).toContain('sealing');
    expect(seen).toContain('delayed');
    expect(seen[seen.length - 1]).toBe('idle');
    q.stop();
  });

  it('retries a timeout silently (no error, same batch) and carries on', async () => {
    const a = fakeAdapter({
      sealTicks: async (call, first, ticks) => {
        if (call === 1) throw new ChainTimeoutError(first);
        return result(ticks, first);
      },
    });
    const q = createSealQueue(a, opts);
    const errors: UiError[] = [];
    q.onError((e) => errors.push(e));
    q.push({ tick: 1, requested: [3] });
    q.push({ tick: 2, requested: [4] });
    await q.drain();
    expect(errors).toEqual([]);
    // tick 1 timed out, then went again unchanged (so the adapter can re-broadcast the same signed tx); tick 2 followed.
    expect(a.calls.map((c) => [c.first, c.ticks.length])).toEqual([[1, 1], [1, 1], [2, 1]]);
    expect(q.sealedTick).toBe(2);
    q.stop();
  });

  it('pauses with a Retry action after the timeout retries run out, and retry() resumes', async () => {
    let failing = true;
    const a = fakeAdapter({
      sealTicks: async (_c, first, ticks) => {
        if (failing) throw new ChainTimeoutError(first);
        return result(ticks, first);
      },
    });
    const q = createSealQueue(a, { ...opts, timeoutRetries: 2 });
    const errors: UiError[] = [];
    q.onError((e) => errors.push(e));
    q.push({ tick: 1, requested: [] });
    await sleep(150);
    expect(a.calls.length).toBe(3); // first try + 2 retries
    expect(q.health).toBe('paused');
    expect(errors).toHaveLength(1);
    expect(errors[0].action?.run).toBe('retry');
    failing = false;
    q.retry();
    await q.drain();
    expect(q.sealedTick).toBe(1);
    q.stop();
  });

  it('a batch that already landed (TickMismatch) is recovered from the logs, not resent or duplicated', async () => {
    const a = fakeAdapter({
      latencyMs: 30,
      sealTicks: async (call, first, ticks) => {
        if (call === 1) return result(ticks, first);
        throw new RunBankRevert('TickMismatch', [4, first]); // a timed-out send of [2,3] confirmed late
      },
      readSnapshot: async () => snap(3),
      recoverTicks: async (from, to) => {
        expect([from, to]).toEqual([2, 3]);
        return result([[7], [8]], 2);
      },
    });
    const q = createSealQueue(a, opts);
    const sealed: number[][] = [];
    const errors: UiError[] = [];
    q.onSealed((r) => sealed.push(r.ticks.map((t) => t.tick)));
    q.onError((e) => errors.push(e));
    q.push({ tick: 1, requested: [] });
    await sleep(5);
    q.push({ tick: 2, requested: [7] });
    q.push({ tick: 3, requested: [8] });
    await q.drain();
    expect(errors).toEqual([]);
    expect(sealed).toEqual([[1], [2, 3]]);
    expect(a.calls.length).toBe(2);
    expect(q.sealedTick).toBe(3);
    q.stop();
  });

  it('a partly landed batch recovers the prefix and resends only the rest', async () => {
    const a = fakeAdapter({
      latencyMs: 30,
      sealTicks: async (call, first, ticks) => {
        if (call === 2) throw new RunBankRevert('TickMismatch', [3, first]);
        return result(ticks, first);
      },
      readSnapshot: async () => snap(3),
      recoverTicks: async (from, to) => result(Array.from({ length: to - from + 1 }, () => []), from),
    });
    const q = createSealQueue(a, opts);
    const sealed: number[] = [];
    q.onSealed((r) => sealed.push(...r.ticks.map((t) => t.tick)));
    q.push({ tick: 1, requested: [] });
    await sleep(5);
    for (let t = 2; t <= 5; t++) q.push({ tick: t, requested: [t] });
    await q.drain();
    expect(sealed).toEqual([1, 2, 3, 4, 5]);
    expect(a.calls.map((c) => [c.first, c.ticks.length])).toEqual([[1, 1], [2, 4], [4, 2]]);
    q.stop();
  });

  it('after the run ended, WrongStatus on a resent batch recovers the outcome', async () => {
    const outcome: OutcomeEvent = { kind: 'failed', runId: 1, tick: 2, trappedCount: 3, trappedAmount: 5n, uninsuredTrapped: 1n, txHash: ZERO_HASH, blockNumber: 2n };
    const a = fakeAdapter({
      sealTicks: async () => {
        throw new RunBankRevert('WrongStatus', [1, 2]);
      },
      readSnapshot: async () => snap(2, 'failed'),
      recoverTicks: async () => result([[1], [2]], 1, outcome),
    });
    const q = createSealQueue(a, opts);
    const sealed: SealResult[] = [];
    q.onSealed((r) => sealed.push(r));
    q.push({ tick: 1, requested: [] });
    q.push({ tick: 2, requested: [] });
    await q.drain();
    expect(sealed[0].outcome?.kind).toBe('failed');
    expect(q.pending).toBe(0);
    q.stop();
  });

  it('a real desync (chain behind the batch) pauses with the reset message', async () => {
    const a = fakeAdapter({
      sealTicks: async (_c, first) => {
        throw new RunBankRevert('TickMismatch', [1, first]);
      },
      readSnapshot: async () => snap(0),
    });
    const q = createSealQueue(a, opts);
    const errors: UiError[] = [];
    q.onError((e) => errors.push(e));
    q.push({ tick: 5, requested: [] });
    await sleep(60);
    expect(q.health).toBe('paused');
    expect(errors[0].code).toBe('TickMismatch');
    expect(errors[0].action?.run).toBe('reset');
    q.stop();
  });

  it('a revert pauses, keeps the pending ticks, and retry() resends them', async () => {
    let reverting = true;
    const a = fakeAdapter({
      sealTicks: async (_c, first, ticks) => {
        if (reverting) throw new RunBankRevert('NotOperator');
        return result(ticks, first);
      },
    });
    const q = createSealQueue(a, opts);
    const errors: UiError[] = [];
    const sealed: number[] = [];
    q.onError((e) => errors.push(e));
    q.onSealed((r) => sealed.push(...r.ticks.map((t) => t.tick)));
    q.push({ tick: 1, requested: [] });
    q.push({ tick: 2, requested: [] });
    await sleep(60);
    expect(q.health).toBe('paused');
    expect(q.pending).toBe(2);
    expect(errors.map((e) => e.code)).toEqual(['NotOperator']);
    // drain stays pending while paused
    let drained = false;
    void q.drain().then(() => { drained = true; });
    await sleep(30);
    expect(drained).toBe(false);
    reverting = false;
    q.retry();
    await q.drain();
    expect(sealed).toEqual([1, 2]);
    expect(q.health).toBe('idle');
    q.stop();
  });

  it('the outcome event drops every tick queued behind it', async () => {
    const outcome: OutcomeEvent = { kind: 'survived', runId: 1, tick: 2, trappedCount: 0, trappedAmount: 0n, uninsuredTrapped: 0n, txHash: ZERO_HASH, blockNumber: 2n };
    const a = fakeAdapter({
      latencyMs: 30,
      sealTicks: async (_c, first, ticks) => (first === 1 ? result([ticks[0]], first, null) : result(ticks.slice(0, 1), first, outcome)),
    });
    const q = createSealQueue(a, opts);
    q.push({ tick: 1, requested: [] });
    await sleep(5);
    for (let t = 2; t <= 5; t++) q.push({ tick: t, requested: [] });
    await q.drain();
    expect(q.pending).toBe(0);
    expect(a.calls).toHaveLength(2);
    q.stop();
  });

  it('retries forever while every RPC is down, then carries on without losing the tick', async () => {
    let down = 3;
    const a = fakeAdapter({
      sealTicks: async (_c, first, ticks) => {
        if (down-- > 0) throw new AllRpcsDownError();
        return result(ticks, first);
      },
    });
    const q = createSealQueue(a, { ...opts, retryDelayMs: 5 });
    const seen: SealHealth[] = [];
    q.onHealth((h) => seen.push(h));
    q.push({ tick: 1, requested: [] });
    await q.drain();
    expect(seen).toContain('offline');
    expect(q.sealedTick).toBe(1);
    expect(a.calls.length).toBe(4);
    q.stop();
  }, 15_000);

  it('a subscriber that throws does not stall sealing', async () => {
    const a = fakeAdapter({});
    const q = createSealQueue(a, opts);
    q.onSealed(() => {
      throw new Error('boom');
    });
    q.push({ tick: 1, requested: [] });
    q.push({ tick: 2, requested: [] });
    await q.drain();
    expect(q.sealedTick).toBe(2);
    q.stop();
  });
});
