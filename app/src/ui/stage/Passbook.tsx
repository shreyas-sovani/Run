// The comparison passbook (D-07): ruled rows, Doto entries, bars on a LOG time scale. Rises from the bottom.
import { uiActions, useRunView, useUi } from '@/app/store';
import { Button } from '@/ui/brand';
import { fmtSeconds, fmtUsdScaled } from '@/ui/format';
import { AXIS_TICK_SECONDS, barFraction, logPosition } from './canvasMath';
import { PASSBOOK_SECONDS, S } from './stageCopy';
import styles from './Passbook.module.css';

export function Passbook() {
  const open = useUi((u) => u.passbookOpen);
  const outcome = useRunView((v) => v.outcome);
  const level = useRunView((v) => v.level);
  const mode = useRunView((v) => v.mode);

  const rows = S.passbookRows();
  const ticks = S.axisTicks();
  const seconds = outcome?.wallMs !== null && outcome?.wallMs !== undefined ? outcome.wallMs / 1000 : null;
  const simulated = outcome ? !outcome.sealed && mode === 'practice' : false;

  return (
    <section
      className={`${styles.book} ${open ? styles.open : ''}`}
      aria-label={S.passbookTitle()}
      aria-hidden={!open}
      inert={!open}
    >
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>{S.passbookTitle()}</h2>
          <p className={styles.sub}>
            {S.passbookSub()} · {S.logScale()} · {S.scaleNote()}
          </p>
        </div>
        <Button kind="secondary" hotkey={S.key.passbook} onClick={() => uiActions.togglePassbook(false)}>
          {S.close()}
        </Button>
      </header>

      <ol className={styles.grid}>
        {rows.map((r, i) => (
          <li key={r.name} className={styles.row}>
            <div className={styles.who}>
              <span className={styles.name}>{r.name}</span>
              {r.note ? <span className={styles.note}>{r.note}</span> : null}
            </div>
            <span className={styles.dots}>{r.amount}</span>
            <span className={styles.dots}>{r.duration}</span>
            <div className={styles.track}>
              <div className={styles.bar} style={{ width: `${barFraction(PASSBOOK_SECONDS[i]) * 100}%` }} />
            </div>
          </li>
        ))}

        <li className={`${styles.row} ${styles.mine} ${outcome ? (outcome.kind === 'failed' ? styles.failed : styles.survived) : ''}`}>
          <div className={styles.who}>
            <span className={styles.name}>{S.bankName(level)}</span>
            <span className={styles.note}>
              {outcome
                ? [
                    outcome.kind === 'failed' ? S.failedAfter() : S.survivedAfter(),
                    simulated ? S.simulatedNote() : outcome.blocks !== null ? S.blocksNote(outcome.blocks) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : S.noRunYet()}
            </span>
          </div>
          <span className={styles.dots}>{outcome ? fmtUsdScaled(outcome.withdrawnAmount) : '—'}</span>
          <span className={styles.dots}>{seconds !== null ? fmtSeconds(seconds * 1000) : '—'}</span>
          <div className={styles.track}>
            {seconds !== null ? <div className={styles.bar} style={{ width: `${barFraction(seconds) * 100}%` }} /> : null}
          </div>
        </li>

        <li className={styles.axisRow} aria-hidden>
          <span />
          <span />
          <span />
          <div className={styles.axis}>
            {AXIS_TICK_SECONDS.map((s, i) => (
              <span key={s} className={styles.tick} style={{ left: `${logPosition(s) * 100}%` }}>
                {ticks[i]}
              </span>
            ))}
          </div>
        </li>
      </ol>
    </section>
  );
}
