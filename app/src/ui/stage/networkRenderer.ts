// Canvas 2D renderer for the 500-depositor network (PRD §13.5, §14.3, §14.6).
// Not React: NetworkCanvas owns one instance and calls `tick(now, view)` from requestAnimationFrame.
// The renderer diffs `frame.nodeState` / `frame.heardAt` against what it last drew instead of trusting
// `frame.newly*`, so replay and spectate joins (several ticks landing in one store update) look right too.
import { NodeState } from '@/types';
import type { BankLevel, Model, RunView } from '@/types';
import {
  type Fit,
  type Rgb,
  clamp01,
  easeInQuad,
  easeOutCubic,
  fitSquare,
  lerp,
  nodeRadii,
  quadAt,
  rgba,
  rumorSource,
} from './canvasMath';

export interface Palette {
  ink: Rgb;
  seal: Rgb;
  rumor: Rgb;
  run: Rgb;
  trapped: Rgb;
  paper: Rgb;
}

export interface RendererOptions {
  palette: Palette;
  /** Where withdrawal particles fly to, in this canvas's CSS px; null when the vault isn't laid out. */
  getTarget(): readonly [number, number] | null;
  /** Reduced motion: no particles, no ripples, instant state changes. Read every frame. */
  reduced(): boolean;
}

const N_FIELDS = 12; // fill rgb(3) fillA stroke rgb(3) strokeA lw scale crossA
const F_FILL = 0;
const F_FILL_A = 3;
const F_STROKE = 4;
const F_STROKE_A = 7;
const F_LW = 8;
const F_SCALE = 9;
const F_CROSS = 10;

const TRANSITION_MS = 250;
const RIPPLE_MS = 600;
const PARTICLE_MS = 620;
const MAX_PARTICLES = 220;
const MAX_RIPPLES = 160;
const SNAP_TICK_JUMP = 3;
const PULSE_MS = 760;

interface Ripple { node: number; edgeFrom: number; t0: number }
interface Particle { node: number; t0: number; delay: number; lift: number }

export interface RendererStats {
  heard: number;
  withdrawn: number;
  trapped: number;
  total: number;
}

