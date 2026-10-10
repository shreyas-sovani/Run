// The outcome sequence (D-06): "Sealing the verdict…" freeze → E's Stamp + thud + shake → passbook 400 ms later.
// The stamp waits for Monad: in Live/Spectate/Replay it shows only when `outcome.sealed` is true.
import { useEffect, useRef } from 'react';
import { uiActions, useRunView, useUi } from '@/app/store';
import { Stamp, sfx } from '@/ui/brand';
import { fmtSeconds } from '@/ui/format';
import { S } from './stageCopy';
import styles from './OutcomeLayer.module.css';

const PASSBOOK_DELAY_MS = 400;
const PASSBOOK_FALLBACK_MS = 1200; // if the stamp never reports an impact (reduced motion), still open the passbook

export function OutcomeLayer({ onShake }: { onShake(): void }) {
  const phase = useRunView((v) => v.phase);
  const mode = useRunView((v) => v.mode);
  const outcome = useRunView((v) => v.outcome);
  const tick = useRunView((v) => v.frame?.tick ?? 0);
  const reduced = useUi((u) => u.reducedMotion);
  const docked = useUi((u) => u.passbookOpen);

  const stampShown = outcome !== null && (mode === 'practice' || outcome.sealed);
  const verdict = (phase === 'failing' || phase === 'surviving') && !stampShown;

  const timers = useRef<number[]>([]);
  const impacted = useRef(false);
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => {
    if (!stampShown) {
      impacted.current = false;
      return;
    }
    impacted.current = false;
    timers.current.push(
      window.setTimeout(() => {
        if (impacted.current) return;
        sfx.thud();
        uiActions.togglePassbook(true);
      }, PASSBOOK_FALLBACK_MS),
    );
    return clearTimers;
  }, [stampShown, outcome]);

  const onImpact = () => {
    if (impacted.current) return;
    impacted.current = true;
    clearTimers();
    sfx.thud();
    if (!reduced) onShake();
    timers.current.push(window.setTimeout(() => uiActions.togglePassbook(true), PASSBOOK_DELAY_MS));
  };

  let sub = '';
  if (outcome) {
    sub = outcome.sealed
      ? S.stampSub(outcome.kind, outcome.wallMs, outcome.blocks)
      : S.sublineSim(outcome.tick);
  }

  return (
    <>
      {verdict ? (
        <div className={styles.freeze} role="status">
          <p className={styles.verdict}>{S.verdict()}</p>
          <p className={styles.waiting}>{mode === 'practice' ? S.verdictWaitingSim() : S.verdictWaiting(tick)}</p>
        </div>
      ) : null}

      {stampShown && outcome ? (
        <div className={`${styles.stampLayer} ${docked ? styles.docked : ''}`}>
          <Stamp
            kind={outcome.kind}
            headline={outcome.kind === 'failed' ? S.headlineFailed() : S.headlineSurvived()}
            subline={sub}
            marathi={outcome.kind === 'failed' ? S.marathiFailed() : undefined}
            play
            shake={false}
            reducedMotion={reduced ? true : undefined}
            onImpact={onImpact}
          />
        </div>
      ) : null}

      <p className={styles.announce} role="status" aria-live="polite">
        {outcome
          ? outcome.kind === 'failed'
            ? S.outcomeAnnounceFailed(fmtSeconds(outcome.wallMs ?? 0))
            : S.outcomeAnnounceSurvived(fmtSeconds(outcome.wallMs ?? 0))
          : ''}
      </p>
    </>
  );
}
