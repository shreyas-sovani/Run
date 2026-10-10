import { animate } from 'motion';
import { useEffect, useId, useRef } from 'react';
import { copy } from '@/ui/copy';
import s from './Stamp.module.css';

export interface StampProps {
  kind: 'failed' | 'survived';
  headline: string;
  subline?: string;
  /** Local-language line under the headline of the failed stamp ("बँक बुडाली"). */
  marathi?: string;
  /** Flip to `true` to slam the stamp; back to `false` to lift it. Flip again to replay. */
  play: boolean;
  /** Fires on the squash frame, the moment the rubber meets the paper. Play the thud here. */
  onImpact?: () => void;
  /** Additive: any CSS length for the headline size. Default `var(--fs-stamp)` (200 px at 1080p). */
  size?: string;
  /** Additive: shake the whole screen at impact (PRD §14.5). Default true. Skipped under reduced motion. */
  shake?: boolean;
  /** Additive: force reduced motion on or off. Default follows `prefers-reduced-motion`. */
  reducedMotion?: boolean;
}

const REST_ROTATE = -7;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * The violet rubber stamp (PRD §14.5). It waits for Monad: the caller flips `play` only when the verdict is sealed.
 * Failed: a rectangular double-bordered stamp. Survived: a round "PAID IN FULL"-style seal in the same ink.
 * Ink = SVG turbulence (rough edges + speckle), multiplied onto the paper.
 */
export function Stamp(props: StampProps) {
  const { kind, headline, subline, marathi, play, onImpact, size, shake = true } = props;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const filterId = `ink-${uid}`;
  const elRef = useRef<HTMLDivElement>(null);
  const impactRef = useRef(onImpact);
  impactRef.current = onImpact;

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (!play) {
      el.style.opacity = '0';
      el.style.transform = `rotate(${REST_ROTATE}deg)`;
      return;
    }
    const reduce = props.reducedMotion ?? prefersReducedMotion();
    let cancelled = false;
    const stops: { stop(): void }[] = [];
    const root = document.getElementById('root');

    const track = <T extends { stop(): void }>(c: T): T => {
      stops.push(c);
      return c;
    };

    const run = async () => {
      if (reduce) {
        // Reduced motion: no slam, no shake. Fade in at rest over 150 ms.
        el.style.transform = `rotate(${REST_ROTATE}deg)`;
        await track(animate(el, { opacity: [0, 1] }, { duration: 0.15, ease: 'linear' }));
        if (!cancelled) impactRef.current?.();
        return;
      }
      el.style.opacity = '0';
      track(animate(el, { opacity: [0, 1] }, { duration: 0.05, ease: 'linear' }));
      // 140 ms ease-in: scale 2.2 → 1, rotate −14° → −7°.
      await track(
        animate(
          el,
          { scale: [2.2, 1], rotate: [REST_ROTATE * 2, REST_ROTATE] },
          { duration: 0.14, ease: [0.5, 0, 0.9, 0.4] },
        ),
      );
      if (cancelled) return;
      // Impact: the squash frame, the thud and the shake all start together.
      impactRef.current?.();
      track(animate(el, { scale: [1, 0.98, 1] }, { duration: 0.12, ease: 'easeOut' }));
      if (shake && root) {
        const shaker = track(animate(root, { x: [0, -6, 6, -4, 3, -1, 0] }, { duration: 0.18, ease: 'linear' }));
        void Promise.resolve(shaker).then(() => {
          // An inline transform of any kind would turn #root into the containing block of fixed layers.
          root.style.transform = '';
        });
      }
    };
    void run();

    return () => {
      cancelled = true;
      stops.forEach((c) => c.stop());
      if (root) root.style.transform = '';
    };
    // props.reducedMotion is read once per play on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, kind, shake]);

  const label = [headline, subline].filter(Boolean).join(' ');
  return (
    <div
      className={`${s.root} ${kind === 'failed' ? s.failed : s.survived}`}
      style={{ fontSize: size ?? 'var(--fs-stamp)' }}
      role="img"
      aria-label={label || copy.stamp.aria[kind]}
      aria-hidden={play ? undefined : true}
      data-kind={kind}
      data-playing={play || undefined}
    >
      <InkFilter id={filterId} />
      <div ref={elRef} className={s.ink} style={{ filter: `url(#${filterId})`, opacity: 0, transform: `rotate(${REST_ROTATE}deg)` }}>
        {kind === 'failed' ? (
          <div className={s.rect}>
            <div className={s.rectInner}>
              <div className={s.headline}>{headline}</div>
              {marathi ? (
                <div className={s.marathi} lang="mr">
                  {marathi}
                </div>
              ) : null}
              {subline ? <div className={s.subline}>{subline}</div> : null}
            </div>
          </div>
        ) : (
          <RoundSeal headline={headline} subline={subline} ring={copy.stamp.survived.ring} />
        )}
      </div>
    </div>
  );
}

/** Rough edges (displacement) and ink speckle (a noise-thresholded alpha mask). */
function InkFilter({ id }: { id: string }) {
  return (
    <svg className={s.defs} width="0" height="0" aria-hidden="true" focusable="false">
      <filter id={id} x="-6%" y="-8%" width="112%" height="116%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="11" result="warp" />
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="7" xChannelSelector="R" yChannelSelector="G" result="rough" />
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="grain" />
        <feColorMatrix
          in="grain"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 -16 0 11.6"
          result="speckle"
        />
        <feComposite in="rough" in2="speckle" operator="in" />
      </filter>
    </svg>
  );
}

function RoundSeal(props: { headline: string; subline?: string; ring: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const top = `top-${uid}`;
  const bottom = `bot-${uid}`;
  // The lower arc has room for about 19 characters at full size; longer lines shrink to fit.
  const bottomSize = Math.max(18, Math.min(34, (34 * 19) / Math.max(1, props.subline?.length ?? 1)));
  return (
    <svg className={s.round} viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      <defs>
        {/* Top text runs clockwise over the crown; bottom text runs counter-clockwise under the base. */}
        <path id={top} d="M 70,200 a 130,130 0 1,1 260,0" />
        <path id={bottom} d="M 48,200 a 152,152 0 0,0 304,0" />
      </defs>
      <circle cx="200" cy="200" r="188" className={s.ringOuter} />
      <circle cx="200" cy="200" r="170" className={s.ringThin} />
      <circle cx="200" cy="200" r="116" className={s.ringThin} />
      <text className={s.ringText}>
        <textPath href={`#${top}`} startOffset="50%" textAnchor="middle">
          {props.ring}
        </textPath>
      </text>
      {props.subline ? (
        <text className={s.ringText} style={{ fontSize: `${bottomSize}px`, letterSpacing: `${bottomSize * 0.16}px` }}>
          <textPath href={`#${bottom}`} startOffset="50%" textAnchor="middle">
            {props.subline}
          </textPath>
        </text>
      ) : null}
      <Star cx={57} cy={200} />
      <Star cx={343} cy={200} />
      <text className={s.sealHead} x="200" y="224" textAnchor="middle" textLength="196" lengthAdjust="spacingAndGlyphs">
        {props.headline}
      </text>
    </svg>
  );
}

function Star({ cx, cy }: { cx: number; cy: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 10 : 4.2;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return <polygon points={pts} className={s.star} />;
}
