// The network canvas (D-01). React mounts it once; a requestAnimationFrame loop reads `getRunView()` and paints.
// Nothing here re-renders per frame: the only React state is the aria-label, which changes at phase boundaries.
import { useEffect, useRef, type RefObject } from 'react';
import { getRunView, useRunView, useUi } from '@/app/store';
import { parseHex, type Rgb } from './canvasMath';
import { NetworkRenderer, type Palette } from './networkRenderer';
import { S } from './stageCopy';
import styles from './NetworkCanvas.module.css';

/** Reads one CSS custom property and normalises it to channels through the canvas itself (no colour literals in TS). */
function readToken(el: Element, ctx: CanvasRenderingContext2D, name: string): Rgb {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  ctx.fillStyle = raw;
  const parsed = parseHex(String(ctx.fillStyle));
  if (!parsed && import.meta.env.DEV) console.warn(`NetworkCanvas: token ${name} did not resolve to an opaque colour`);
  return parsed ?? [0, 0, 0];
}

function readPalette(el: Element, canvas: HTMLCanvasElement): Palette {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const t = (n: string) => readToken(el, ctx, n);
  return { ink: t('--ink'), seal: t('--seal'), rumor: t('--rumor'), run: t('--run'), trapped: t('--trapped'), paper: t('--paper') };
}

interface Props {
  /** The vault column: withdrawal particles fly to its near edge. */
  targetRef: RefObject<HTMLElement | null>;
}

export function NetworkCanvas({ targetRef }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedUi = useUi((u) => u.reducedMotion);
  const reducedRef = useRef(reducedUi);
  useEffect(() => {
    reducedRef.current = reducedUi;
  }, [reducedUi]);

  const label = useRunView((v) => {
    const total = v.model?.graph.nodes.length ?? 0;
    if (v.outcome) return S.canvasAriaOutcome(v.frame?.bank.withdrawnCount ?? 0, total, v.outcome.trappedCount);
    if (v.phase === 'idle' || v.frame === null) return S.canvasAriaIdle(total);
    return S.phase(v.phase);
  });

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;

    const getTarget = (): readonly [number, number] | null => {
      const t = targetRef.current?.getBoundingClientRect();
      if (!t || t.width === 0) return null;
      const c = canvas.getBoundingClientRect();
      if (t.left >= c.right - 4) return [t.left - c.left, Math.min(Math.max(t.top + t.height * 0.4, c.top), c.bottom) - c.top];
      return [Math.min(Math.max(t.left + t.width / 2, c.left), c.right) - c.left, t.top - c.top];
    };
    const renderer = new NetworkRenderer(canvas, {
      palette: readPalette(box, canvas),
      getTarget,
      reduced: () => reducedRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });

    const size = () => {
      const r = box.getBoundingClientRect();
      renderer.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, 2));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);

    let raf = 0;
    const loop = (now: number) => {
      renderer.tick(now, getRunView());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [targetRef]);

  return (
    <div ref={boxRef} className={styles.box}>
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />
    </div>
  );
}
