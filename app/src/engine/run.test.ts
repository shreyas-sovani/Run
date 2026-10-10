import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { keccak256, toHex } from 'viem';
import { NodeState } from '@/types';
import type { RunParams, RunState, TickPayload } from '@/types';
import { applyTick, createRun, defaultParams, loadModel, replayTicks, stepRun, stepRunWithRequested, verifyDecisions } from './index';

const model = loadModel();

/** Hash of everything a UI could observe about a run: used to assert bit-identical determinism. */
function frameHash(run: RunState): string {
  const f = run.frame;
  const parts = [
    String(f.tick), Array.from(f.nodeState).join(','), Array.from(f.panic, (x) => x.toFixed(6)).join(','),
    Array.from(f.heardAt).join(','), Array.from(f.goneAt).join(','), f.newlyHeard.join(','), f.newlyRequested.join(','), f.newlyServed.join(','),
    f.bank.status, String(f.bank.cash), String(f.bank.bonds), String(f.bank.depositsOwed), String(f.bank.cumulativeLoss), f.bank.queue.join(','),
  ];
  return keccak256(toHex(parts.join('|')));
}

function runAll(params: RunParams, maxTicks = 80): { run: RunState; payloads: TickPayload[]; hashes: string[] } {
  let run = createRun(model, params);
  const payloads: TickPayload[] = [];
  const hashes = [frameHash(run)];
  while (run.frame.bank.status === 'running' && run.frame.tick < maxTicks) {
    const s = stepRun(model, run);
    run = s.run;
    payloads.push(s.payload);
    hashes.push(frameHash(run));
  }
  return { run, payloads, hashes };
}

describe('createRun', () => {
  it('starts at tick 0 with the seed node heard, everyone else calm, bank running', () => {
    const p = defaultParams(model, 0, 1);
    const run = createRun(model, p);
    const f = run.frame;
    expect(f.tick).toBe(0);
    expect(f.bank.status).toBe('running');
    expect(f.bank.tick).toBe(0);
    expect(f.heardAt[p.seedNode]).toBe(0);
    expect(f.newlyHeard).toEqual([p.seedNode]);
    expect(f.nodeState[p.seedNode]).not.toBe(NodeState.Calm);
    expect(Array.from(f.heardAt).filter((x) => x >= 0)).toHaveLength(1);
    expect(Array.from(f.nodeState).filter((s) => s === NodeState.Calm)).toHaveLength(499);
    expect(run.history).toEqual([]);
  });

  it('defaultParams uses the card seed node and a constant modelSeed per card', () => {
    for (const card of [0, 1, 2, 3] as const) {
      const a = defaultParams(model, 0, card);
      const b = defaultParams(model, 1, card);
      expect(a.seedNode).toBe(model.cards[card].seedNode);
      expect(a.modelSeed).toBe(b.modelSeed);
      expect(a.modelSeed).toBeGreaterThanOrEqual(0n);
      expect(a.modelSeed).toBeLessThan(2n ** 64n);
    }
    expect(defaultParams(model, 0, 2, 7).seedNode).toBe(7); // P2: chosen seed node
  });
});

