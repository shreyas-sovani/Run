import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface G {
  version: number;
  nodes: { id: number; x: number; y: number; degree: number; whale: boolean }[];
  edges: [number, number][];
  neighbors: number[][];
}
const g: G = JSON.parse(readFileSync(fileURLToPath(new URL('./data/graph.json', import.meta.url)), 'utf8'));

describe('data/graph.json (PRD §10.1)', () => {
  it('is the real generated graph (v1+)', () => {
    expect(g.version).toBeGreaterThanOrEqual(1);
  });

  it('has 500 nodes and about 1,000 + 100 whale edges, no self-loops or duplicates', () => {
    expect(g.nodes).toHaveLength(500);
    expect(g.edges.length).toBeGreaterThanOrEqual(1000);
    expect(g.edges.length).toBeLessThanOrEqual(1120);
    const seen = new Set<string>();
    for (const [a, b] of g.edges) {
      expect(a).toBeLessThan(b);
      const k = `${a}:${b}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('is preferential-attachment shaped: a few big hubs, a long tail of degree-2 nodes', () => {
    const deg = g.nodes.map((n) => n.degree).sort((a, b) => b - a);
    expect(deg[0]).toBeGreaterThanOrEqual(30);
    const lowCount = deg.filter((d) => d <= 3).length;
    expect(lowCount).toBeGreaterThan(250);
    expect(Math.min(...deg)).toBeGreaterThanOrEqual(2);
  });

  it('is connected', () => {
    const seen = new Set([0]);
    const q = [0];
    for (let h = 0; h < q.length; h++) for (const k of g.neighbors[q[h]]) if (!seen.has(k)) { seen.add(k); q.push(k); }
    expect(seen.size).toBe(500);
  });

  it('has 25 whales, all among the 30 highest-degree nodes, each with ≥ 4 whale neighbours (the VC group chat)', () => {
    const whales = g.nodes.filter((n) => n.whale);
    expect(whales).toHaveLength(25);
    const top30 = new Set([...g.nodes].sort((a, b) => b.degree - a.degree || a.id - b.id).slice(0, 30).map((n) => n.id));
    for (const w of whales) {
      expect(top30.has(w.id)).toBe(true);
      expect(g.neighbors[w.id].filter((k) => g.nodes[k].whale).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('layout is normalised to [0,1]² with ~3% padding and nodes do not stack', () => {
    const xs = g.nodes.map((n) => n.x);
    const ys = g.nodes.map((n) => n.y);
    expect(Math.min(...xs)).toBeCloseTo(0.03, 2);
    expect(Math.max(...xs)).toBeCloseTo(0.97, 2);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0.029);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.971);
    // no two nodes closer than 0.4% of the canvas
    let close = 0;
    for (let i = 0; i < 500; i++) for (let j = i + 1; j < 500; j++) {
      if (Math.hypot(g.nodes[i].x - g.nodes[j].x, g.nodes[i].y - g.nodes[j].y) < 0.004) close += 1;
    }
    expect(close).toBe(0);
  });
});
