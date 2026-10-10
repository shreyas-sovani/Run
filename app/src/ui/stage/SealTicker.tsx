// The seal ticker (D-04): the latest 6 seals, newest first. Simulated seals never link anywhere.
import { uiActions, useRunView } from '@/app/store';
import { HealthChip, TxLink } from '@/ui/brand';
import { fmtBlock, fmtSealTime } from '@/ui/format';
import type { SealRecord } from '@/types';
import { S } from './stageCopy';
import styles from './SealTicker.module.css';

const SHOWN = 6;

/** MICR-styled "transit" mark (P2): inline SVG, so it never depends on a font having the glyph. */
function MicrMark() {
  return (
    <svg viewBox="0 0 14 18" className={styles.micr} aria-hidden focusable="false">
      <rect x="0" y="1" width="2.4" height="16" fill="currentColor" />
      <rect x="5" y="3" width="4" height="4" fill="currentColor" />
      <rect x="5" y="11" width="4" height="4" fill="currentColor" />
      <rect x="11.6" y="1" width="2.4" height="16" fill="currentColor" />
    </svg>
  );
}

function SealRow({ rec }: { rec: SealRecord }) {
  const parts: string[] = [];
  if (rec.status === 'pending') {
    parts.push(S.sealingTick(rec.fromTick ?? 0));
  } else {
    parts.push(
      rec.kind === 'ticks' && rec.fromTick !== null && rec.toTick !== null
        ? S.tickRange(rec.fromTick, rec.toTick)
        : S.sealKind(rec.kind),
    );
    if (rec.blockNumber !== null) parts.push(fmtBlock(rec.blockNumber));
    if (rec.kind === 'ticks' && rec.requestedCount !== null) parts.push(S.withdrew(rec.requestedCount));
    if (rec.sealedAtMs !== null) parts.push(S.sealedIn(fmtSealTime(rec.sealedAtMs - rec.sentAtMs)));
  }
  return (
    <>
      {parts.join(' · ')}
      {rec.status === 'sealed' ? (
        <>
          {' · '}
          <span className={styles.ok}>{rec.simulated ? S.simulatedSeal() : rec.finalized ? S.finalized() : S.finalizing()}</span>
          {!rec.simulated && rec.txHash ? (
            <>
              {' '}
              <TxLink hash={rec.txHash} />
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function SealTicker() {
  const seals = useRunView((v) => v.seals);
  const health = useRunView((v) => v.health);
  const sealedTick = useRunView((v) => v.sealedTick);
  const aheadOf = useRunView((v) => (v.phase === 'running' && v.frame && v.frame.tick > v.sealedTick ? v.sealedTick + 1 : null));

  const rows = seals.slice(-SHOWN).reverse();
  const onchainCount = seals.filter((r) => r.status === 'sealed' && !r.simulated && r.txHash !== null).length;
  const hasPendingRecord = rows.some((r) => r.status === 'pending');
  const delayed = health === 'delayed' || health === 'paused';

  return (
    <footer className={`${styles.ticker} ${delayed ? styles.delayed : ''}`} aria-label={S.tickerLabel()}>
      <h2 className={styles.label}>{health === 'paused' ? S.phase('paused') : delayed ? S.sealingDelayed() : S.tickerLabel()}</h2>
      {rows.length === 0 && aheadOf === null ? (
        <p className={styles.empty}>{S.tickerEmpty()}</p>
      ) : (
        <ol className={styles.rows} aria-live="off">
          {aheadOf !== null && !hasPendingRecord ? (
            <li className={`${styles.row} ${styles.pending}`}>{S.sealingTick(aheadOf)}</li>
          ) : null}
          {rows.map((rec, i) => (
            <li key={rec.id} className={`${styles.row} ${rec.status === 'pending' ? styles.pending : ''}`}>
              {i > 0 || aheadOf !== null ? <MicrMark /> : null}
              <SealRow rec={rec} />
            </li>
          ))}
        </ol>
      )}
      <div className={styles.health}>
        {onchainCount > 0 ? (
          <button type="button" className={styles.all} onClick={() => uiActions.toggleProof(true)} aria-keyshortcuts="P">
            {S.allTx(onchainCount)} <kbd aria-hidden="true">{S.key.proof}</kbd>
          </button>
        ) : null}
        <HealthChip health={health} sealedTick={sealedTick} blockNumber={null} />
      </div>
    </footer>
  );
}
