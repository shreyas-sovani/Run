// B-03: depositor ledger generator (PRD §9.1). `pnpm gen:ledger`
// 25 whales (graph.json) hold ≈ 4,750 AUSD (95–600 each, Pareto-like); 475 others hold ≈ 4,750 AUSD (1–49 each,
// log-normal). Everything is rounded to 0.01 AUSD and the total is exactly 9,500 AUSD. Seeded; never Math.random.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { N_DEPOSITORS, hashLedgerWords, packBalances, unpackBalances } from '../src/engine/ledger';

const SEED = 0x1ed6e4;
const CENT = 10_000n; // 0.01 AUSD in base units (6 dp)
const TOTAL_CENTS = 950_000; // 9,500 AUSD
const WHALE_TOTAL_CENTS = 475_000; // 4,750 AUSD

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const normal = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

/** Scale `raw` so it sums to `total` while every entry stays in [lo, hi] (water-filling), then round to integers exactly. */
function allocate(raw: number[], total: number, lo: number, hi: number): number[] {
  const out = raw.slice();
  const fixed = new Array<boolean>(raw.length).fill(false);
  for (let iter = 0; iter < 200; iter++) {
    let fixedSum = 0;
    let freeRaw = 0;
    for (let i = 0; i < raw.length; i++) {
      if (fixed[i]) fixedSum += out[i];
      else freeRaw += raw[i];
    }
    const k = (total - fixedSum) / freeRaw;
    let changed = false;
    for (let i = 0; i < raw.length; i++) {
      if (fixed[i]) continue;
      out[i] = raw[i] * k;
      if (out[i] < lo) { out[i] = lo; fixed[i] = true; changed = true; }
      else if (out[i] > hi) { out[i] = hi; fixed[i] = true; changed = true; }
    }
    if (!changed) break;
  }
  const ints = out.map((v) => Math.min(hi, Math.max(lo, Math.round(v))));
  let residual = total - ints.reduce((a, b) => a + b, 0);
  const idx = ints.map((_, i) => i).sort((a, b) => ints[b] - ints[a] || a - b);
  for (let guard = 0; residual !== 0 && guard < 100000; guard++) {
    const i = idx[guard % idx.length];
    const step = residual > 0 ? 1 : -1;
    if (ints[i] + step >= lo && ints[i] + step <= hi) { ints[i] += step; residual -= step; }
  }
  if (residual !== 0) throw new Error('allocate: cannot reach total within bounds');
  return ints;
}

const graph = JSON.parse(readFileSync(fileURLToPath(new URL('../src/engine/data/graph.json', import.meta.url)), 'utf8')) as {
  nodes: { id: number; degree: number; whale: boolean }[];
};
if (graph.nodes.length !== N_DEPOSITORS) throw new Error('graph.json must have 500 nodes');
const whales = graph.nodes.filter((n) => n.whale);
const others = graph.nodes.filter((n) => !n.whale);

// whales: Pareto(α = 1.4, xm = 95 AUSD), clamped to 95–600
const whaleCents = allocate(
  whales.map(() => 9_500 * Math.pow(1 - rnd(), -1 / 1.4)),
  WHALE_TOTAL_CENTS, 9_500, 60_000,
).sort((a, b) => b - a);
// biggest balances sit on the biggest hubs (with a little noise so it is not a strict ranking)
const rankKey = new Map(whales.map((w) => [w.id, w.degree * (0.8 + 0.4 * rnd())]));
const whaleOrder = [...whales].sort((a, b) => rankKey.get(b.id)! - rankKey.get(a.id)! || a.id - b.id);

// others: log-normal (σ = 0.8), clamped to 1–49 AUSD
const otherCents = allocate(
  others.map(() => Math.exp(0.8 * normal())),
  TOTAL_CENTS - WHALE_TOTAL_CENTS, 100, 4_900,
);

const cents = new Array<number>(N_DEPOSITORS).fill(0);
whaleOrder.forEach((w, i) => (cents[w.id] = whaleCents[i]));
others.forEach((o, i) => (cents[o.id] = otherCents[i]));
const balances = cents.map((c) => BigInt(c) * CENT);

// self-check (PRD §9.1)
const packed = packBalances(balances);
if (unpackBalances(packed, N_DEPOSITORS).some((b, i) => b !== balances[i])) throw new Error('pack/unpack mismatch');
const deposits0 = balances.reduce((a, b) => a + b, 0n);
if (deposits0 !== 9_500_000_000n) throw new Error(`total ${deposits0}`);

writeFileSync(
  fileURLToPath(new URL('../src/engine/data/ledger.json', import.meta.url)),
  JSON.stringify({
    version: 1,
    count: N_DEPOSITORS,
    balances: balances.map(String),
    packed: packed.map(String),
    deposits0: String(deposits0),
    ledgerHash: hashLedgerWords(packed),
  }, null, 1) + '\n',
);

const wb = whales.map((w) => Number(balances[w.id]) / 1e6).sort((a, b) => b - a);
const ob = others.map((o) => Number(balances[o.id]) / 1e6).sort((a, b) => b - a);
console.log(`whales ${wb.length}: ${wb[wb.length - 1].toFixed(2)}–${wb[0].toFixed(2)} AUSD, sum ${wb.reduce((a, b) => a + b, 0).toFixed(2)}`);
console.log(`others ${ob.length}: ${ob[ob.length - 1].toFixed(2)}–${ob[0].toFixed(2)} AUSD, sum ${ob.reduce((a, b) => a + b, 0).toFixed(2)}, median ${ob[ob.length >> 1].toFixed(2)}`);
console.log('total', Number(deposits0) / 1e6, 'AUSD · ledgerHash', hashLedgerWords(packed));
