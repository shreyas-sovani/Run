import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { runActions, useRunView } from '@/app/store';
import type { RunMode } from '@/types';
import { Button, CrossIcon } from '@/ui/brand';
import { copy } from '@/ui/copy';
import { fmtRecorded } from '@/ui/format';
import s from './ModeBanner.module.css';

export interface ModeBannerViewProps {
  mode: RunMode;
  replay: { name: string; recordedAt: string } | null;
  onWatchRecorded(): void;
  onFollowLive(): void;
  onAllRecorded(): void;
  onPractice(): void;
  /** Omit on phones, where the banner stays put. */
  onDismiss?: () => void;
}

/** The banner's content for one mode. `live` has no banner. Pure on its props (used by `/lab/panels`). */
export function ModeBannerView(props: ModeBannerViewProps) {
  const { mode } = props;
  if (mode === 'live') return null;
  const b = copy.banners;
  const when = props.replay ? fmtRecorded(props.replay.recordedAt) : '';
  const text =
    mode === 'practice'
      ? b.practice.text
      : mode === 'spectate'
        ? b.spectate.text
        : props.replay && when
          ? b.replay.textNamed(props.replay.name, when)
          : b.replay.text;
  return (
    <aside className={`${s.banner} ${s[mode]}`} data-mode={mode} aria-label={copy.chips[mode]}>
      <p className={s.text}>{text}</p>
      <div className={s.buttons}>
        {mode === 'practice' ? (
          <>
            <Button onClick={props.onWatchRecorded}>{b.practice.watch}</Button>
            <Button kind="secondary" onClick={props.onFollowLive}>
              {b.practice.follow}
            </Button>
          </>
        ) : mode === 'replay' ? (
          <>
            <Button kind="secondary" onClick={props.onAllRecorded}>
              {b.replay.all}
            </Button>
            <Button kind="secondary" onClick={props.onPractice}>
              {b.replay.practice}
            </Button>
          </>
        ) : (
          <>
            <Button kind="secondary" onClick={props.onWatchRecorded}>
              {b.spectate.replay}
            </Button>
            <Button kind="secondary" onClick={props.onPractice}>
              {b.spectate.practice}
            </Button>
          </>
        )}
        {props.onDismiss ? (
          <button type="button" className={s.dismiss} onClick={props.onDismiss} aria-label={b.dismiss} title={b.dismiss}>
            <CrossIcon />
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/**
 * The mode banner (PRD §4): Practice, Replay and Spectate say what they are, with a way to the real thing.
 * Dismissible on the stage, persistent on phones. Reports its height in `--banner-h` (px) on `<html>` so the stage
 * can size itself as `calc(100dvh - var(--banner-h, 0px))`.
 */
export function ModeBanner() {
  const mode = useRunView((v) => v.mode);
  const replay = useRunView((v) => v.replay);
  const phone = useIsPhone();
  const [dismissed, setDismissed] = useState<RunMode | null>(null);
  const [, navigate] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  const hidden = mode === 'live' || (!phone && dismissed === mode);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (hidden || !el) {
      root.style.setProperty('--banner-h', '0px');
      return;
    }
    const set = () => root.style.setProperty('--banner-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--banner-h', '0px');
    };
  }, [hidden, mode]);

  if (hidden) return null;
  return (
    <div ref={ref} className={s.slot}>
      <ModeBannerView
        mode={mode}
        replay={replay}
        onWatchRecorded={() => runActions.setMode('replay')}
        onFollowLive={() => navigate('/watch')}
        onAllRecorded={() => navigate('/replay')}
        onPractice={() => navigate('/')}
        onDismiss={phone ? undefined : () => setDismissed(mode)}
      />
    </div>
  );
}
