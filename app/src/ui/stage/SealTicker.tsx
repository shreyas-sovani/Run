// The seal ticker (D-04): the latest 6 seals, newest first. Simulated seals never link anywhere.
import { useRunView } from '@/app/store';
import { HealthChip, TxLink } from '@/ui/brand';
import { fmtBlock, fmtSealTime } from '@/ui/format';
import type { SealRecord } from '@/types';
import { S } from './stageCopy';
import styles from './SealTicker.module.css';

const SHOWN = 6;

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
  const block = useRunView((v) => v.blockNumber);
  const aheadOf = useRunView((v) => (v.phase === 'running' && v.frame && v.frame.tick > v.sealedTick ? v.sealedTick + 1 : null));

  const rows = seals.slice(-SHOWN).reverse();
  const hasPendingRecord = rows.some((r) => r.status === 'pending');
  const delayed = health === 'delayed' || health === 'paused';

  return (
    <footer className={`${styles.ticker} ${delayed ? styles.delayed : ''}`} aria-label={S.tickerLabel()}>
      <h2 className={styles.label}>{delayed ? S.sealingDelayed() : S.tickerLabel()}</h2>
      {rows.length === 0 && aheadOf === null ? (
        <p className={styles.empty}>{S.tickerEmpty()}</p>
      ) : (
        <ol className={styles.rows} aria-live="off">
          {aheadOf !== null && !hasPendingRecord ? (
            <li className={`${styles.row} ${styles.pending}`}>{S.sealingTick(aheadOf)}</li>
          ) : null}
          {rows.map((rec) => (
            <li key={rec.id} className={`${styles.row} ${rec.status === 'pending' ? styles.pending : ''}`}>
              <SealRow rec={rec} />
            </li>
          ))}
        </ol>
      )}
      <div className={styles.health}>
        <HealthChip health={health} sealedTick={sealedTick} blockNumber={block} />
      </div>
    </footer>
  );
}
