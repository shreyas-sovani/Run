import { describe, expect, it } from 'vitest';
import {
  fmtAusd,
  fmtAusdNumber,
  fmtAusdWithUsd,
  fmtBlock,
  fmtBps,
  fmtClock,
  fmtCount,
  fmtGas,
  fmtMon,
  fmtRecorded,
  fmtSealTime,
  fmtSeconds,
  fmtUsdScaled,
  shortHex,
} from '@/ui/format';

describe('fmtAusd', () => {
  it('formats whole AUSD with grouping', () => {
    expect(fmtAusd(1_500_000_000n)).toBe('1,500 AUSD');
    expect(fmtAusd(10_000_000_000n)).toBe('10,000 AUSD');
    expect(fmtAusd(0n)).toBe('0 AUSD');
  });
  it('honours dp and rounds half up with bigint maths', () => {
    expect(fmtAusd(29_210_000n, { dp: 1 })).toBe('29.2 AUSD');
    expect(fmtAusd(1_234_567n, { dp: 2 })).toBe('1.23 AUSD');
    expect(fmtAusd(1_235_000n, { dp: 2 })).toBe('1.24 AUSD');
    expect(fmtAusd(1_500_000n)).toBe('2 AUSD');
    expect(fmtAusd(499_999n)).toBe('0 AUSD');
  });
  it('does not lose precision on values beyond 2^53', () => {
    expect(fmtAusd(9_007_199_254_740_993_000_000n)).toBe('9,007,199,254,740,993 AUSD');
  });
  it('handles negatives and the bare number', () => {
    expect(fmtAusd(-1_500_000_000n)).toBe('−1,500 AUSD');
    expect(fmtAusd(-1n)).toBe('0 AUSD');
    expect(fmtAusdNumber(95_000_000n)).toBe('95');
  });
});

describe('fmtUsdScaled (1 AUSD = $1M)', () => {
  it('scales to B, M and K', () => {
    expect(fmtUsdScaled(1_500_000_000n)).toBe('$1.5B');
    expect(fmtUsdScaled(9_500_000_000n)).toBe('$9.5B');
    expect(fmtUsdScaled(42_000_000_000n)).toBe('$42B');
    expect(fmtUsdScaled(10_000_000_000n)).toBe('$10B');
    expect(fmtUsdScaled(500_000_000n)).toBe('$500M');
    expect(fmtUsdScaled(29_210_000n)).toBe('$29.2M');
    expect(fmtUsdScaled(500_000n)).toBe('$500K');
  });
  it('shows small values plainly and zero as $0', () => {
    expect(fmtUsdScaled(0n)).toBe('$0');
    expect(fmtUsdScaled(1n)).toBe('$1');
  });
  it('promotes instead of printing 1000.0M', () => {
    expect(fmtUsdScaled(999_960_000n)).toBe('$1B');
    expect(fmtUsdScaled(999_940_000n)).toBe('$999.9M');
  });
  it('pairs with fmtAusd', () => {
    expect(fmtAusdWithUsd(1_500_000_000n)).toBe('1,500 AUSD · $1.5B');
  });
});

describe('fmtMon', () => {
  it('two decimals normally, four for dust', () => {
    expect(fmtMon(35n * 10n ** 18n)).toBe('35.00 MON');
    expect(fmtMon(10_500_000_000_000_000_000n)).toBe('10.50 MON');
    expect(fmtMon(400_000_000_000_000n)).toBe('0.0004 MON');
    expect(fmtMon(0n)).toBe('0.00 MON');
  });
});

describe('time, block and hex', () => {
  it('fmtSeconds', () => {
    expect(fmtSeconds(5400)).toBe('5.4 s');
    expect(fmtSeconds(0)).toBe('0.0 s');
    expect(fmtSeconds(710)).toBe('0.7 s');
    expect(fmtSeconds(72_000)).toBe('1 min 12 s');
    expect(fmtSeconds(Number.NaN)).toBe('0.0 s');
  });
  it('fmtSealTime and fmtClock', () => {
    expect(fmtSealTime(710)).toBe('0.71 s');
    expect(fmtClock(4400)).toBe('T+4.4 s');
  });
  it('fmtBlock', () => {
    expect(fmtBlock(21_483_214n)).toBe('#21,483,214');
    expect(fmtBlock(7n)).toBe('#7');
  });
  it('shortHex', () => {
    expect(shortHex('0x5a3f0000000000000000000000000000ffff9e21')).toBe('0x5a3f…9e21');
    expect(shortHex('0x1234')).toBe('0x1234');
  });
  it('misc', () => {
    expect(fmtBps(552)).toBe('5.52%');
    expect(fmtBps(300)).toBe('3%');
    expect(fmtBps(0)).toBe('0%');
    expect(fmtCount(1, 'tick')).toBe('1 tick');
    expect(fmtCount(14, 'tick')).toBe('14 ticks');
    expect(fmtGas(310_000n)).toBe('310,000');
  });
  it('fmtRecorded', () => {
    expect(fmtRecorded('2026-10-10T14:12:00Z', { utc: true })).toBe('10 Oct, 14:12');
    expect(fmtRecorded('nope')).toBe('');
  });
});
