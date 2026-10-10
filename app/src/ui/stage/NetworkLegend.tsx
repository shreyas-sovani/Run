// Key to the node encoding (PRD §14.3): shape + colour, never colour alone. Static DOM, no canvas.
import { useRunView } from '@/app/store';
import { S } from './stageCopy';
import styles from './NetworkLegend.module.css';

export function NetworkLegend() {
  const insured = useRunView((v) => v.level === 1);
  const items: { key: string; label: string; mark: string }[] = [
    { key: 'calm', label: S.legend.calm(), mark: styles.calm },
    { key: 'heard', label: S.legend.heard(), mark: styles.heard },
    { key: 'panicking', label: S.legend.panicking(), mark: styles.panicking },
    { key: 'queued', label: S.legend.queued(), mark: styles.queued },
    { key: 'withdrawn', label: S.legend.withdrawn(), mark: styles.withdrawn },
    { key: 'trapped', label: S.legend.trapped(), mark: styles.trapped },
  ];
  if (insured) items.push({ key: 'insured', label: S.legend.insured(), mark: styles.insured });
  return (
    <ul className={styles.legend} aria-label={S.legendTitle()}>
      {items.map((it) => (
        <li key={it.key} className={styles.item}>
          <span className={`${styles.mark} ${it.mark}`} aria-hidden />
          {it.label}
        </li>
      ))}
      <li className={`${styles.item} ${styles.size}`}>{S.legend.size()}</li>
    </ul>
  );
}
