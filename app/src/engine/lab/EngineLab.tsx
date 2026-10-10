// B-10: /lab/engine. Tune the model by eye: pick a bank and a rumor, step or auto-run, see the graph by node state,
// the bank's cash / bonds / loss per tick, and the tuner's pass/fail table. Not part of the stage; no chain involved.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NodeState } from '@/types';
import type { BankLevel, RumorCard, RunState, SimFrame } from '@/types';
import { TICK_MS, createRun, defaultParams, loadModel, stepRun } from '@/engine';
import { checkStory, checkTargets, evaluateAll } from '../eval';

const model = loadModel();
const W = 720;
const H = 520;
const COLORS: Record<number, string> = {
  [NodeState.Calm]: '#c9c2b0',
  [NodeState.Heard]: '#e0a526',
  [NodeState.Panicking]: '#d6401f',
  [NodeState.Queued]: '#7a4fbf',
  [NodeState.Withdrawn]: '#2a8a5a',
  [NodeState.Trapped]: '#44505c',
};
const NAMES = ['Calm', 'Heard', 'Panicking', 'Queued', 'Withdrawn', 'Trapped'];
const AUSD = 1_000_000;

function drawGraph(ctx: CanvasRenderingContext2D, f: SimFrame) {
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [a, b] of model.graph.edges) {
    const na = model.graph.nodes[a];
    const nb = model.graph.nodes[b];
    ctx.moveTo(na.x * W, na.y * H);
    ctx.lineTo(nb.x * W, nb.y * H);
  }
  ctx.stroke();
  for (const n of model.graph.nodes) {
    const s = f.nodeState[n.id];
    const bal = Number(model.ledger.balances[n.id]) / AUSD;
    const r = 2 + Math.min(9, bal / 60) + (n.whale ? 1.5 : 0);
    ctx.beginPath();
    ctx.arc(n.x * W, n.y * H, r, 0, Math.PI * 2);
    if (s === NodeState.Withdrawn) {
      ctx.strokeStyle = COLORS[s];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS[s] ?? '#000';
      ctx.fill();
    }
  }
}

function Chart({ frames }: { frames: SimFrame[] }) {
  const w = 420;
  const h = 160;
  const max = Number(model.configs[0].cash0 + model.configs[0].bonds0) / AUSD;
  const line = (pick: (f: SimFrame) => bigint, color: string) => {
    const pts = frames.map((f, i) => `${(i / Math.max(1, Math.max(frames.length - 1, 20))) * w},${h - (Number(pick(f)) / AUSD / max) * h}`);
    return <polyline key={color} fill="none" stroke={color} strokeWidth={2} points={pts.join(' ')} />;
  };
  return (
    <svg width={w} height={h} style={{ background: '#f6f2e8', border: '1px solid #ccc' }}>
      {line((f) => f.bank.cash, '#2a8a5a')}
      {line((f) => f.bank.bonds, '#3a6ea5')}
      {line((f) => f.bank.cumulativeLoss * 10n, '#d6401f')}
      <text x={6} y={14} fontSize={11}>cash (green) · bonds (blue) · loss ×10 (red); 0–{max} AUSD</text>
    </svg>
  );
}

