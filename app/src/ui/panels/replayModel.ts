import type { ReplayIndexEntry } from '@/types';

export type ReplayListState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; entries: ReplayIndexEntry[] };

/** Newest first; unparseable dates sink to the bottom. */
export function sortReplays(entries: readonly ReplayIndexEntry[]): ReplayIndexEntry[] {
  const t = (e: ReplayIndexEntry) => {
    const n = Date.parse(e.recordedAt);
    return Number.isNaN(n) ? -Infinity : n;
  };
  return [...entries].sort((a, b) => t(b) - t(a));
}
