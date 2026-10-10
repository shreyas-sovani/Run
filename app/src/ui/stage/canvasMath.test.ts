import { describe, expect, it } from 'vitest';
import {
  AXIS_TICK_SECONDS,
  barFraction,
  easeOutCubic,
  fitSquare,
  logPosition,
  nodeRadii,
  parseHex,
  quadAt,
  rumorSource,
} from './canvasMath';

describe('fitSquare', () => {
  it('letterboxes a wide box and centres the square', () => {
    const f = fitSquare(1200, 800);
    expect(f.side).toBe(800);
    expect(f.x).toBe(200);
    expect(f.y).toBe(0);
  });
  it('honours the inset and never goes negative', () => {
    expect(fitSquare(400, 300, 20).side).toBe(260);
    expect(fitSquare(10, 10, 20).side).toBe(0);
  });
});

describe('nodeRadii', () => {
  it('scales with the square root of the balance', () => {
    const r = nodeRadii([1_000_000n, 4_000_000n, 16_000_000n], 1000);
    expect(r[2] / r[1]).toBeCloseTo(2, 1);
    expect(r[1]).toBeGreaterThan(r[0]);
  });
  it('floors tiny balances and survives all zeros', () => {
    const r = nodeRadii([1n, 1_000_000_000_000n], 1000);
    expect(r[0]).toBeGreaterThanOrEqual(2.4);
    expect(nodeRadii([0n, 0n], 500)[0]).toBeGreaterThan(0);
  });
});

describe('colour helpers', () => {
  it('parses canvas hex output only', () => {
    expect(parseHex('#5b3fd6')).toEqual([91, 63, 214]);
    expect(parseHex('rgba(1,2,3,0.5)')).toBeNull();
  });
});

describe('easing and curves', () => {
  it('eases out to exactly 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
  it('quad bezier hits its endpoints', () => {
    expect(quadAt([0, 0], [5, 10], [10, 0], 0)).toEqual([0, 0]);
    expect(quadAt([0, 0], [5, 10], [10, 0], 1)).toEqual([10, 0]);
  });
});

describe('rumorSource', () => {
  const heardAt = Int16Array.from([2, 0, 1, -1, 2]);
  it('prefers the earliest neighbour that heard before the node', () => {
    expect(rumorSource(0, [1, 2, 3], heardAt)).toBe(1);
  });
  it('falls back to a same-tick neighbour, then to none', () => {
    expect(rumorSource(0, [4, 3], heardAt)).toBe(4);
    expect(rumorSource(0, [3], heardAt)).toBe(-1);
  });
});

describe('passbook log scale', () => {
  it('is monotonic across the axis ticks and stays within 0..1', () => {
    const pos = AXIS_TICK_SECONDS.map((s) => logPosition(s));
    for (let i = 1; i < pos.length; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1]);
    expect(pos[0]).toBe(0);
    expect(pos[pos.length - 1]).toBeLessThan(1);
  });
  it('keeps a 5 s run visible but far shorter than 1 day', () => {
    expect(barFraction(5.4)).toBeGreaterThan(0.05);
    expect(barFraction(5.4)).toBeLessThan(barFraction(86_400) / 2);
  });
  it('gives instant runs a sliver', () => {
    expect(barFraction(0)).toBe(0.02);
  });
});
