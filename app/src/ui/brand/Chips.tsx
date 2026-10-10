import type { RunMode, SealHealth } from '@/types';
import { copy } from '@/ui/copy';
import s from './Chips.module.css';

/**
 * PRD §4: a mode chip is always visible so nobody mistakes a simulation for a live run.
 * `replayName` / `recordedAt` are only used for the replay chip (`recordedAt` is an additive optional prop).
 */
export function ModeChip(props: { mode: RunMode; replayName?: string; recordedAt?: string }) {
  const text =
    props.mode === 'replay'
      ? copy.replayChip({ recordedAt: props.recordedAt, name: props.replayName })
      : copy.chips[props.mode];
  return (
    <span className={`${s.chip} ${s[props.mode]}`} data-mode={props.mode} title={copy.chipHints[props.mode]}>
      <span className={s.mark} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}

/** Seal health: sealing pulses violet, delayed is amber, paused is vermilion, offline is slate (always with words). */
export function HealthChip(props: { health: SealHealth; sealedTick: number; blockNumber: bigint | null }) {
  const text = copy.healthChip(props.health, props.sealedTick, props.blockNumber);
  return (
    <span
      className={`${s.chip} ${s.health} ${s[`h_${props.health}`]}`}
      data-health={props.health}
      title={copy.healthDetail[props.health]}
    >
      <span className={s.mark} aria-hidden="true" />
      <span className="tnum" aria-hidden="true">
        {text}
      </span>
      {/* Announce state changes only; the tick and block counters change every 400 ms and stay silent. */}
      <span className="srOnly" role="status">
        {`${copy.health[props.health]}. ${copy.healthDetail[props.health]}`}
      </span>
    </span>
  );
}
