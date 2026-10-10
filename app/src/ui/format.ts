// Display formatters (PRD §16.5, §13.3 rules 4 and 9). Owner: E.
// All money maths is bigint: no float drift, no base units ever shown. AUSD has 6 decimals, MON has 18.

export const DISPLAY_SCALE_USD_PER_AUSD = 1_000_000;
export const DISPLAY_SCALE_NOTE = '1 AUSD = $1M';

const AUSD_DECIMALS = 6;
const MON_DECIMALS = 18;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Rounds `value / 10^decimals` half-up to `dp` places and returns [whole, fraction] digit strings. Non-negative input. */
function splitFixed(value: bigint, decimals: number, dp: number): [string, string] {
  const places = Math.max(0, Math.min(dp, decimals));
  const drop = BigInt(10) ** BigInt(decimals - places);
  const rounded = (value + drop / 2n) / drop; // half-up
  const scale = BigInt(10) ** BigInt(places);
  const whole = (rounded / scale).toString();
  const frac = places === 0 ? '' : (rounded % scale).toString().padStart(places, '0');
  return [whole, frac];
}

/** `fmtAusd(1_500_000_000n)` → `"1,500 AUSD"`. `dp` fixes the decimals (default 0). */
export function fmtAusd(base: bigint, opts?: { dp?: number }): string {
  return `${fmtAusdNumber(base, opts)} AUSD`;
}

/** The same number without the unit, for tables whose header already says AUSD. */
export function fmtAusdNumber(base: bigint, opts?: { dp?: number }): string {
  const dp = opts?.dp ?? 0;
  const neg = base < 0n;
  const [whole, frac] = splitFixed(neg ? -base : base, AUSD_DECIMALS, dp);
  const body = groupThousands(whole) + (frac ? `.${frac}` : '');
  return neg && /[1-9]/.test(whole + frac) ? `−${body}` : body;
}

const USD_UNITS: { at: bigint; suffix: string }[] = [
  { at: 1_000_000_000_000n, suffix: 'T' },
  { at: 1_000_000_000n, suffix: 'B' },
  { at: 1_000_000n, suffix: 'M' },
  { at: 1_000n, suffix: 'K' },
];

/**
 * The display-scale dollar value (1 AUSD = $1M). `fmtUsdScaled(1_500_000_000n)` → `"$1.5B"`.
 * One decimal at most, never a trailing `.0`. Always label the scale where this appears (`DISPLAY_SCALE_NOTE`).
 */
export function fmtUsdScaled(base: bigint): string {
  const neg = base < 0n;
  // base units are AUSD × 1e6 and the scale is $1M per AUSD, so the dollar value equals `base` exactly.
  const usd = (neg ? -base : base) * BigInt(DISPLAY_SCALE_USD_PER_AUSD / 10 ** AUSD_DECIMALS);
  const sign = neg && usd > 0n ? '−' : '';
  for (let i = 0; i < USD_UNITS.length; i++) {
    const { at, suffix } = USD_UNITS[i];
    if (usd < at) continue;
    // tenths, rounded half-up
    let tenths = (usd * 10n + at / 2n) / at;
    // 999.96M rounds to 1000.0M: promote to the next unit instead
    if (tenths >= 10_000n && i > 0) {
      const up = USD_UNITS[i - 1];
      tenths = (usd * 10n + up.at / 2n) / up.at;
      return `${sign}$${tenthsToText(tenths)}${up.suffix}`;
    }
    return `${sign}$${tenthsToText(tenths)}${suffix}`;
  }
  return `${sign}$${usd.toString()}`;
}

function tenthsToText(tenths: bigint): string {
  const whole = tenths / 10n;
  const frac = tenths % 10n;
  return frac === 0n ? groupThousands(whole.toString()) : `${groupThousands(whole.toString())}.${frac}`;
}

/** `1,500 AUSD · $1.5B` — the value-context pairing PRD §13.3 rule 4 asks for. */
export function fmtAusdWithUsd(base: bigint, opts?: { dp?: number }): string {
  return `${fmtAusd(base, opts)} · ${fmtUsdScaled(base)}`;
}

/** MON gas and balances, MON only. Two decimals; tiny non-zero amounts get four so a gas cost never reads `0.00`. */
export function fmtMon(wei: bigint): string {
  const neg = wei < 0n;
  const abs = neg ? -wei : wei;
  const small = abs > 0n && abs < 10n ** 16n; // < 0.01 MON
  const [whole, frac] = splitFixed(abs, MON_DECIMALS, small ? 4 : 2);
  return `${neg ? '−' : ''}${groupThousands(whole)}.${frac} MON`;
}

/** `fmtSeconds(5400)` → `"5.4 s"`. Past a minute: `"1 min 12 s"`. */
export function fmtSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0.0 s';
  if (ms >= 60_000) {
    const total = Math.round(ms / 1000);
    return `${Math.floor(total / 60)} min ${total % 60} s`;
  }
  return `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
}

/** `fmtBlock(21_483_214n)` → `"#21,483,214"`. */
export function fmtBlock(n: bigint): string {
  return `#${groupThousands(n.toString())}`;
}

/** `shortHex("0x5a3f…")` → `"0x5a3f…9e21"`. Short inputs come back unchanged. */
export function shortHex(h: string): string {
  return h.length <= 12 ? h : `${h.slice(0, 6)}…${h.slice(-4)}`;
}

/** `fmtBps(552)` → `"5.52%"`; trailing zeros trimmed: `fmtBps(300)` → `"3%"`. */
export function fmtBps(bps: number): string {
  const pct = (Math.round(bps) / 100).toFixed(2);
  return `${pct.replace(/\.?0+$/, '')}%`;
}

/** Elapsed run clock: `fmtClock(4400)` → `"T+4.4 s"`. */
export function fmtClock(ms: number): string {
  return `T+${fmtSeconds(ms)}`;
}

/** `1 tick`, `14 ticks`. */
export function fmtCount(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `fmtRecorded("2026-10-10T14:12:00+05:30")` → `"10 Oct, 14:12"` in the viewer's local time (or `utc: true`). */
export function fmtRecorded(iso: string, opts?: { utc?: boolean }): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const utc = opts?.utc === true;
  const day = utc ? d.getUTCDate() : d.getDate();
  const month = MONTHS[utc ? d.getUTCMonth() : d.getMonth()];
  const hh = String(utc ? d.getUTCHours() : d.getHours()).padStart(2, '0');
  const mm = String(utc ? d.getUTCMinutes() : d.getMinutes()).padStart(2, '0');
  return `${day} ${month}, ${hh}:${mm}`;
}

/** Milliseconds between two timestamps as a seal time: `fmtSealTime(710)` → `"0.71 s"`. */
export function fmtSealTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Gas as a grouped integer: `fmtGas(310000n)` → `"310,000"`. */
export function fmtGas(gas: bigint): string {
  return groupThousands(gas.toString());
}
