// Placeholder from F-00. Owner: E. Replace freely.
import { formatEther, formatUnits } from 'viem';

export const DISPLAY_SCALE_USD_PER_AUSD = 1_000_000;

export function fmtAusd(base: bigint, opts?: { dp?: number }): string {
  const dp = opts?.dp ?? 0;
  const n = Number(formatUnits(base, 6));
  return `${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })} AUSD`;
}

export function fmtUsdScaled(base: bigint): string {
  const usd = Number(formatUnits(base, 6)) * DISPLAY_SCALE_USD_PER_AUSD;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  return `$${usd.toLocaleString('en-US')}`;
}

export function fmtMon(wei: bigint): string {
  return `${Number(formatEther(wei)).toFixed(2)} MON`;
}

export function fmtSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function fmtBlock(n: bigint): string {
  return `#${n.toLocaleString('en-US')}`;
}

export function shortHex(h: string): string {
  return h.length <= 12 ? h : `${h.slice(0, 6)}…${h.slice(-4)}`;
}
