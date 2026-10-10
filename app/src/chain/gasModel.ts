// Placeholder from F-00. Owner: A. Replace freely.
export const calibrated = false;

/** Generous fallback formula: base + per-tick + per-id. A replaces with fitted constants. */
export function gasLimitFor(ticks: number[][]): bigint {
  const ids = ticks.reduce((n, t) => n + t.length, 0);
  return BigInt(200_000 + ticks.length * 60_000 + ids * 25_000);
}
