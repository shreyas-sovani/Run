import { describe, expect, it } from 'vitest';
import { createRun, defaultParams, loadModel, stepRun } from '@/engine';
import type { OutcomeEvent, SealResult, TickResult } from '@/types';
import { createMockAdapter } from './mockAdapter';
import { createRecorder } from './recorder';
import { createSealQueue } from './sealQueue';
import { translateError } from './errors';

const model = loadModel();
const fast = { latencyMs: [0, 2] as [number, number] };

describe('mock adapter', () => {
  it('every record is simulated with no tx hash, and results have the live shape', async () => {
    const a = createMockAdapter(model, fast);
    expect(a.kind).toBe('mock');
    const res = [
      await a.ping(),
      await a.setLevel(0, model.configs[0]),
      await a.startRumor(defaultParams(model, 0, 0), model.modelHash),
      await a.sealTicks(1, [[], []]),
      await a.reset(),
    ];
    for (const r of res) {
      expect(r.record.simulated).toBe(true);
      expect(r.record.txHash).toBeNull();
      expect(r.record.status).toBe('sealed');
      expect(r.record.blockNumber).not.toBeNull();
    }
    expect(res[2].rumor?.runId).toBe(1);
    expect(res[3].ticks.map((t) => t.tick)).toEqual([1, 2]);
    expect(res[3].record).toMatchObject({ kind: 'ticks', fromTick: 1, toTick: 2 });
  });

  it('reproduces the contract revert rules', async () => {
    const a = createMockAdapter(model, fast);
    await expect(a.sealTicks(1, [[]])).rejects.toMatchObject({ errorName: 'WrongStatus' });
    await expect(a.reset()).rejects.toMatchObject({ errorName: 'WrongStatus' });
    await a.startRumor(defaultParams(model, 0, 0), model.modelHash);
    await expect(a.startRumor(defaultParams(model, 0, 0), model.modelHash)).rejects.toMatchObject({ errorName: 'WrongStatus' });
    await expect(a.setLevel(1, model.configs[1])).rejects.toMatchObject({ errorName: 'WrongStatus' });
    await expect(a.sealTicks(5, [[]])).rejects.toMatchObject({ errorName: 'TickMismatch' });
    await expect(a.sealTicks(1, [[9, 3]])).rejects.toMatchObject({ errorName: 'NotAscending' });
    expect(translateError(await a.sealTicks(5, [[]]).catch((e) => e)).code).toBe('TickMismatch');
    await a.reset();
    expect((await a.readSnapshot()).status).toBe('ready');
  });

  it('plays a whole run through the SealQueue: gap-free, outcome from the sealed event, mirror equal', async () => {
    const a = createMockAdapter(model, { latencyMs: [5, 15] });
    const q = createSealQueue(a, { retryDelayMs: 5 });
    const params = defaultParams(model, 0, 3);
    await a.setLevel(0, model.configs[0]);
    const started = await a.startRumor(params, model.modelHash);
    const rec = createRecorder();
    expect(started.rumor).not.toBeNull();
    rec.begin(params, started.rumor!, model.modelHash);

    const mirror = new Map<number, TickResult>();
    const sealedTicks: number[] = [];
    let outcome: OutcomeEvent | null = null;
    q.onSealed((r: SealResult) => {
      rec.add(r);
      for (const t of r.ticks) {
        sealedTicks.push(t.tick);
        const m = mirror.get(t.tick)!;
        expect(t.cashAfter).toBe(m.cashAfter);
        expect(t.paid).toBe(m.paid);
        expect(t.served).toBe(m.served.length);
      }
      if (r.outcome) outcome = r.outcome;
    });

    let run = createRun(model, params);
    for (let i = 0; i < 120; i++) {
      const s = stepRun(model, run);
      run = s.run;
      mirror.set(s.payload.tick, s.result);
      q.push(s.payload);
      if (s.result.statusAfter !== 'running') break;
    }
    await q.drain();
    q.stop();

    expect(sealedTicks.length).toBeGreaterThan(0);
    expect(sealedTicks).toEqual(sealedTicks.map((_, i) => i + 1));
    expect(outcome).not.toBeNull();
    const o = outcome as unknown as OutcomeEvent;
    const final = await a.readSnapshot();
    expect(final.status).toBe(o.kind);

    const replay = rec.finish(o);
    expect(replay?.ticks.map((t) => t.tick)).toEqual(sealedTicks);
    expect(replay?.outcome.kind).toBe(o.kind);
    expect(replay?.rumor.sealedAtMs).toBe(0);
    expect(JSON.parse(JSON.stringify(replay))).toEqual(replay); // JSON-serialisable: bigints stored as strings
  });

  it('recoverTicks rebuilds a landed batch (used by the SealQueue mismatch path)', async () => {
    const a = createMockAdapter(model, fast);
    await a.startRumor(defaultParams(model, 0, 0), model.modelHash);
    await a.sealTicks(1, [[], [], []]);
    const r = await a.recoverTicks!(2, 3);
    expect(r?.ticks.map((t) => t.tick)).toEqual([2, 3]);
    expect(await a.recoverTicks!(2, 9)).toBeNull();
  });

  it('beforeApply can simulate a failure', async () => {
    const a = createMockAdapter(model, {
      ...fast,
      beforeApply: (k) => {
        if (k === 'ping') throw new Error('network down');
      },
    });
    await expect(a.ping()).rejects.toThrow('network down');
  });

  it('preflight is an all-pass simulated report', async () => {
    const rep = await createMockAdapter(model, fast).preflight(model);
    expect(rep.ok).toBe(true);
    expect(rep.checks.every((c) => c.status === 'pass' && c.detail.includes('simulated'))).toBe(true);
  });

  it('watchBlocks emits advancing fake block numbers and unsubscribes', async () => {
    const a = createMockAdapter(model, fast);
    const seen: bigint[] = [];
    const off = a.watchBlocks((b) => seen.push(b.number));
    await new Promise((r) => setTimeout(r, 900));
    off();
    const n = seen.length;
    await new Promise((r) => setTimeout(r, 500));
    expect(n).toBeGreaterThanOrEqual(2);
    expect(seen.length).toBe(n);
    expect(seen[seen.length - 1]).toBeGreaterThan(seen[0]);
  });
});
