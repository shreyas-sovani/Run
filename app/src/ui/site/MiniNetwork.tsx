import { useEffect, useRef } from 'react';
import { NodeState } from '@/types';
import type { Model } from '@/types';
import s from './MiniNetwork.module.css';

function token(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

/**
 * A still of the depositor network at one tick, painted once (and again on resize). The node encoding matches the
 * stage (PRD §14.3): calm = filled dot, heard = amber ring, panicking = filled vermilion, queued = vermilion ring,
 * withdrew = hollow ring, trapped = slate ×. Radius grows with √balance.
 */
export function MiniNetwork(props: { model: Model; nodeState: Uint8Array; label: string }) {
  const { model, nodeState, label } = props;
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const nodes = model.graph.nodes;
    const balances = model.ledger.balances;
    let maxB = 1n;
    for (const b of balances) if (b > maxB) maxB = b;
    const order = nodes.map((n) => n.id).sort((a, b) => (balances[a] < balances[b] ? -1 : balances[a] > balances[b] ? 1 : 0));

    const paint = () => {
      const side = Math.floor(canvas.getBoundingClientRect().width);
      if (side <= 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(side * dpr);
      canvas.height = Math.round(side * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, side, side);
      const ink = token(canvas, '--ink', '#172033');
      const rumor = token(canvas, '--rumor', '#b86e00');
      const run = token(canvas, '--run', '#c8341c');
      const trapped = token(canvas, '--trapped', '#7d8a90');

      const pad = side * 0.05;
      const span = side - pad * 2;
      const px = (i: number) => pad + nodes[i].x * span;
      const py = (i: number) => pad + nodes[i].y * span;
      const maxR = side * 0.03;
      const minR = Math.max(1.2, side * 0.004);
      const radius = (i: number) => Math.max(minR, maxR * Math.sqrt(Number(balances[i]) / Number(maxB)));

      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (const [a, b] of model.graph.edges) {
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(b), py(b));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      for (const i of order) {
        const x = px(i);
        const y = py(i);
        const r = radius(i);
        const st = nodeState[i];
        ctx.beginPath();
        if (st === NodeState.Trapped) {
          const k = Math.max(1.6, r * 0.75);
          ctx.strokeStyle = trapped;
          ctx.lineWidth = Math.max(1, r * 0.3);
          ctx.moveTo(x - k, y - k);
          ctx.lineTo(x + k, y + k);
          ctx.moveTo(x + k, y - k);
          ctx.lineTo(x - k, y + k);
          ctx.stroke();
          continue;
        }
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (st === NodeState.Calm) {
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = ink;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (st === NodeState.Panicking) {
          ctx.fillStyle = run;
          ctx.fill();
        } else {
          ctx.strokeStyle = st === NodeState.Heard ? rumor : st === NodeState.Queued ? run : ink;
          ctx.globalAlpha = st === NodeState.Withdrawn ? 0.55 : 1;
          ctx.lineWidth = st === NodeState.Withdrawn ? 1 : Math.max(1.2, r * 0.38);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [model, nodeState]);

  return <canvas ref={ref} className={s.canvas} role="img" aria-label={label} />;
}
