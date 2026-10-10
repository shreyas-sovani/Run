// The teller-window queue (D-05), Monad Mutual only: one little person per queued depositor, people leave
// from the head as they are served. Max 40 drawn, then "+N".
import { forwardRef, memo, useMemo } from 'react';
import { AnimatePresence, motion, type Transition } from 'motion/react';
import { useRunView, useUi } from '@/app/store';
import { fmtBps } from '@/ui/format';
import { S } from './stageCopy';
import styles from './QueueStrip.module.css';

const MAX_DRAWN = 40;

function Person() {
  return (
    <svg viewBox="0 0 20 28" className={styles.person} aria-hidden focusable="false">
      <circle cx="10" cy="7" r="5" fill="currentColor" />
      <path d="M2 27c0-7 3.5-12 8-12s8 5 8 12z" fill="currentColor" />
    </svg>
  );
}

// Memoised and ref-forwarding (AnimatePresence's popLayout needs the ref): a queue update re-renders only the
// people who arrived or left, not all 40.
const Slot = memo(
  forwardRef<HTMLLIElement, { transition: Transition }>(function Slot({ transition }, ref) {
    return (
      <motion.li
        ref={ref}
        layout="position"
        className={styles.slot}
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -26, scale: 0.8 }}
        transition={transition}
      >
        <Person />
      </motion.li>
    );
  }),
);

export function QueueStrip() {
  const active = useRunView((v) => v.level === 1);
  const queue = useRunView((v) => v.frame?.bank.queue ?? null);
  const bps = useRunView((v) => v.model?.configs[1].speedBumpBps ?? 0);
  const reduced = useUi((u) => u.reducedMotion);
  const t = useMemo<Transition>(() => (reduced ? { duration: 0 } : { duration: 0.28, ease: 'easeOut' }), [reduced]);
  if (!active) return null;

  const drawn = queue ? queue.slice(0, MAX_DRAWN) : [];
  const more = queue ? Math.max(0, queue.length - MAX_DRAWN) : 0;

  return (
    <section className={styles.queue} aria-label={S.queueTitle()}>
      <header className={styles.head}>
        <h2 className={styles.title}>{S.queueTitle()}</h2>
        <p className={styles.cap}>{S.queueCap(fmtBps(bps))}</p>
      </header>
      <div className={styles.window}>
        <ul className={styles.people} role="img" aria-label={S.queueAria(queue?.length ?? 0)}>
          <AnimatePresence initial={false} mode="popLayout">
            {drawn.map((id) => (
              <Slot key={id} transition={t} />
            ))}
          </AnimatePresence>
        </ul>
        {more > 0 ? <span className={styles.more}>{S.queueMore(more)}</span> : null}
        {queue && queue.length === 0 ? <span className={styles.empty}>{S.queueEmpty()}</span> : null}
      </div>
    </section>
  );
}
