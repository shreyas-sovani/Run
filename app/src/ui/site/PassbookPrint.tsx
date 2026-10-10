import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { PATHS } from '@/app/store';
import { Stamp } from '@/ui/brand';
import { copy } from '@/ui/copy';
import { fmtSeconds, fmtUsdScaled } from '@/ui/format';
import type { HeroFigures } from './landingModel';
import s from './PassbookPrint.module.css';

/** One printed line every PRINT_STEP_MS; the stamp lands after the last one. Matches the CSS animation timing. */
const PRINT_STEP_MS = 480;
const PRINT_START_MS = 250;
const STAMP_AFTER_MS = 450;

/**
 * The hero: a passbook page that prints the great bank runs one line at a time, ends with a run recorded on Monad
 * testnet, and takes the BANK FAILED stamp. `hero` is `undefined` while the recording loads, `null` if none loaded.
 */
export function PassbookPrint(props: { hero: HeroFigures | null | undefined; reducedMotion: boolean }) {
  const { hero, reducedMotion } = props;
  const p = copy.landing.passbook;
  const [round, setRound] = useState(0);
  const [stampedRound, setStampedRound] = useState<number | null>(null);
  const stamped = hero != null && stampedRound === round;
  const ready = hero !== undefined;
  const lines = p.rows.length + 1;

  useEffect(() => {
    if (!hero) return;
    const t = window.setTimeout(
      () => setStampedRound(round),
      reducedMotion ? 0 : PRINT_START_MS + lines * PRINT_STEP_MS + STAMP_AFTER_MS,
    );
    return () => window.clearTimeout(t);
  }, [hero, reducedMotion, round, lines]);

  return (
    <figure className={s.book} data-reduced={reducedMotion || undefined}>
      <header className={s.head}>
        <span className={s.label}>{p.label}</span>
        <h2 className={s.title}>{p.title}</h2>
      </header>

      <div className={s.sheet} key={round}>
        <div className={s.table} role="table" aria-label={p.title}>
          <div className={`${s.row} ${s.cols}`} role="row">
            <span role="columnheader">{p.cols.year}</span>
            <span role="columnheader">{p.cols.bank}</span>
            <span role="columnheader" className={s.num}>
              {p.cols.out}
            </span>
            <span role="columnheader" className={s.num}>
              {p.cols.lasted}
            </span>
          </div>
          {ready
            ? p.rows.map((r, i) => (
                <div key={r.bank} className={`${s.row} ${s.entry}`} role="row" style={{ ['--i' as string]: i }}>
                  <span role="cell">{r.year}</span>
                  <span role="cell">{r.bank}</span>
                  <span role="cell" className={s.num}>
                    {r.out}
                  </span>
                  <span role="cell" className={s.num}>
                    {r.lasted}
                  </span>
                </div>
              ))
            : null}
          {ready ? (
            <div className={`${s.row} ${s.entry} ${s.ours}`} role="row" style={{ ['--i' as string]: p.rows.length }}>
              <span role="cell">{hero?.year ?? ''}</span>
              <span role="cell">{p.ours}</span>
              <span role="cell" className={s.num}>
                {hero ? fmtUsdScaled(hero.withdrawn) : ''}
              </span>
              <span role="cell" className={s.num}>
                {hero ? fmtSeconds(hero.wallMs) : p.oursPending}
              </span>
            </div>
          ) : null}
          {/* Empty ruled lines so the page has its full height before anything prints. */}
          {Array.from({ length: ready ? 3 : lines + 3 }, (_, i) => (
            <div key={`blank-${i}`} className={`${s.row} ${s.blank}`} aria-hidden="true" />
          ))}
        </div>
        {hero ? (
          <div className={s.stamp}>
            <Stamp
              kind="failed"
              headline={copy.stamp.failed.headline}
              marathi={copy.stamp.failed.marathi}
              play={stamped}
              shake={false}
              size="clamp(36px, 3.9vw, 68px)"
              reducedMotion={reducedMotion}
            />
          </div>
        ) : null}
      </div>

      <figcaption className={s.foot}>
        {hero ? (
          <p>
            {p.note(hero.blocks)} <Link href={PATHS.replay(hero.id)}>{p.open}</Link>
          </p>
        ) : null}
        <p className={s.source}>
          {p.source}
          {hero && !reducedMotion ? (
            <button type="button" className={s.reprint} onClick={() => setRound((n) => n + 1)}>
              {p.reprint}
            </button>
          ) : null}
        </p>
      </figcaption>
    </figure>
  );
}
