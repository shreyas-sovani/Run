import { describe, expect, it } from 'vitest';
import type { ReplayIndexEntry } from '@/types';
import { sortReplays } from '../replayModel';

const e = (id: string, recordedAt: string): ReplayIndexEntry => ({ id, name: id, recordedAt, kind: 'failed', level: 0 });

describe('sortReplays', () => {
  it('puts the newest recording first and does not mutate its input', () => {
    const input = [e('old', '2026-10-09T10:00:00Z'), e('new', '2026-10-10T10:00:00Z'), e('mid', '2026-10-09T23:00:00Z')];
    expect(sortReplays(input).map((r) => r.id)).toEqual(['new', 'mid', 'old']);
    expect(input.map((r) => r.id)).toEqual(['old', 'new', 'mid']);
  });
  it('sinks entries with an unreadable date', () => {
    expect(sortReplays([e('bad', 'nope'), e('ok', '2026-10-10T10:00:00Z')]).map((r) => r.id)).toEqual(['ok', 'bad']);
  });
});
