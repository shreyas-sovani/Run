// B-02: depositor graph generator (PRD §10.1). `pnpm gen:graph [--preview /tmp/graph.png]`
// Seeded Barabási–Albert (m = 2, N = 500); 25 whales on the highest-degree nodes + 4 extra whale↔whale edges each;
// d3-force layout normalised to [0.03, 0.97]². Offline script: may use anything (Math.sqrt etc.), never Math.random.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { Resvg } from '@resvg/resvg-js';

const N = 500;
const M = 2;
const WHALES = 25;
const EXTRA_WHALE_EDGES = 4;
const SEED = 0x5eed01;
const PAD = 0.03;

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);

// ── Barabási–Albert ──
const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const edgeSet = new Set<string>();
const edges: [number, number][] = [];
const addEdge = (a: number, b: number): boolean => {
  if (a === b || edgeSet.has(edgeKey(a, b))) return false;
  edgeSet.add(edgeKey(a, b));
  edges.push(a < b ? [a, b] : [b, a]);
  return true;
};
const repeated: number[] = []; // each node once per unit of degree
for (let a = 0; a <= M; a++) for (let b = a + 1; b <= M; b++) { addEdge(a, b); repeated.push(a, b); }
for (let v = M + 1; v < N; v++) {
  const targets = new Set<number>();
  while (targets.size < M) targets.add(repeated[Math.floor(rnd() * repeated.length)]);
  for (const t of targets) { addEdge(v, t); repeated.push(v, t); }
}

// ── whales: 25 highest-degree nodes (ties → lower id) ──
const degree0 = new Array<number>(N).fill(0);
for (const [a, b] of edges) { degree0[a] += 1; degree0[b] += 1; }
const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => degree0[b] - degree0[a] || a - b);
const whaleIds = order.slice(0, WHALES);
const isWhale = new Set(whaleIds);
for (const w of whaleIds) {
  let added = 0;
  let guard = 0;
  while (added < EXTRA_WHALE_EDGES && guard++ < 1000) {
    const other = whaleIds[Math.floor(rnd() * WHALES)];
    if (addEdge(w, other)) added += 1;
  }
}
edges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

const neighbors: number[][] = Array.from({ length: N }, () => []);
for (const [a, b] of edges) { neighbors[a].push(b); neighbors[b].push(a); }
for (const l of neighbors) l.sort((a, b) => a - b);

// ── d3-force layout ──
interface SimNode extends SimulationNodeDatum { id: number }
const simNodes: SimNode[] = Array.from({ length: N }, (_, id) => ({ id, x: (rnd() - 0.5) * 400, y: (rnd() - 0.5) * 400 }));
const links: SimulationLinkDatum<SimNode>[] = edges.map(([source, target]) => ({ source, target }));
const hubR = (id: number) => (isWhale.has(id) ? 10 : 3.5 + Math.sqrt(neighbors[id].length));
const P = {
  dist: Number(process.env.G_DIST ?? 22),
  charge: Number(process.env.G_CHARGE ?? 30),
  center: Number(process.env.G_CENTER ?? 0.012),
};
const sim = forceSimulation(simNodes)
  // default link strength 1/min(degree): leaf edges are rigid, hub-to-hub edges are slack
  .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance((l) => {
    const a = (l.source as SimNode).id;
    const b = (l.target as SimNode).id;
    return P.dist + 3 * Math.sqrt(Math.min(neighbors[a].length, neighbors[b].length) * Math.max(neighbors[a].length, neighbors[b].length) / 4);
  }))
  .force('charge', forceManyBody<SimNode>().strength((d) => -P.charge * (1 + 0.35 * Math.sqrt(neighbors[d.id].length))).distanceMax(500))
  .force('x', forceX<SimNode>(0).strength(P.center))
  .force('y', forceY<SimNode>(0).strength(P.center))
  .force('collide', forceCollide<SimNode>().radius((d) => hubR(d.id)).strength(0.9))
  .stop();
for (let i = 0; i < 500; i++) sim.tick();

const xs = simNodes.map((n) => n.x!);
const ys = simNodes.map((n) => n.y!);
const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const norm = (v: number, lo: number, hi: number) => PAD + ((v - lo) / (hi - lo)) * (1 - 2 * PAD);
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const nodes = simNodes.map((n, id) => ({
  id,
  x: round4(norm(n.x!, x0, x1)),
  y: round4(norm(n.y!, y0, y1)),
  degree: neighbors[id].length,
  whale: isWhale.has(id),
}));

const out = fileURLToPath(new URL('../src/engine/data/graph.json', import.meta.url));
writeFileSync(out, JSON.stringify({ version: 1, nodes, edges, neighbors }, null, 1) + '\n');

const deg = nodes.map((n) => n.degree).sort((a, b) => b - a);
const wd = nodes.filter((n) => n.whale).map((n) => n.degree);
console.log(`nodes ${N}, edges ${edges.length}, max degree ${deg[0]}, median ${deg[N >> 1]}, whale degree ${Math.min(...wd)}–${Math.max(...wd)}`);

// ── optional preview PNG ──
const pi = process.argv.indexOf('--preview');
if (pi > 0) {
  const W = 1280;
  const H = 800;
  const px = (n: { x: number }) => (n.x * W).toFixed(1);
  const py = (n: { y: number }) => (n.y * H).toFixed(1);
  const lines = edges.map(([a, b]) => `<line x1="${px(nodes[a])}" y1="${py(nodes[a])}" x2="${px(nodes[b])}" y2="${py(nodes[b])}"/>`).join('');
  const dots = nodes.map((n) => `<circle cx="${px(n)}" cy="${py(n)}" r="${n.whale ? 9 : 2 + Math.sqrt(n.degree) * 0.6}" fill="${n.whale ? '#C8341C' : '#172033'}" fill-opacity="${n.whale ? 0.85 : 0.9}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#E4ECE6"/><g stroke="#172033" stroke-opacity="0.12" stroke-width="1">${lines}</g>${dots}</svg>`;
  writeFileSync(process.argv[pi + 1], new Resvg(svg).render().asPng());
  console.log('preview →', process.argv[pi + 1]);
}
