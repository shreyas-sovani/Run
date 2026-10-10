import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Button, PaperBackground } from '@/ui/brand';
import { copy } from '@/ui/copy';
import { displayUrl, publicBase } from './closingModel';
import s from './ClosingCard.module.css';

/** An inline SVG QR for `url`, drawn in ledger ink on a transparent ground. `null` while it renders or if it fails. */
function useQrSvg(url: string): string | null {
  const [svg, setSvg] = useState<{ url: string; svg: string } | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#172033', light: '#00000000' } }).then(
      (out) => live && setSvg({ url, svg: out }),
      () => live && setSvg(null),
    );
    return () => {
      live = false;
    };
  }, [url]);
  return svg && svg.url === url ? svg.svg : null;
}

/** The last frame of the demo: one line, the live link, and a QR to `/watch`. `Esc` closes. */
export function ClosingCard(props: { open: boolean; onClose(): void }) {
  const { open, onClose } = props;
  const base = useMemo(() => publicBase(import.meta.env.VITE_PUBLIC_URL, window.location.origin), []);
  const watchUrl = `${base}/watch`;
  const qr = useQrSvg(watchUrl);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-label={copy.closing.line}>
      <PaperBackground />
      <div className={s.card}>
        <div className={s.copy}>
          <h2 className={s.line}>{copy.closing.line}</h2>
          <p className={s.body}>{copy.closing.body}</p>
          <p className={s.adapter}>{copy.closing.adapter}</p>
          <div className={s.linkBlock}>
            <span className={s.linkLabel}>{copy.closing.link}</span>
            <a className={s.url} href={base} target="_blank" rel="noopener noreferrer">
              {displayUrl(base)}
            </a>
          </div>
          <p className={s.modes}>
            <span>{copy.closing.play}</span>
            <span aria-hidden="true"> · </span>
            <span>{copy.closing.replay}</span>
            <span aria-hidden="true"> · </span>
            <span>{copy.closing.watch}</span>
          </p>
        </div>
        <figure className={s.qr}>
          {qr ? (
            <div className={s.qrBox} role="img" aria-label={copy.closing.qrAlt} dangerouslySetInnerHTML={{ __html: qr }} />
          ) : (
            <div className={s.qrBox} aria-hidden="true" />
          )}
          <figcaption className={s.caption}>
            {copy.closing.qrCaption}
            <span className={s.captionUrl}>{displayUrl(watchUrl)}</span>
          </figcaption>
        </figure>
        <div className={s.close}>
          <Button kind="secondary" hotkey="Esc" onClick={onClose}>
            {copy.buttons.close}
          </Button>
        </div>
      </div>
    </div>
  );
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Self-contained mount: owns its open state and the `L` hotkey. F mounts `<ClosingCardHost />` once in the shell. */
export function ClosingCardHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === 'l' || e.key === 'L') setOpen((o) => !o);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return <ClosingCard open={open} onClose={() => setOpen(false)} />;
}
