// Gas model for `RunBank.sealTicks` on Monad testnet. Owner: A.
//
// Monad charges the gas LIMIT, not gas used (receipt gasUsed === limit), so limits must be tight but never too low.
// Constants were fitted to `eth_estimateGas` samples taken on the live testnet bank (chain 10143, 107 payloads:
// 1-8 ticks, 0-475 ids, level 0 and level 1), see docs/status/A.md for the table.
//
// Shape of the cost (level 0, no speed bump):
//   empty batch:        BASE_EMPTY + PER_TICK * ticks                       (no payout, no AUSD transfer)
//   any id requested:   BASE + PER_TICK * ticks + PER_ID * ids
//     BASE covers the status/ledger loads, the packed core/meta writes, the withdrawn bitmap write and the one
//     AUSD transfer to Street (cold token account + two balance slots). PER_ID covers the ledger read, the
//     bank-maths loop and the TickSealed calldata/log bytes.
// With the speed bump (level 1) the cost depends on queue state that `ticks` alone cannot show: ids are pushed to
// the ring buffer and drained later, even by "empty" ticks. That path uses a looser envelope with a per-slot term.
//
// Fit quality: level 0 satisfies `sample <= formula <= 1.15 * sample + 20k` for every sample. The envelope used for
// level 1 / unknown is >= every sample but can overshoot by up to ~2x on dense batches. Prefer `estimateGas + 10%`
// (PRD 12.3 `gasMode = 'estimate'`); this formula is the offline fallback.

export const calibrated = true;

export interface GasOptions {
  /** Which bank config the batch targets. `false` = Bhau's (no speed bump). Default (undefined) = safe envelope. */
  speedBump?: boolean;
  /** Ids already sitting in the speed-bump queue before this batch (they get drained by these ticks). */
  queued?: number;
}

/** Level 0 (no speed bump): tight fit. */
const L0 = { baseEmpty: 60_000n, base: 150_000n, perTick: 8_500n, perId: 3_800n } as const;
/** Level 1 (speed bump) and the default envelope: >= every measured sample. */
const L1 = { baseEmpty: 62_000n, base: 225_000n, perTick: 28_000n, perId: 3_700n, perSlot: 3_100n } as const;

/** Never go below this; protects against a tiny/empty request producing an unusable limit. */
const FLOOR = 60_000n;
/** Hard cap: Monad's per-tx gas limit is 30M. */
const CAP = 30_000_000n;

export function gasLimitFor(ticks: number[][], opts: GasOptions = {}): bigint {
  const t = BigInt(ticks.length);
  const ids = BigInt(ticks.reduce((n, x) => n + x.length, 0));
  let gas: bigint;
  if (opts.speedBump === false) {
    gas = ids === 0n ? L0.baseEmpty + L0.perTick * t : L0.base + L0.perTick * t + L0.perId * ids;
  } else {
    const slots = BigInt(new Set(ticks.flat().map((id) => id >> 3)).size);
    const drained = BigInt(Math.max(0, Math.floor(opts.queued ?? 0)));
    const anyWork = ids + drained > 0n;
    gas = anyWork
      ? L1.base + L1.perTick * t + L1.perId * (ids + drained) + L1.perSlot * slots
      : L1.baseEmpty + 8_500n * t;
  }
  return gas < FLOOR ? FLOOR : gas > CAP ? CAP : gas;
}

/**
 * Limits for the fixed-cost calls, from testnet `estimateGas` / receipts (measured: startRumor 113-135k,
 * reset 128k, setLevel 117-315k, loadLedger 1.52M, deploy 3.25M) plus ~20% headroom.
 */
export const callGas = {
  startRumor: 160_000n,
  reset: 160_000n,
  setLevel: 380_000n,
  loadLedger: 1_800_000n,
} as const;
