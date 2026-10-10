import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address as Addr, Hex } from 'viem';
import { explorerAddress, explorerTx } from '@/chain';
import { copy } from '@/ui/copy';
import { shortHex } from '@/ui/format';
import { CheckIcon, CopyIcon, MoreIcon } from './icons';
import s from './HexRef.module.css';

/** Copies text. Falls back to a hidden textarea where the async clipboard API is blocked (http, older Safari). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

type Props = { kind: 'address'; value: Addr; label?: string } | { kind: 'tx'; value: Hex; label?: string };

/**
 * One truncated hex reference: link to MonadVision, a copy button with "Copied" feedback,
 * and a small menu with the Monadscan link. This is the only place raw hex may be rendered (PRD §13.3 rule 3).
 */
export function HexRef(props: Props) {
  const { kind, value, label } = props;
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [menu, setMenu] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const primary = kind === 'address' ? explorerAddress(value, 'monadvision') : explorerTx(value, 'monadvision');
  const secondary = kind === 'address' ? explorerAddress(value, 'monadscan') : explorerTx(value, 'monadscan');
  const noun = kind === 'address' ? copy.generic.address : copy.generic.tx;
  const shown = shortHex(value);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMenu(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menu]);

  const doCopy = useCallback(async () => {
    const ok = await copyText(value);
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1600);
  }, [value]);

  return (
    <span className={s.ref} ref={rootRef} data-kind={kind}>
      {label ? <span className={s.label}>{label}</span> : null}
      <a className={s.hex} href={primary} target="_blank" rel="noopener noreferrer" title={copy.buttons.openExplorer}>
        <span aria-hidden="true">{shown}</span>
        <span className="srOnly">{`${noun} ${shown}. ${copy.buttons.openExplorer}`}</span>
      </a>
      <button
        type="button"
        className={s.icon}
        data-state={state}
        onClick={doCopy}
        aria-label={`${copy.buttons.copy} ${noun.toLowerCase()} ${shown}`}
        title={copy.buttons.copy}
      >
        {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
      </button>
      <button
        type="button"
        className={s.icon}
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        aria-haspopup="true"
        aria-label={`More options for ${shown}`}
        title="More"
      >
        <MoreIcon />
      </button>
      {state !== 'idle' ? (
        <span className={`${s.toast} ${state === 'failed' ? s.toastBad : ''}`} role="status">
          {state === 'copied' ? copy.buttons.copied : copy.buttons.copyFailed}
        </span>
      ) : null}
      {menu ? (
        <span className={s.menu}>
          <a href={primary} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)}>
            {copy.buttons.openExplorer}
          </a>
          <a href={secondary} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)}>
            {copy.buttons.openExplorerAlt}
          </a>
        </span>
      ) : null}
    </span>
  );
}
