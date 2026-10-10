import { describe, expect, it } from 'vitest';
import { foldSeed, u } from './prng';

describe('u(seed, a, b, c)', () => {
  it('is always in [0, 1)', () => {
    for (let i = 0; i < 20000; i++) {
      const v = u(i * 31, i, i * 7, i * 13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is pure: same inputs, same output, regardless of call order', () => {
    const a = [u(1, 2, 3, 4), u(5, 6, 7, 8), u(1, 2, 3, 4)];
    expect(a[2]).toBe(a[0]);
    const x = u(5, 6, 7, 8);
    u(9, 9, 9, 9);
    expect(u(5, 6, 7, 8)).toBe(x);
  });

  it('depends on every argument and on their order', () => {
    const base = u(1, 2, 3, 4);
    expect(u(2, 2, 3, 4)).not.toBe(base);
    expect(u(1, 3, 3, 4)).not.toBe(base);
    expect(u(1, 2, 4, 4)).not.toBe(base);
    expect(u(1, 2, 3, 5)).not.toBe(base);
    expect(u(1, 3, 2, 4)).not.toBe(base);
  });

  it('is roughly uniform (10 buckets within 15% of expected over 50k draws)', () => {
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 50000; i++) buckets[Math.floor(u(12345, i, 0, 1) * 10)] += 1;
    for (const c of buckets) expect(Math.abs(c - 5000)).toBeLessThan(750);
  });

  it('has no obvious correlation between adjacent ids', () => {
    let both = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (u(7, i, 0, 1) < 0.5 && u(7, i + 1, 0, 1) < 0.5) both += 1;
    expect(Math.abs(both / n - 0.25)).toBeLessThan(0.02);
  });

  it('stays pinned: fixed inputs give fixed outputs (browser-independent)', () => {
    expect([u(0, 0, 0, 0), u(1, 2, 3, 4), u(0xdeadbeef, 499, 499, 1), u(-1, -2, -3, -4)]).toMatchInlineSnapshot(`
      [
        0.21822303580120206,
        0.028886182932183146,
        0.13306546863168478,
        0.6466624361928552,
      ]
    `);
  });
});

describe('foldSeed', () => {
  it('folds a bigint to a stable 32-bit integer', () => {
    expect(foldSeed(1n)).toBe(foldSeed(1n));
    expect(foldSeed(1n)).not.toBe(foldSeed(2n));
    const big = foldSeed((1n << 63n) + 12345n);
    expect(Number.isInteger(big)).toBe(true);
    expect(big).toBeGreaterThanOrEqual(0);
    expect(big).toBeLessThan(2 ** 32);
  });
});
