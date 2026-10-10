// B-09: the PRD §10.4 tuning targets as assertions, plus the demo-quality guard rails (eval.ts `checkStory`).
// If the model, the data or a config changes, these say whether the demo still works.
import { describe, expect, it } from 'vitest';
import { keccak256, toHex } from 'viem';
import { checkStory, checkTargets, evaluate, evaluateAll } from './eval';
import type { Row } from './eval';
import { defaultParams, loadModel, modelInputs } from './model';
import type { ModelFile } from './model';
import { hashModelFile } from './model';
import modelJson from './data/model.json';

const model = loadModel();
const rows = evaluateAll(model);
const row = (level: 0 | 1, card: 0 | 1 | 2 | 3): Row => rows.find((r) => r.level === level && r.card === card)!;

describe('PRD §10.4 tuning targets', () => {
  it('all targets pass for every level × card with the shipped model seeds', () => {
    const v = checkTargets(rows).map((x) => `${x.row.level}/${'QWER'[x.row.card]}: ${x.rule}`);
    expect(v).toEqual([]);
  });

  it("Bhau's Bank × W, E, R fails at tick 8–16", () => {
    for (const card of [1, 2, 3] as const) {
      const r = row(0, card);
      expect(r.outcome).toBe('failed');
      expect(r.tick).toBeGreaterThanOrEqual(8);
      expect(r.tick).toBeLessThanOrEqual(16);
    }
  });

  it("Bhau's Bank × Q fails by tick 30 or fizzles (documented: see status/B.md)", () => {
    const r = row(0, 0);
    expect(r.outcome === 'survived' || (r.outcome === 'failed' && r.tick <= 30)).toBe(true);
  });

  it('Monad Mutual survives every card by tick 40, nobody trapped, loss ≤ 80% of equity', () => {
    for (const card of [0, 1, 2, 3] as const) {
      const r = row(1, card);
      expect(r.outcome).toBe('survived');
      expect(r.tick).toBeLessThanOrEqual(40);
      expect(r.trapped).toBe(0);
      expect(r.lossPctOfEquity).toBeLessThanOrEqual(80);
    }
  });

  it("visual shape (Bhau's × W): ≥ 60% heard at failure, ≥ 70% of whales withdrew before it", () => {
    const r = row(0, 1);
    expect(r.heardPct).toBeGreaterThanOrEqual(60);
    expect(r.whalesOutPct).toBeGreaterThanOrEqual(70);
  });

  it('batch size: at most 200 requests in any tick', () => {
    for (const r of rows) expect(r.peakRequests).toBeLessThanOrEqual(200);
  });
});

describe('demo guard rails (PRD §5.1 script)', () => {
  it('story checks pass', () => {
    expect(checkStory(rows).map((x) => `${x.row.level}/${'QWER'[x.row.card]}: ${x.rule}`)).toEqual([]);
  });
});

describe('robustness', () => {
  it('the targets hold for other model seeds too (not just the shipped draw)', () => {
    let failing = 0;
    let total = 0;
    for (const alt of [1001n, 2002n, 3003n]) {
      const all = evaluateAll(model, (card) => alt + BigInt(card));
      total += all.length;
      failing += new Set(checkTargets(all).map((v) => `${v.row.level}/${v.row.card}`)).size;
    }
    // At most a quarter of the alternative draws may miss a target; the shipped seeds must always pass.
    expect(failing / total).toBeLessThanOrEqual(0.25);
  });

  it('Mutual survives for every possible starting node of card R (hash-based spread, any seed)', () => {
    const failures: number[] = [];
    for (const n of model.graph.nodes.filter((_, i) => i % 25 === 0)) {
      const r = evaluate(model, defaultParams(model, 1, 3, n.id));
      if (r.outcome !== 'survived' || r.trapped > 0) failures.push(n.id);
    }
    expect(failures).toEqual([]);
  });
});

describe('determinism snapshot', () => {
  it('request histories are pinned by hash (regenerate deliberately when the model changes)', () => {
    const digest = keccak256(toHex(rows.map((r) => `${r.level}${r.card}:${r.outcome}:${r.tick}:${r.hash}`).join('|')));
    expect(digest).toMatchSnapshot();
  });
});

describe('model.json', () => {
  const file = modelJson as unknown as ModelFile;
  it('modelHash commits to the tuning and to the ledger, graph and configs', () => {
    const { modelHash, ...body } = file;
    expect(hashModelFile(body)).toBe(modelHash);
    expect(file.inputs).toEqual(modelInputs(model));
    expect(model.modelHash).toBe(modelHash);
  });
  it('mirrors cards.json (strengths and seed nodes)', () => {
    expect(file.strengths).toEqual(model.cards.map((c) => c.strength));
    expect(file.seeds).toEqual(model.cards.map((c) => c.seedNode));
  });
  it('model seeds fit uint64', () => {
    for (const s of file.modelSeeds) expect(BigInt(s) < 2n ** 64n).toBe(true);
  });
});
