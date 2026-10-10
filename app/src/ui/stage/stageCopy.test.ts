import { describe, expect, it } from 'vitest';
import { PASSBOOK_SECONDS, S, fill, splitEmphasis } from './stageCopy';

describe('stageCopy', () => {
  it('fills placeholders and leaves unknown ones alone', () => {
    expect(fill('{n} withdrew', { n: 41 })).toBe('41 withdrew');
    expect(fill('{n} of {m}', { n: 1 })).toBe('1 of {m}');
  });

  it('splits *emphasis* out of card text', () => {
    expect(splitEmphasis('The audit is *delayed*.')).toEqual([
      { text: 'The audit is ', em: false },
      { text: 'delayed', em: true },
      { text: '.', em: false },
    ]);
    expect(splitEmphasis('no markup')).toEqual([{ text: 'no markup', em: false }]);
  });

  it('has one passbook row per historical duration, with every field filled', () => {
    const rows = S.passbookRows();
    expect(rows).toHaveLength(PASSBOOK_SECONDS.length);
    for (const r of rows) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.amount).toMatch(/\$/);
      expect(r.duration.length).toBeGreaterThan(0);
    }
  });

  it('keeps the PRD §8.1 durations in order: WaMu 16 d, Wachovia 8 d, SVB 1 d', () => {
    expect(PASSBOOK_SECONDS).toEqual([16 * 86_400, 8 * 86_400, 86_400]);
  });

  it('prints the stamp subline from the sealed outcome', () => {
    expect(S.stampSub('failed', 5400, 13)).toContain('5.4 s');
    expect(S.stampSub('failed', 5400, 13)).toContain('13');
  });

  it('writes bank tags in sentence case', () => {
    expect(S.bankTag(0)[0]).toBe(S.bankTag(0)[0].toUpperCase());
  });

  it('gives the key labels the stage prints', () => {
    expect(S.key.start).toBe('Enter');
  });
});
