// The vault (D-02): a vertical stacked bar (cash solid, bonds hatched, fire-sale loss sliding out to Street),
// the figures, the status lamp, and the one-shot vermilion flash + alarm when cash first reaches zero.
import { forwardRef, useEffect, useRef, useState } from 'react';
import { getRunView, subscribeRunView, useRunView } from '@/app/store';
import { sfx } from '@/ui/brand';
import { fmtAusd, fmtBps, fmtUsdScaled } from '@/ui/format';
import type { RunPhase } from '@/types';
import { S } from './stageCopy';
import styles from './VaultPanel.module.css';

const LAMP: Record<RunPhase, string> = {
  idle: styles.lampOpen,
  switching: styles.lampBusy,
  starting: styles.lampBusy,
  running: styles.lampRun,
  failing: styles.lampRun,
  surviving: styles.lampRun,
  failed: styles.lampFailed,
  survived: styles.lampSurvived,
  resetting: styles.lampBusy,
  paused: styles.lampBusy,
};

const pct = (part: bigint, whole: bigint): number => (whole > 0n ? Number((part * 10_000n) / whole) / 100 : 0);

export const VaultPanel = forwardRef<HTMLElement>(function VaultPanel(_props, ref) {
  const phase = useRunView((v) => v.phase);
  const mode = useRunView((v) => v.mode);
  const bank = useRunView((v) => v.frame?.bank ?? null);
  const cfg = useRunView((v) => v.model?.configs[v.level] ?? null);
  const held = useRunView((v) => (v.mode !== 'practice' && v.onchain ? v.onchain.ausdHeld : null));

  const assets0 = cfg ? cfg.cash0 + cfg.bonds0 : 0n;
  const cash = bank ? bank.cash : (cfg?.cash0 ?? 0n);
  const bonds = bank ? bank.bonds : (cfg?.bonds0 ?? 0n);
  const loss = bank ? bank.cumulativeLoss : 0n;
  const paid = bank ? bank.deposits0 - bank.depositsOwed : 0n;
  const haircutBps = bank ? bank.lastHaircutBps : (cfg?.haircutBaseBps ?? 0);

  // Loss slices: each fire sale slides a vermilion chunk out of the bar toward Street.
  const prevLoss = useRef(0n);
  const sliceId = useRef(0);
  const [slice, setSlice] = useState<{ id: number; heightPct: number } | null>(null);
  useEffect(() => {
    if (loss > prevLoss.current && assets0 > 0n) {
      sliceId.current += 1;
      setSlice({ id: sliceId.current, heightPct: Math.max(1.5, pct(loss - prevLoss.current, assets0)) });
    } else if (loss === 0n) {
      setSlice(null);
    }
    prevLoss.current = loss;
  }, [loss, assets0]);

  // Cash hits zero: one vermilion flash of the frame and the alarm, until the outcome.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    let alarmOn = false;
    const check = () => {
      const v = getRunView();
      const b = v.frame?.bank;
      const zero = !!b && b.tick > 0 && b.cash === 0n && v.outcome === null;
      if (zero && !alarmOn) {
        alarmOn = true;
        sfx.alarm(true);
        setFlash(true);
      } else if (!zero && alarmOn) {
        alarmOn = false;
        sfx.alarm(false);
      }
      if (!b || b.tick === 0) setFlash((f) => (f ? false : f));
    };
    check();
    const off = subscribeRunView(check);
    return () => {
      off();
      if (alarmOn) sfx.alarm(false);
    };
  }, []);

  const remainPct = pct(cash + bonds, assets0);
  const cashPct = pct(cash, assets0);
  const bondsPct = pct(bonds, assets0);
  const lossPct = pct(loss, assets0);
  const title = mode === 'practice' ? S.vaultTitleSim() : S.vaultTitleOnchain();

  return (
    <section ref={ref} className={`${styles.vault} ${flash ? styles.flash : ''}`} aria-labelledby="vault-title">
      <header className={styles.head}>
        <h2 id="vault-title" className={styles.title}>
          {title}
        </h2>
        <p className={`${styles.lamp} ${LAMP[phase]}`} role="status">
          <span className={styles.lampDot} aria-hidden />
          {S.phase(phase)}
        </p>
      </header>

      <div className={styles.body}>
        <div className={styles.stack} role="img" aria-label={S.vaultBarLabel(fmtAusd(cash), fmtAusd(bonds), fmtAusd(loss))}>
          <div className={styles.bar}>
            <div className={styles.bonds} style={{ height: `${bondsPct}%` }} />
            <div className={styles.cash} style={{ height: `${cashPct}%` }} />
          </div>
          {slice ? (
            <div
              key={slice.id}
              className={styles.slice}
              style={{ bottom: `${remainPct}%`, height: `${slice.heightPct}%` }}
              aria-hidden
            />
          ) : null}
          <div className={styles.street}>
            <div className={styles.streetFill} style={{ height: `${lossPct}%` }} />
            <span className={styles.streetLabel}>{S.street()}</span>
          </div>
        </div>

        <dl className={styles.figures}>
          <div className={`${styles.fig} ${styles.wide}`}>
            <dt>{S.cash()}</dt>
            <dd className={styles.big}>
              {fmtAusd(cash)} <span className={styles.usd}>{fmtUsdScaled(cash)}</span>
            </dd>
          </div>
          <div className={`${styles.fig} ${styles.wide}`}>
            <dt>{S.bonds()}</dt>
            <dd className={styles.big}>
              {fmtAusd(bonds)} <span className={styles.usd}>{fmtUsdScaled(bonds)}</span>
            </dd>
          </div>
          <div className={`${styles.fig} ${styles.lossFig}`}>
            <dt>{S.loss()}</dt>
            <dd className={styles.mid}>{fmtAusd(loss)}</dd>
            <dd className={styles.usd}>{fmtUsdScaled(loss)}</dd>
          </div>
          <div className={styles.fig}>
            <dt>{S.outTheDoor()}</dt>
            <dd className={styles.mid}>{fmtAusd(paid)}</dd>
            <dd className={styles.usd}>{fmtUsdScaled(paid)}</dd>
          </div>
        </dl>
      </div>

      <footer className={styles.foot}>
        <p className={styles.held}>
          {held !== null ? S.heldOnchain(fmtAusd(held)) : mode === 'practice' ? S.heldSim() : mode === 'replay' ? S.heldReplay() : ''}
        </p>
        <p className={styles.scale}>
          {S.haircut()} {fmtBps(haircutBps)} · {S.scaleNote()}
        </p>
      </footer>
    </section>
  );
});
