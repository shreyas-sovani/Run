import { describe, expect, it } from 'vitest';
import type { Outcome, SealRecord } from '@/types';
import { agreement, biggestBatch, buildProof, chainTxs, isFinalized, streetSplit, verdictSeal } from '../proofModel';

let id = 0;
function rec(over: Partial<SealRecord>): SealRecord {
  return {
    id: ++id, kind: 'ticks', simulated: false, fromTick: 1, toTick: 1, requestedCount: 0,
    txHash: '0x01', blockNumber: 100n, sentAtMs: 1_000, sealedAtMs: 1_700, gasLimit: 500_000n, gasUsed: 310_000n,
    status: 'sealed', finalized: false, mirrorMatch: true, rpc: 'x', ...over,
  };
}

const outcome = (tick: number): Outcome => ({
  kind: 'failed', tick, wallMs: 5400, blocks: 14, rumorBlock: 90n, outcomeBlock: 104n,
  trappedCount: 41, trappedAmount: 800_000_000n, uninsuredTrapped: 300_000_000n, withdrawnAmount: 1n, sealed: true,
});

describe('isFinalized', () => {
  it('uses the record flag or the finalized height', () => {
    expect(isFinalized(rec({ finalized: true }), null)).toBe(true);
    expect(isFinalized(rec({ blockNumber: 100n }), 100n)).toBe(true);
    expect(isFinalized(rec({ blockNumber: 101n }), 100n)).toBe(false);
    expect(isFinalized(rec({ blockNumber: null }), 100n)).toBe(false);
    expect(isFinalized(rec({ blockNumber: 100n }), null)).toBe(false);
  });
});

describe('biggestBatch', () => {
  it('picks the sealed ticks tx with the most requests; the earliest wins a tie', () => {
    const a = rec({ requestedCount: 12 });
    const b = rec({ requestedCount: 31, blockNumber: 105n });
    const c = rec({ requestedCount: 31, blockNumber: 106n });
    const pending = rec({ requestedCount: 99, status: 'pending' });
    const rumor = rec({ kind: 'rumor', requestedCount: null });
    const best = biggestBatch([a, rumor, pending, b, c]);
    expect(best?.record).toBe(b);
    expect(best?.count).toBe(31);
    expect(best?.sealMs).toBe(700);
  });
  it('is null with no sealed batches', () => {
    expect(biggestBatch([])).toBeNull();
    expect(biggestBatch([rec({ kind: 'rumor' })])).toBeNull();
  });
});

describe('verdictSeal', () => {
  it('finds the tx whose tick range holds the verdict tick', () => {
    const a = rec({ fromTick: 1, toTick: 8 });
    const b = rec({ fromTick: 9, toTick: 14 });
    expect(verdictSeal([a, b], outcome(12))).toBe(b);
    expect(verdictSeal([a, b], outcome(8))).toBe(a);
    expect(verdictSeal([a, b], outcome(20))).toBeNull();
    expect(verdictSeal([a, b], null)).toBeNull();
  });
});

describe('buildProof', () => {
  const rumor = rec({ kind: 'rumor', fromTick: null, toTick: null, requestedCount: null });
  const ticks = rec({ fromTick: 1, toTick: 14, requestedCount: 40 });

  it('chain data in live mode', () => {
    const m = buildProof({ mode: 'live', seals: [rumor, ticks], outcome: outcome(12), sealedTick: 14 });
    expect(m.source).toBe('chain');
    expect(m.rumor).toBe(rumor);
    expect(m.biggest?.record).toBe(ticks);
    expect(m.verdict?.record).toBe(ticks);
    expect(m.txCount).toBe(2);
    expect(m.ticksSealed).toBe(14);
  });

  it('recorded data in replay mode', () => {
    expect(buildProof({ mode: 'replay', seals: [rumor, ticks], outcome: null, sealedTick: 3 }).source).toBe('recorded');
  });

  it('practice mode and simulated seals never claim transactions', () => {
    const sim = [rec({ kind: 'rumor', simulated: true }), rec({ simulated: true, requestedCount: 50 })];
    for (const mode of ['practice', 'live'] as const) {
      const m = buildProof({ mode, seals: sim, outcome: outcome(3), sealedTick: 3 });
      expect(m.source).toBe('practice');
      expect(m.rumor).toBeNull();
      expect(m.biggest).toBeNull();
      expect(m.verdict?.record).toBeNull();
      expect(m.txCount).toBe(0);
    }
  });
});

describe('agreement', () => {
  it('reports none, agree and mismatch', () => {
    expect(agreement({ matched: 0, total: 0, firstMismatchTick: null }).state).toBe('none');
    expect(agreement({ matched: 14, total: 14, firstMismatchTick: null }).state).toBe('agree');
    expect(agreement({ matched: 9, total: 14, firstMismatchTick: null }).state).toBe('mismatch');
    expect(agreement({ matched: 14, total: 14, firstMismatchTick: 6 }).state).toBe('mismatch');
  });
});

describe('biggestBatch ignores quiet batches (F, Live UI check)', () => {
  it('is null while every sealed batch has zero requests', () => {
    expect(biggestBatch([rec({ requestedCount: 0 }), rec({ requestedCount: 0, blockNumber: 101n })])).toBeNull();
  });
  it('picks the first batch that has requests', () => {
    const quiet = rec({ requestedCount: 0 });
    const busy = rec({ requestedCount: 1, blockNumber: 105n });
    expect(biggestBatch([quiet, busy])?.record).toBe(busy);
  });
  it('buildProof shows no biggest batch before anyone has asked to withdraw', () => {
    const m = buildProof({ mode: 'live', seals: [rec({ kind: 'rumor', requestedCount: null }), rec({ requestedCount: 0 })], outcome: null, sealedTick: 2 });
    expect(m.biggest).toBeNull();
  });
});

describe('streetSplit', () => {
  it('splits what left the bank into paid-out and fire-sale loss (F run 1: 6,055 + 1,025 = 7,080)', () => {
    const s = streetSplit({ streetHeld: 7_080_497_326n, cumulativeLoss: 1_025_000_000n });
    expect(s).toEqual({ total: 7_080_497_326n, paid: 6_055_497_326n, loss: 1_025_000_000n });
    expect(s.paid + s.loss).toBe(s.total);
  });
  it('never reports a negative payout', () => {
    expect(streetSplit({ streetHeld: 100n, cumulativeLoss: 500n })).toEqual({ total: 100n, paid: 0n, loss: 100n });
  });
  it('a run with no fire sale is all payout', () => {
    expect(streetSplit({ streetHeld: 2_000_000n, cumulativeLoss: 0n })).toEqual({ total: 2_000_000n, paid: 2_000_000n, loss: 0n });
  });
});

describe('chainTxs', () => {
  it('lists every sealed onchain transaction in order and skips pending, simulated and hashless records', () => {
    const seals = [
      rec({ id: 1, kind: 'rumor', txHash: '0x01' }),
      rec({ id: 2, kind: 'ticks', txHash: '0x02', fromTick: 1, toTick: 2 }),
      rec({ id: 3, kind: 'ticks', txHash: null, status: 'pending' }),
      rec({ id: 4, kind: 'ticks', txHash: null, simulated: true }),
      rec({ id: 5, kind: 'ticks', txHash: '0x05', status: 'reverted' }),
      rec({ id: 6, kind: 'ticks', txHash: '0x06', fromTick: 3, toTick: 3 }),
    ];
    expect(chainTxs(seals).map((r) => r.id)).toEqual([1, 2, 6]);
    expect(chainTxs([])).toEqual([]);
  });
});
