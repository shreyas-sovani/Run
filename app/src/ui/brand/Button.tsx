import type { ReactNode } from 'react';
import s from './Button.module.css';

export interface ButtonProps {
  kind?: 'primary' | 'secondary';
  /** This button's own pending flag (PRD §13.3 rule 1). Disables it, shows a spinner and `pendingLabel`. */
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
  hotkey?: string;
  /** Additive: `lg` is the stage size (one primary per phase). Default `md`. */
  size?: 'md' | 'lg';
  /** Additive: sets `title` and, for icon-only content, an accessible name. */
  title?: string;
  /** Additive: shown (and announced) when the button is disabled but not pending, e.g. "Load a key first". */
  disabledReason?: string;
  id?: string;
  /** Additive: `submit` for forms. Default `button`. */
  type?: 'button' | 'submit';
}

/**
 * Primary: a stamped label (violet double border, violet ink on slip paper; fills on hover).
 * Secondary: a quiet outlined slip. Pending keeps the button's width (both labels share one grid cell),
 * sets `disabled` and `aria-busy`, and never reuses another button's pending state.
 */
export function Button(props: ButtonProps) {
  const { kind = 'primary', pending = false, disabled = false, size = 'md', type = 'button' } = props;
  const blocked = pending || disabled;
  const cls = [s.btn, kind === 'primary' ? s.primary : s.secondary, size === 'lg' ? s.lg : '', pending ? s.pending : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      id={props.id}
      type={type}
      className={cls}
      disabled={blocked}
      aria-busy={pending || undefined}
      aria-keyshortcuts={props.hotkey}
      title={props.title ?? (!pending && disabled ? props.disabledReason : undefined)}
      onClick={() => {
        if (!blocked) props.onClick();
      }}
    >
      <span className={s.stack}>
        <span className={s.label} aria-hidden={pending || undefined} data-hidden={pending || undefined}>
          {props.children}
          {props.hotkey ? <kbd className={s.key}>{props.hotkey}</kbd> : null}
        </span>
        {pending ? (
          <span className={s.busy} role="status">
            <span className={s.spinner} aria-hidden="true" />
            <span>{props.pendingLabel ?? '…'}</span>
          </span>
        ) : null}
      </span>
    </button>
  );
}