describe('stepRun', () => {
  it('builds strictly ascending payloads whose results equal the PRD §9 mirror', () => {
    const { payloads } = runAll(defaultParams(model, 0, 3));
    expect(payloads.length).toBeGreaterThan(2);
    let bank = { ...createRun(model, defaultParams(model, 0, 3)).frame.bank };
    for (const [i, p] of payloads.entries()) {
      expect(p.tick).toBe(i + 1);
      for (let k = 1; k < p.requested.length; k++) expect(p.requested[k]).toBeGreaterThan(p.requested[k - 1]);
      for (const id of p.requested) expect(Number.isInteger(id) && id >= 0 && id < 500).toBe(true);
      bank = applyTick(bank, model.configs[0], model.ledger, p.requested).bank;
    }
  });

  it('records history, frame bookkeeping and newly* lists consistently', () => {
    let run = createRun(model, defaultParams(model, 0, 3));
    const everRequested = new Set<number>();
    for (let t = 1; t <= 12 && run.frame.bank.status === 'running'; t++) {
      const prevHeard = Array.from(run.frame.heardAt);
      const s = stepRun(model, run);
      run = s.run;
      expect(run.history).toHaveLength(t);
      expect(run.history[t - 1]).toEqual(s.payload);
      expect(run.frame.tick).toBe(t);
      expect(run.frame.last).toEqual(s.result);
      for (const id of run.frame.newlyHeard) {
        expect(prevHeard[id]).toBe(-1);
        expect(run.frame.heardAt[id]).toBe(t);
      }
      for (const id of run.frame.newlyRequested) {
        expect(everRequested.has(id)).toBe(false);
        everRequested.add(id);
        expect(run.frame.goneAt[id]).toBe(t);
        expect(run.frame.heardAt[id]).toBeGreaterThanOrEqual(0); // nobody requests a rumor they never heard
      }
      for (const id of run.frame.newlyServed) expect(run.frame.bank.withdrawn[id]).toBe(1);
    }
    expect(everRequested.size).toBeGreaterThan(0);
  });

  it('is pure: stepping never mutates the input run', () => {
    const run = createRun(model, defaultParams(model, 0, 3));
    const before = frameHash(run);
    stepRun(model, run);
    expect(frameHash(run)).toBe(before);
    expect(run.history).toHaveLength(0);
  });

  it('marks everyone unpaid as Trapped when the bank fails, and only then', () => {
    const { run } = runAll(defaultParams(model, 0, 3));
    expect(run.frame.bank.status).toBe('failed');
    for (let i = 0; i < 500; i++) {
      if (run.frame.bank.withdrawn[i]) expect(run.frame.nodeState[i]).toBe(NodeState.Withdrawn);
      else expect(run.frame.nodeState[i]).toBe(NodeState.Trapped);
    }
    expect(run.frame.last?.trapped).not.toBeNull();
  });

  it('panic = score / threshold is finite and non-negative', () => {
    const { run } = runAll(defaultParams(model, 0, 2));
    for (const x of run.frame.panic) {
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('determinism', () => {
  it('same params give identical frame hashes across 3 runs', () => {
    for (const level of [0, 1] as const) {
      for (const card of [0, 1, 2, 3] as const) {
        const p = defaultParams(model, level, card);
        const a = runAll(p);
        const b = runAll(p);
        const c = runAll(p);
        expect(b.hashes).toEqual(a.hashes);
        expect(c.hashes).toEqual(a.hashes);
      }
    }
  });

  it('a different modelSeed gives a different run', () => {
    const p = defaultParams(model, 0, 3);
    const a = runAll(p).hashes;
    const b = runAll({ ...p, modelSeed: p.modelSeed + 1n }).hashes;
    expect(b).not.toEqual(a);
  });
});

describe('stepRunWithRequested / replayTicks / verifyDecisions', () => {
  const p = defaultParams(model, 0, 3);
  const { run: original, payloads, hashes } = runAll(p);

  it('replaying the recorded payloads reproduces every frame (spectate / replay)', () => {
    let run = createRun(model, p);
    for (const [i, payload] of payloads.entries()) {
      run = stepRunWithRequested(model, run, payload.requested).run;
      expect(frameHash(run)).toBe(hashes[i + 1]);
    }
    const r = replayTicks(model, p, payloads);
    expect(frameHash(r.run)).toBe(frameHash(original));
    expect(r.results).toHaveLength(payloads.length);
    expect(r.results.at(-1)?.statusAfter).toBe('failed');
  });

  it('verifyDecisions matches every tick of an honest run', () => {
    expect(verifyDecisions(model, p, payloads)).toEqual({ matched: payloads.length, total: payloads.length, firstMismatchTick: null });
  });

  it('verifyDecisions reports the first mismatching tick when a request list is tampered with', () => {
    const tampered = payloads.map((t) => ({ tick: t.tick, requested: t.requested.slice() }));
    const at = 2;
    tampered[at].requested = [...new Set([...tampered[at].requested, 499])].sort((a, b) => a - b);
    // make sure the tamper changed something
    if (tampered[at].requested.length === payloads[at].requested.length) tampered[at].requested = tampered[at].requested.slice(0, -1);
    const v = verifyDecisions(model, p, tampered);
    expect(v.total).toBe(tampered.length);
    expect(v.firstMismatchTick).toBe(tampered[at].tick);
    expect(v.matched).toBeLessThan(v.total);
  });

  it('stepRunWithRequested accepts requests the model would not make and still recomputes the visuals', () => {
    const run0 = createRun(model, p);
    const s = stepRunWithRequested(model, run0, [3, 7]);
    expect(s.payload).toEqual({ tick: 1, requested: [3, 7] });
    expect(s.run.frame.heardAt[3]).toBeGreaterThanOrEqual(0);
    expect(s.run.frame.goneAt[3]).toBe(1);
    expect(s.result.served).toEqual([3, 7]);
  });
});

describe('model behaviour', () => {
  it('insurance calms depositors: identical state, lower panic under Monad Mutual, never higher', () => {
    const at = (level: 0 | 1) => stepRunWithRequested(model, createRun(model, defaultParams(model, level, 3)), []).run.frame;
    const bhau = at(0);
    const mutual = at(1);
    expect(Array.from(mutual.heardAt)).toEqual(Array.from(bhau.heardAt)); // same rumor, same spread
    let lower = 0;
    for (let i = 0; i < 500; i++) {
      expect(mutual.panic[i]).toBeLessThanOrEqual(bhau.panic[i]);
      if (mutual.panic[i] < bhau.panic[i]) lower++;
    }
    expect(lower).toBeGreaterThan(0);
  });

  it('steps in well under 2 ms on average', () => {
    const p = defaultParams(model, 1, 3);
    const t0 = performance.now();
    let steps = 0;
    for (let rep = 0; rep < 6; rep++) {
      let run = createRun(model, p);
      while (run.frame.bank.status === 'running' && run.frame.tick < 45) {
        run = stepRun(model, run).run;
        steps++;
      }
    }
    expect((performance.now() - t0) / steps).toBeLessThan(2);
  });
});

describe('determinism rules (PRD §10.3)', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const files = ['prng.ts', 'panic.ts', 'run.ts', 'bank.ts', 'model.ts', 'ledger.ts', 'index.ts'];
  it('no Math.random / exp / log / pow / sin / cos / sqrt-free runtime code in the engine', () => {
    for (const f of files) {
      const src = readFileSync(dir + f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/Math\.(random|exp|log|pow|sin|cos|tan|atan|sqrt)\b/);
      expect(src, f).not.toMatch(/\benum\s+\w+/);
      expect(src, f).not.toMatch(/\*\*/); // exponent operator is Math.pow
    }
  });
});
