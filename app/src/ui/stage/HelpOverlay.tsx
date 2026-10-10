// Help overlay (D-08): every hotkey, from the store's HOTKEYS. Opens with H or ?, closes with Esc (F's hotkeys).
import { useEffect, useRef } from 'react';
import { HOTKEYS, uiActions, useUi } from '@/app/store';
import { Button } from '@/ui/brand';
import { S } from './stageCopy';
import styles from './HelpOverlay.module.css';

export function HelpOverlay() {
  const open = useUi((u) => u.helpOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => returnTo.current?.focus?.();
  }, [open]);

  if (!open) return null;
  return (
    <div className={styles.scrim} onClick={() => uiActions.toggleHelp(false)}>
      <div
        ref={dialogRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <h2 id="help-title" className={styles.title}>
            {S.helpTitle()}
          </h2>
          <Button kind="secondary" hotkey="Esc" onClick={() => uiActions.toggleHelp(false)}>
            {S.close()}
          </Button>
        </header>
        <dl className={styles.list}>
          {HOTKEYS.map((h) => (
            <div key={h.key} className={styles.item}>
              <dt>
                <kbd className={styles.key}>{h.key}</kbd>
              </dt>
              <dd>{h.label}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.hint}>{S.helpHint()}</p>
      </div>
    </div>
  );
}
