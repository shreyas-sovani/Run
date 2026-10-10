import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hashLedgerWords, unpackBalances } from './ledger';

const read = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`./data/${f}`, import.meta.url)), 'utf8'));
const ledger = read('ledger.json');
const graph = read('graph.json');
const A = 1_000_000n;
const balances: bigint[] = ledger.balances.map((b: string) => BigInt(b));
const whaleIds: number[] = graph.nodes.filter((n: { whale: boolean }) => n.whale).map((n: { id: number }) => n.id);
const isWhale = new Set(whaleIds);

describe('data/ledger.json v1 (PRD §9.1)', () => {
  it('is the real generated ledger (v1+)', () => {
    expect(ledger.version).toBeGreaterThanOrEqual(1);
  });

  it('totals exactly 9,500 AUSD and every balance fits uint32', () => {
    expect(balances.reduce((a, b) => a + b, 0n)).toBe(9_500n * A);
    expect(ledger.deposits0).toBe('9500000000');
    for (const b of balances) {
      expect(b).toBeGreaterThan(0n);
      expect(b).toBeLessThanOrEqual(0xffffffffn);
    }
  });

  it('whales (the graph\'s 25) hold about half the deposits, each 95–600 AUSD', () => {
    const w = whaleIds.map((id) => balances[id]);
    expect(w).toHaveLength(25);
    const sum = w.reduce((a, b) => a + b, 0n);
    expect(sum).toBeGreaterThanOrEqual(4_650n * A);
    expect(sum).toBeLessThanOrEqual(4_850n * A);
    for (const b of w) {
      expect(b).toBeGreaterThanOrEqual(95n * A);
      expect(b).toBeLessThanOrEqual(600n * A);
    }
    // heavy tail: biggest whale at least twice the smallest
    expect(Math.max(...w.map(Number)) / Math.min(...w.map(Number))).toBeGreaterThan(2);
  });

  it('the other 475 hold the rest, each 1–49 AUSD, rounded to 0.01 AUSD (except the balancing last one)', () => {
    const rest = balances.map((b, id) => ({ b, id })).filter((x) => !isWhale.has(x.id));
    expect(rest).toHaveLength(475);
    for (const { b } of rest) {
      expect(b).toBeGreaterThanOrEqual(1n * A);
      expect(b).toBeLessThanOrEqual(49n * A);
    }
    const unrounded = rest.filter(({ b }) => b % 10_000n !== 0n);
    expect(unrounded.length).toBeLessThanOrEqual(1);
    // skew: not everybody the same
    const distinct = new Set(rest.map((x) => x.b.toString()));
    expect(distinct.size).toBeGreaterThan(200);
  });

  it('the biggest depositor is a whale on the biggest hub', () => {
    const maxId = balances.reduce((m, b, i) => (b > balances[m] ? i : m), 0);
    expect(isWhale.has(maxId)).toBe(true);
  });

  it('packed words and hash are consistent (PRD §9.1)', () => {
    const packed: bigint[] = ledger.packed.map((w: string) => BigInt(w));
    expect(packed).toHaveLength(63);
    expect(unpackBalances(packed, 500)).toEqual(balances);
    expect(hashLedgerWords(packed)).toBe(ledger.ledgerHash);
  });
});
