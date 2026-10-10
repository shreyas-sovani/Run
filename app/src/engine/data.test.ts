import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hashLedgerWords, packBalances, unpackBalances } from './ledger';

const read = (f: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./data/${f}`, import.meta.url)), 'utf8'));

describe('data/ledger.json', () => {
  const l = read('ledger.json');
  it('is internally consistent with PRD §9.1', () => {
    expect(l.count).toBe(500);
    expect(l.balances).toHaveLength(500);
    expect(l.packed).toHaveLength(63);
    const balances = l.balances.map((b: string) => BigInt(b));
    expect(packBalances(balances)).toEqual(l.packed.map((w: string) => BigInt(w)));
    expect(unpackBalances(l.packed.map((w: string) => BigInt(w)), 500)).toEqual(balances);
    expect(balances.reduce((a: bigint, b: bigint) => a + b, 0n)).toBe(9_500_000_000n);
    expect(l.deposits0).toBe('9500000000');
    expect(hashLedgerWords(l.packed.map((w: string) => BigInt(w)))).toBe(l.ledgerHash);
  });
});

describe('data/configs.json', () => {
  const c = read('configs.json');
  it('has both levels with the PRD §9.2 shape', () => {
    for (const lvl of ['0', '1']) {
      expect(Object.keys(c[lvl]).sort()).toEqual(
        ['bonds0', 'cash0', 'haircutBaseBps', 'haircutMaxBps', 'haircutSlopeBps', 'insuredCap', 'quietTicks', 'speedBumpBps'],
      );
    }
    expect(c['0'].cash0).toBe('1500000000');
    expect(c['0'].bonds0).toBe('8500000000');
    expect(c['0'].speedBumpBps).toBe(0);
    expect(c['1'].speedBumpBps).toBeGreaterThan(0);
  });
});

describe('data/graph.json and cards.json', () => {
  const g = read('graph.json');
  const cards = read('cards.json');
  it('graph has 500 nodes, symmetric neighbours and 25 whales', () => {
    expect(g.nodes).toHaveLength(500);
    expect(g.nodes.filter((n: { whale: boolean }) => n.whale)).toHaveLength(25);
    for (const n of g.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1);
      expect(g.neighbors[n.id]).toHaveLength(n.degree);
    }
    for (const [a, b] of g.edges) {
      expect(g.neighbors[a]).toContain(b);
      expect(g.neighbors[b]).toContain(a);
    }
  });
  it('cards are Q W E R, strictly stronger left to right (PRD §10.2 starts at 0.4/0.6/0.8/1.0; the tuner may move them)', () => {
    expect(cards.map((c: { hotkey: string }) => c.hotkey)).toEqual(['Q', 'W', 'E', 'R']);
    const s: number[] = cards.map((c: { strength: number }) => c.strength);
    for (let i = 0; i < 4; i++) {
      expect(s[i]).toBeGreaterThan(0);
      expect(s[i]).toBeLessThanOrEqual(1);
      if (i > 0) expect(s[i]).toBeGreaterThan(s[i - 1]);
    }
    for (const c of cards) expect(c.seedNode).toBeGreaterThanOrEqual(0), expect(c.seedNode).toBeLessThan(500);
  });
});
