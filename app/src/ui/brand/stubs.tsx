// Placeholder from F-00. Owner: E. Replace freely.
import type { ReactNode } from 'react';
import type { Address as Addr, Hex } from 'viem';
import type { RunMode, SealHealth } from '@/types';
import { copy } from '@/ui/copy';
import { shortHex } from '@/ui/format';

export function PaperBackground() {
  return <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'var(--paper)', zIndex: -1 }} />;
}

export function Stamp(props: {
  kind: 'failed' | 'survived';
  headline: string;
  subline?: string;
  marathi?: string;
  play: boolean;
  onImpact?: () => void;
}) {
  if (!props.play) return null;
  return (
    <div style={{ color: 'var(--seal)', border: '4px double var(--seal)', padding: 16, display: 'inline-block' }}>
      <strong>{props.headline}</strong>
      {props.subline ? <div>{props.subline}</div> : null}
    </div>
  );
}

export function ModeChip(props: { mode: RunMode; replayName?: string }) {
  return <span>{copy.chips[props.mode]}{props.replayName ? ` (${props.replayName})` : ''}</span>;
}

export function HealthChip(props: { health: SealHealth; sealedTick: number; blockNumber: bigint | null }) {
  return (
    <span>
      {props.health} · tick {props.sealedTick}
      {props.blockNumber !== null ? ` · block ${props.blockNumber.toString()}` : ''}
    </span>
  );
}

export function Address(props: { address: Addr; label?: string }) {
  return <code title={props.address}>{props.label ?? shortHex(props.address)}</code>;
}

export function TxLink(props: { hash: Hex; label?: string }) {
  return <code title={props.hash}>{props.label ?? shortHex(props.hash)}</code>;
}

export function Button(props: {
  kind?: 'primary' | 'secondary';
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
  hotkey?: string;
}) {
  return (
    <button type="button" disabled={props.disabled || props.pending} onClick={props.onClick}>
      {props.pending ? (props.pendingLabel ?? '…') : props.children}
      {props.hotkey ? ` [${props.hotkey}]` : ''}
    </button>
  );
}

export const sfx = {
  async unlock(): Promise<void> {},
  alarm(_on: boolean): void {},
  thud(): void {},
  seal(): void {},
  murmur(_level: number): void {},
  setMuted(_m: boolean): void {},
  stopAll(): void {},
};

export function BrandLab() {
  return <div>Brand lab (placeholder). Owner: E.</div>;
}
