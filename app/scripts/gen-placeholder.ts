// B-00: writes v0 placeholder data so A, C, D and F can run before the real model exists.
// Run: pnpm tsx scripts/gen-placeholder.ts. Superseded by gen-graph.ts / gen-ledger.ts (v1).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { N_DEPOSITORS, hashLedgerWords, packBalances } from '../src/engine/ledger';

const dataDir = fileURLToPath(new URL('../src/engine/data/', import.meta.url));
mkdirSync(dataDir, { recursive: true });
const write = (f: string, v: unknown) => writeFileSync(dataDir + f, JSON.stringify(v, null, 1) + '\n');

// seeded RNG for the generator only (never used at runtime)
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0xb100d);

// ── ledger v0: 500 × 19 AUSD ──
const balances = Array.from({ length: N_DEPOSITORS }, () => 19_000_000n);
const packed = packBalances(balances);
write('ledger.json', {
  version: 0,
  count: N_DEPOSITORS,
  balances: balances.map(String),
  packed: packed.map(String),
  deposits0: String(balances.reduce((a, b) => a + b, 0n)),
  ledgerHash: hashLedgerWords(packed),
});

// ── configs (PRD §9.2) ──
const base = { cash0: '1500000000', bonds0: '8500000000', haircutBaseBps: 200, haircutSlopeBps: 6000, haircutMaxBps: 9000, quietTicks: 8 };
write('configs.json', {
  '0': { ...base, speedBumpBps: 0, insuredCap: '0' },
  '1': { ...base, speedBumpBps: 300, insuredCap: '50000000' },
});

// ── graph v0: jittered grid, ring + random edges ──
const N = N_DEPOSITORS;
const edgeSet = new Set<string>();
const edges: [number, number][] = [];
const add = (a: number, b: number) => {
  if (a === b) return;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const k = `${lo}:${hi}`;
  if (edgeSet.has(k)) return;
  edgeSet.add(k);
  edges.push([lo, hi]);
};
for (let i = 0; i < N; i++) {
  add(i, (i + 1) % N);
  add(i, Math.floor(rnd() * N));
  if (rnd() < 0.5) add(i, Math.floor(rnd() * N));
}
edges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
const neighbors: number[][] = Array.from({ length: N }, () => []);
for (const [a, b] of edges) {
  neighbors[a].push(b);
  neighbors[b].push(a);
}
for (const l of neighbors) l.sort((a, b) => a - b);
const byDegree = Array.from({ length: N }, (_, i) => i).sort((a, b) => neighbors[b].length - neighbors[a].length || a - b);
const whales = new Set(byDegree.slice(0, 25));
const cols = 25;
const rows = 20;
const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));
const nodes = Array.from({ length: N }, (_, id) => ({
  id,
  x: Number(clamp((id % cols + 0.5 + (rnd() - 0.5) * 0.7) / cols).toFixed(4)),
  y: Number(clamp((Math.floor(id / cols) + 0.5 + (rnd() - 0.5) * 0.7) / rows).toFixed(4)),
  degree: neighbors[id].length,
  whale: whales.has(id),
}));
write('graph.json', { version: 0, nodes, edges, neighbors });

// ── cards (PRD §10.2; seed nodes provisional) ──
write('cards.json', [
  { id: 0, hotkey: 'Q', text: 'The CEO just bought a yacht.', strength: 0.4, seedNode: byDegree[Math.floor(N / 20)] },
  { id: 1, hotkey: 'W', text: 'The audit is *delayed*.', strength: 0.6, seedNode: byDegree[0] },
  { id: 2, hotkey: 'E', text: 'Heard the founder flew to Dubai.', strength: 0.8, seedNode: byDegree[1] },
  { id: 3, hotkey: 'R', text: 'Screenshot: the vault is empty.', strength: 1.0, seedNode: byDegree[0] },
]);
console.log('v0 data written to', dataDir);
