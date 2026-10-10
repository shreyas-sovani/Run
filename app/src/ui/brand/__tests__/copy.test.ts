import { describe, expect, it } from 'vitest';
import { copy } from '@/ui/copy';

describe('copy deck', () => {
  it('keeps the F-00 placeholder keys that other agents read', () => {
    expect(copy.banks).toHaveLength(2);
    expect(copy.cards.map((c) => c.hotkey)).toEqual(['Q', 'W', 'E', 'R']);
    expect(copy.buttons.start).toBe('Start the run');
    expect(copy.buttons.starting).toBe('Starting the run…');
    expect(copy.phases.failing).toBe('Sealing the verdict…');
    expect(Object.keys(copy.chips).sort()).toEqual(['live', 'practice', 'replay', 'spectate']);
  });
  it('uses the PRD §4 chip texts verbatim', () => {
    expect(copy.chips.live).toBe('LIVE · sealed on Monad testnet');
    expect(copy.chips.practice).toBe('PRACTICE · simulated in your browser, not onchain');
    expect(copy.chips.spectate).toBe('WATCHING LIVE · rebuilt from Monad testnet');
    expect(copy.replayChip({ recordedAt: '2026-10-10T14:12:00Z' })).toMatch(
      /^REPLAY · recorded \d{1,2} \w{3}, \d{2}:\d{2} · every tick links to a real transaction$/,
    );
    expect(copy.replayChip()).toBe(copy.chips.replay);
  });
  it('keeps the PRD §8.1 passbook figures verbatim', () => {
    const byId = Object.fromEntries(copy.passbook.rows.map((r) => [r.id, r]));
    expect(byId.wamu).toMatchObject({ amount: '$19B', span: '16 days' });
    expect(byId.wachovia).toMatchObject({ amount: '~$10B', span: '8 days' });
    expect(byId.svb).toMatchObject({ amount: '$42B', span: '1 day' });
  });
  it('builds stamp sublines', () => {
    expect(copy.stamp.failedSub(5400, 13)).toBe('in 5.4 s · 13 Monad blocks');
    expect(copy.stamp.failedSub(null, null)).toBe('');
  });
  it('translates errors as in PRD §12.6', () => {
    expect(copy.errors.WrongStatus.body('Running')).toBe('The bank is Running. Reset the bank first.');
    expect(copy.errors.Timeout.body(7)).toBe("Monad hasn't sealed tick 7 yet. Retrying…");
  });
  it('is sentence case outside stamps (no all-caps button labels)', () => {
    for (const label of Object.values(copy.buttons)) expect(label).not.toBe(label.toUpperCase());
  });
});
