// Pure maths for the network canvas and the passbook. No DOM, no React: unit-tested in canvasMath.test.ts.

export type Rgb = readonly [number, number, number];

export interface Fit {
  /** Side of the square the graph is drawn into, in CSS px. */
  side: number;
  /** Top-left corner of that square inside the canvas box. */
  x: number;
  y: number;
}

/** Letterbox a square graph into a w × h box with an inset, keeping the aspect ratio (PRD D-01). */
export function fitSquare(w: number, h: number, inset = 0): Fit {
  const side = Math.max(0, Math.min(w, h) - inset * 2);
  return { side, x: (w - side) / 2, y: (h - side) / 2 };
}

/** Radius ∝ √balance (whales visibly big), floored so the smallest depositor stays visible. */
export function nodeRadii(balances: readonly bigint[], side: number): Float32Array {
  const out = new Float32Array(balances.length);
  let max = 0;
  const asNum = new Float64Array(balances.length);
  for (let i = 0; i < balances.length; i++) {
    asNum[i] = Number(balances[i]);
    if (asNum[i] > max) max = asNum[i];
  }
  const rMax = side * 0.034;
  const rMin = Math.max(2.4, side * 0.0046);
  const k = max > 0 ? rMax / Math.sqrt(max) : 0;
  for (let i = 0; i < balances.length; i++) out[i] = Math.max(rMin, Math.sqrt(asNum[i]) * k);
  return out;
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpRgb(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

export function easeInQuad(t: number): number {
  const u = clamp01(t);
  return u * u;
}

/** Parses `#rrggbb` (what a canvas context hands back for an opaque colour) into 0–255 channels. */
export function parseHex(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

export function rgba(c: Rgb, a: number): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;
}

/** Point on a quadratic bezier. */
export function quadAt(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

/**
 * Which neighbour did the rumor travel along to reach `node`? The earliest-heard neighbour that heard strictly
 * before it; if none did (same tick), the earliest-heard one at all. -1 when nobody nearby has heard.
 */
export function rumorSource(node: number, neighbors: readonly number[], heardAt: ArrayLike<number>): number {
  const mine = heardAt[node];
  let best = -1;
  let bestAt = Infinity;
  let tie = -1;
  for (const n of neighbors) {
    const at = heardAt[n];
    if (at < 0 || n === node) continue;
    if (at < mine && at < bestAt) {
      best = n;
      bestAt = at;
    } else if (at === mine && tie < 0) {
      tie = n;
    }
  }
  return best >= 0 ? best : tie;
}

// ── Passbook (log time scale) ────────────────────────────────────────────────

/** Upper end of the log axis: a little past the longest bar (16 days). */
export const AXIS_MAX_SECONDS = 2_000_000;

/** Position 0–1 of a duration on a log axis from 1 s to AXIS_MAX_SECONDS. */
export function logPosition(seconds: number, max = AXIS_MAX_SECONDS): number {
  if (!Number.isFinite(seconds) || seconds <= 1) return 0;
  return clamp01(Math.log10(seconds) / Math.log10(max));
}

/** Where the axis ticks (1 s, 1 min, 1 h, 1 day, 1 week) sit on that axis. */
export const AXIS_TICK_SECONDS = [1, 60, 3_600, 86_400, 604_800] as const;

/** Bar width fraction: 0 s still gets a visible sliver, so a 5 s run is never invisible. */
export function barFraction(seconds: number, minFraction = 0.02): number {
  return Math.max(minFraction, logPosition(seconds));
}