export class NetworkRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly edgeLayer: HTMLCanvasElement;
  private opts: RendererOptions;

  private model: Model | null = null;
  private level: BankLevel = 0;
  private n = 0;
  private px = new Float32Array(0);
  private py = new Float32Array(0);
  private radius: Float32Array = new Float32Array(0);
  private order = new Uint16Array(0);
  private insured = new Uint8Array(0);

  private w = 0;
  private h = 0;
  private dpr = 1;
  private fit: Fit = { side: 0, x: 0, y: 0 };

  private state = new Uint8Array(0);
  private heard = new Int16Array(0);
  private from = new Float32Array(0);
  private to = new Float32Array(0);
  private t0 = new Float64Array(0);
  private lastTick = -1;
  private initialised = false;

  private ripples: Ripple[] = [];
  private particles: Particle[] = [];
  private panicking = 0;
  private transitioning = 0;
  private dirty = true;

  private readonly targets: Float32Array[];

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.opts = opts;
    this.edgeLayer = document.createElement('canvas');
    this.targets = this.buildTargets();
  }

  setOptions(opts: RendererOptions): void {
    this.opts = opts;
    this.dirty = true;
  }

  // ── Static setup ───────────────────────────────────────────────────────────
  private buildTargets(): Float32Array[] {
    const p = this.opts.palette;
    const mk = (fill: Rgb, fillA: number, stroke: Rgb, strokeA: number, lw: number, scale: number, crossA: number) => {
      const a = new Float32Array(N_FIELDS);
      a.set(fill, F_FILL);
      a[F_FILL_A] = fillA;
      a.set(stroke, F_STROKE);
      a[F_STROKE_A] = strokeA;
      a[F_LW] = lw;
      a[F_SCALE] = scale;
      a[F_CROSS] = crossA;
      return a;
    };
    const t: Float32Array[] = [];
    t[NodeState.Calm] = mk(p.ink, 0.82, p.ink, 0, 0, 0.92, 0);
    t[NodeState.Heard] = mk(p.paper, 1, p.rumor, 1, 0.42, 1.12, 0);
    t[NodeState.Panicking] = mk(p.run, 1, p.run, 1, 0.1, 1.22, 0);
    t[NodeState.Queued] = mk(p.paper, 1, p.run, 1, 0.4, 1.12, 0);
    t[NodeState.Withdrawn] = mk(p.paper, 1, p.ink, 0.55, 0.28, 0.96, 0);
    t[NodeState.Trapped] = mk(p.trapped, 0, p.trapped, 0, 0, 1, 1);
    return t;
  }

  private setModel(model: Model): void {
    this.model = model;
    const nodes = model.graph.nodes;
    this.n = nodes.length;
    this.state = new Uint8Array(this.n);
    this.heard = new Int16Array(this.n).fill(-1);
    this.from = new Float32Array(this.n * N_FIELDS);
    this.to = new Float32Array(this.n * N_FIELDS);
    this.t0 = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) this.writeTarget(i, NodeState.Calm, true);
    this.ripples = [];
    this.particles = [];
    this.lastTick = -1;
    this.initialised = false;
    this.layout();
    this.refreshInsured();
  }

  private refreshInsured(): void {
    if (!this.model) return;
    const cap = this.model.configs[this.level].insuredCap;
    const bal = this.model.ledger.balances;
    this.insured = new Uint8Array(this.n);
    if (cap > 0n) for (let i = 0; i < this.n; i++) this.insured[i] = bal[i] <= cap ? 1 : 0;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.w = Math.max(1, cssW);
    this.h = Math.max(1, cssH);
    this.dpr = dpr;
    this.layout();
  }

  private layout(): void {
    if (!this.model || this.w <= 0) return;
    const canvas = this.ctx.canvas;
    canvas.width = Math.round(this.w * this.dpr);
    canvas.height = Math.round(this.h * this.dpr);
    this.fit = fitSquare(this.w, this.h, 14);
    const nodes = this.model.graph.nodes;
    this.px = new Float32Array(this.n);
    this.py = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.px[i] = this.fit.x + nodes[i].x * this.fit.side;
      this.py[i] = this.fit.y + nodes[i].y * this.fit.side;
    }
    this.radius = nodeRadii(this.model.ledger.balances, this.fit.side);
    const idx = Array.from({ length: this.n }, (_, i) => i).sort((a, b) => this.radius[a] - this.radius[b]);
    this.order = Uint16Array.from(idx);
    this.paintEdges();
    this.dirty = true;
  }

  /** Static edges cached on an offscreen canvas (ink at ~8%); redrawn only on resize. */
  private paintEdges(): void {
    if (!this.model) return;
    const layer = this.edgeLayer;
    layer.width = Math.round(this.w * this.dpr);
    layer.height = Math.round(this.h * this.dpr);
    const g = layer.getContext('2d');
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.strokeStyle = rgba(this.opts.palette.ink, 0.085);
    g.lineWidth = 1;
    g.beginPath();
    for (const [a, b] of this.model.graph.edges) {
      g.moveTo(this.px[a], this.py[a]);
      g.lineTo(this.px[b], this.py[b]);
    }
    g.stroke();
  }

  // ── Per-node style transitions ─────────────────────────────────────────────
  private writeTarget(i: number, st: number, snap: boolean, now = 0): void {
    const base = i * N_FIELDS;
    const tgt = this.targets[st];
    if (snap) {
      this.from.set(tgt, base);
    } else {
      this.currentStyle(i, now, this.from, base);
    }
    this.to.set(tgt, base);
    this.t0[i] = now;
  }

  private currentStyle(i: number, now: number, out: Float32Array, outBase: number): void {
    const base = i * N_FIELDS;
    const p = easeOutCubic((now - this.t0[i]) / TRANSITION_MS);
    for (let f = 0; f < N_FIELDS; f++) out[outBase + f] = lerp(this.from[base + f], this.to[base + f], p);
  }

  // ── Diff the store's frame against what we last drew ──────────────────────
  private sync(now: number, view: RunView): void {
    if (view.model && view.model !== this.model) this.setModel(view.model);
    if (!this.model) return;
    if (view.level !== this.level) {
      this.level = view.level;
      this.refreshInsured();
      this.dirty = true;
    }
    const reduced = this.opts.reduced();
    const frame = view.frame;

    if (!frame) {
      if (this.initialised && this.lastTick !== -1) {
        this.state.fill(NodeState.Calm);
        this.heard.fill(-1);
        for (let i = 0; i < this.n; i++) this.writeTarget(i, NodeState.Calm, true);
        this.ripples = [];
        this.particles = [];
        this.lastTick = -1;
        this.dirty = true;
      }
      this.initialised = true;
      return;
    }

    const join = !this.initialised || frame.tick < this.lastTick || frame.tick - this.lastTick > SNAP_TICK_JUMP;
    const quiet = join || reduced;
    if (join && this.lastTick !== -1) {
      this.ripples = [];
      this.particles = [];
    }
    let target: readonly [number, number] | null | undefined;
    let spawned = 0;

    for (let i = 0; i < this.n; i++) {
      const next = frame.nodeState[i] as number;
      const prev = this.state[i];
      const heardAt = frame.heardAt[i];
      const newlyHeard = heardAt >= 0 && this.heard[i] < 0;
      if (newlyHeard) {
        this.heard[i] = heardAt;
        if (!quiet && this.ripples.length < MAX_RIPPLES) {
          const src = rumorSource(i, this.model.graph.neighbors[i], frame.heardAt);
          this.ripples.push({ node: i, edgeFrom: src, t0: now });
        }
      } else if (heardAt < 0 && this.heard[i] >= 0) {
        this.heard[i] = -1;
      }
      if (next === prev) continue;
      this.state[i] = next;
      this.writeTarget(i, next, quiet, now);
      this.dirty = true;
      if (!quiet && next === NodeState.Withdrawn && this.particles.length < MAX_PARTICLES) {
        if (target === undefined) target = this.opts.getTarget();
        if (target) {
          const h = ((i * 2654435761) >>> 0) % 1000;
          this.particles.push({ node: i, t0: now, delay: (h / 1000) * 300 + (spawned % 6) * 20, lift: (h % 2 === 0 ? -1 : 1) * (14 + (h % 40)) });
          spawned++;
        }
      }
    }
    this.lastTick = frame.tick;
    this.initialised = true;
  }

  // ── Frame ──────────────────────────────────────────────────────────────────
  /** Called once per animation frame. Cheap when nothing is changing: it returns without painting. */
  tick(now: number, view: RunView): void {
    this.sync(now, view);
    if (!this.model || this.w <= 0) return;
    const reduced = this.opts.reduced();

    this.transitioning = 0;
    this.panicking = 0;
    for (let i = 0; i < this.n; i++) {
      if (now - this.t0[i] < TRANSITION_MS) this.transitioning++;
      if (this.state[i] === NodeState.Panicking) this.panicking++;
    }
    this.ripples = this.ripples.filter((r) => now - r.t0 < RIPPLE_MS);
    this.particles = this.particles.filter((p) => now - p.t0 < p.delay + PARTICLE_MS);

    const animating =
      this.transitioning > 0 || this.ripples.length > 0 || this.particles.length > 0 || (this.panicking > 0 && !reduced);
    if (!this.dirty && !animating) return;
    this.dirty = false;
    this.paint(now, reduced);
  }

  private paint(now: number, reduced: boolean): void {
    const g = this.ctx;
    const pal = this.opts.palette;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.drawImage(this.edgeLayer, 0, 0, this.w, this.h);

    // Rumor travelling along an edge: a line that grows from the source, fading over 600 ms.
    if (this.ripples.length > 0) {
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      for (const r of this.ripples) {
        if (r.edgeFrom < 0) continue;
        const p = (now - r.t0) / RIPPLE_MS;
        const head = easeOutCubic(Math.min(1, p * 2.2));
        const ax = this.px[r.edgeFrom];
        const ay = this.py[r.edgeFrom];
        g.strokeStyle = rgba(pal.rumor, 0.9 * (1 - clamp01(p)));
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(lerp(ax, this.px[r.node], head), lerp(ay, this.py[r.node], head));
        g.stroke();
      }
    }

    const style = new Float32Array(N_FIELDS);
    const cap = this.level === 1;
    for (let k = 0; k < this.n; k++) {
      const i = this.order[k];
      this.currentStyle(i, now, style, 0);
      const x = this.px[i];
      const y = this.py[i];
      const r = this.radius[i] * style[F_SCALE];
      const st = this.state[i];

      if (cap && this.insured[i] === 1 && st !== NodeState.Withdrawn && st !== NodeState.Trapped) {
        g.strokeStyle = rgba(pal.seal, 0.8);
        g.lineWidth = 1.3;
        g.beginPath();
        g.arc(x, y, r + 3.2, 0, Math.PI * 2);
        g.stroke();
      }
      if (st === NodeState.Queued) {
        g.strokeStyle = rgba(pal.run, 0.75);
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(x + r, y);
        g.lineTo(x + r + Math.max(8, r * 2.6), y);
        g.stroke();
      }
      if (st === NodeState.Panicking && !reduced) {
        const ph = (now / PULSE_MS + i * 0.37) % 1;
        g.strokeStyle = rgba(pal.run, 0.5 * (1 - ph));
        g.lineWidth = 1.6;
        g.beginPath();
        g.arc(x, y, r + 1 + ph * (3 + r * 0.9), 0, Math.PI * 2);
        g.stroke();
      }

      if (style[F_FILL_A] > 0.004 || style[F_STROKE_A] > 0.004) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        if (style[F_FILL_A] > 0.004) {
          g.fillStyle = rgba([style[F_FILL], style[F_FILL + 1], style[F_FILL + 2]], style[F_FILL_A]);
          g.fill();
        }
        if (style[F_STROKE_A] > 0.004 && style[F_LW] > 0.01) {
          g.strokeStyle = rgba([style[F_STROKE], style[F_STROKE + 1], style[F_STROKE + 2]], style[F_STROKE_A]);
          g.lineWidth = Math.max(1.4, r * style[F_LW]);
          g.stroke();
        }
      }
      if (style[F_CROSS] > 0.004) {
        const c = Math.max(3.2, r * 0.8);
        g.strokeStyle = rgba(pal.trapped, style[F_CROSS]);
        g.lineWidth = Math.max(2, r * 0.3);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x - c, y - c);
        g.lineTo(x + c, y + c);
        g.moveTo(x + c, y - c);
        g.lineTo(x - c, y + c);
        g.stroke();
      }
    }

    // Amber ring from the node that just heard.
    if (this.ripples.length > 0) {
      g.lineWidth = 2.4;
      for (const rp of this.ripples) {
        const p = (now - rp.t0) / RIPPLE_MS;
        const e = easeOutCubic(p);
        g.strokeStyle = rgba(pal.rumor, 0.85 * (1 - clamp01(p)));
        g.beginPath();
        g.arc(this.px[rp.node], this.py[rp.node], this.radius[rp.node] + 3 + e * this.fit.side * 0.05, 0, Math.PI * 2);
        g.stroke();
      }
    }

    // Withdrawals fly to the vault column.
    if (this.particles.length > 0) {
      const tgt = this.opts.getTarget();
      if (tgt) {
        for (const pt of this.particles) {
          const p = (now - pt.t0 - pt.delay) / PARTICLE_MS;
          if (p < 0) continue;
          const e = easeInQuad(p);
          const x0 = this.px[pt.node];
          const y0 = this.py[pt.node];
          const [x, y] = quadAt([x0, y0], [(x0 + tgt[0]) / 2, (y0 + tgt[1]) / 2 + pt.lift], [tgt[0], tgt[1]], e);
          g.fillStyle = rgba(pal.run, 1 - 0.6 * clamp01(p) * clamp01(p));
          g.beginPath();
          g.arc(x, y, 3.6 - 1.2 * e, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  /** Counts for the canvas's aria-label. */
  stats(view: RunView): RendererStats {
    const f = view.frame;
    const total = this.n || view.model?.graph.nodes.length || 0;
    if (!f) return { heard: 0, withdrawn: 0, trapped: 0, total };
    let heard = 0;
    let withdrawn = 0;
    let trapped = 0;
    for (let i = 0; i < f.nodeState.length; i++) {
      if (f.heardAt[i] >= 0) heard++;
      if (f.nodeState[i] === NodeState.Withdrawn) withdrawn++;
      if (f.nodeState[i] === NodeState.Trapped) trapped++;
    }
    return { heard, withdrawn, trapped, total };
  }

  /** Forces a repaint on the next frame (reduced-motion toggles, palette changes). */
  invalidate(): void {
    this.dirty = true;
  }
}
