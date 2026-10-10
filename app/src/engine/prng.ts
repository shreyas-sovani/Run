// Deterministic hash RNG (PRD §10.3, B-01). Pure integer maths via Math.imul: identical in every browser.
// No Math.random anywhere in engine/.

function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h;
}

/** Uniform in [0, 1): a pure hash of four integers. */
export function u(seed: number, a: number, b: number, c: number): number {
  let h = mix32((seed | 0) ^ 0x9e3779b9);
  h = mix32(h ^ Math.imul(a | 0, 0xcc9e2d51));
  h = mix32(h ^ Math.imul(b | 0, 0x1b873593));
  h = mix32(h ^ Math.imul(c | 0, 0x27d4eb2f));
  return (h >>> 0) / 4294967296;
}

/** Fold a 64-bit modelSeed into the 32-bit seed `u` uses. Done once per run. */
export function foldSeed(modelSeed: bigint): number {
  const m = BigInt.asUintN(64, modelSeed);
  const lo = Number(m & 0xffffffffn);
  const hi = Number((m >> 32n) & 0xffffffffn);
  return (mix32(lo ^ mix32(hi ^ 0x7f4a7c15)) >>> 0);
}