export function EngineLab() {
  const [level, setLevel] = useState<BankLevel>(0);
  const [card, setCard] = useState<RumorCard>(1);
  const [run, setRun] = useState<RunState>(() => createRun(model, defaultParams(model, 0, 1)));
  const [frames, setFrames] = useState<SimFrame[]>(() => [run.frame]);
  const [auto, setAuto] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  const reset = (l: BankLevel, c: RumorCard) => {
    const r = createRun(model, defaultParams(model, l, c));
    setRun(r);
    setFrames([r.frame]);
    setAuto(false);
  };
  const step = () => {
    if (run.frame.bank.status !== 'running') return;
    const s = stepRun(model, run);
    setRun(s.run);
    setFrames((fs) => [...fs, s.run.frame]);
  };

  useEffect(() => {
    if (!auto) return;
    if (run.frame.bank.status !== 'running') {
      setAuto(false);
      return;
    }
    const id = setTimeout(step, TICK_MS);
    return () => clearTimeout(id);
  });
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawGraph(ctx, run.frame);
  }, [run]);

  const rows = useMemo(() => evaluateAll(model), []);
  const violations = useMemo(() => [...checkTargets(rows), ...checkStory(rows)], [rows]);
  const f = run.frame;
  const counts = NAMES.map((_, s) => f.nodeState.filter((x) => x === s).length);

  return (
    <div style={{ padding: 16, fontFamily: 'ui-monospace, monospace', fontSize: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: '0 0 8px', fontSize: 16 }}>Engine lab · {model.modelVersion} · {model.modelHash.slice(0, 10)}</h1>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {([0, 1] as const).map((l) => (
            <button key={l} onClick={() => { setLevel(l); reset(l, card); }} style={{ fontWeight: level === l ? 700 : 400 }}>
              {l === 0 ? "Bhau's Bank" : 'Monad Mutual'}
            </button>
          ))}
          {([0, 1, 2, 3] as const).map((c) => (
            <button key={c} onClick={() => { setCard(c); reset(level, c); }} style={{ fontWeight: card === c ? 700 : 400 }}>
              {model.cards[c].hotkey} {model.cards[c].strength}
            </button>
          ))}
          <button onClick={step}>Step</button>
          <button onClick={() => setAuto((a) => !a)}>{auto ? 'Pause' : 'Auto'}</button>
          <button onClick={() => reset(level, card)}>Reset</button>
        </div>
        <canvas ref={canvas} width={W} height={H} style={{ background: '#f6f2e8', border: '1px solid #ccc' }} />
        <div>
          tick {f.tick} · {f.bank.status} · cash {(Number(f.bank.cash) / AUSD).toFixed(0)} · bonds {(Number(f.bank.bonds) / AUSD).toFixed(0)} · loss{' '}
          {(Number(f.bank.cumulativeLoss) / AUSD).toFixed(0)} · haircut {f.bank.lastHaircutBps} bps · queue {f.bank.queue.length} · requested this tick{' '}
          {f.newlyRequested.length}
        </div>
        <div>
          {NAMES.map((n, i) => (
            <span key={n} style={{ marginRight: 12, color: COLORS[i] }}>● {n} {counts[i]}</span>
          ))}
        </div>
        <Chart frames={frames} />
      </div>
      <div>
        <h2 style={{ fontSize: 14 }}>Targets (PRD §10.4 + demo guard rails)</h2>
        <table cellPadding={3} style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['bank', 'card', 'outcome', 'tick', 'sec', 'heard%', 'asked%', 'whales%', 'peak', 'queue', 'loss/eq%', 'trapped'].map((h) => <th key={h} align="left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.level}${r.card}`}>
                <td>{r.level === 0 ? "Bhau's" : 'Mutual'}</td><td>{'QWER'[r.card]}</td><td>{r.outcome}</td><td>{r.tick}</td><td>{r.seconds.toFixed(1)}</td>
                <td>{r.heardPct.toFixed(0)}</td><td>{r.requestedPct.toFixed(0)}</td><td>{r.whalesOutPct.toFixed(0)}</td><td>{r.peakRequests}</td>
                <td>{r.peakQueue}</td><td>{r.lossPctOfEquity.toFixed(0)}</td><td>{r.trapped}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: violations.length ? '#d6401f' : '#2a8a5a' }}>
          {violations.length === 0 ? 'All targets pass.' : violations.map((v) => `${v.row.level === 0 ? "Bhau's" : 'Mutual'} × ${'QWER'[v.row.card]}: ${v.rule}`).join(' | ')}
        </p>
      </div>
    </div>
  );
}
