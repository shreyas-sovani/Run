// Pure derivations for the proof panel (PRD §5.1, BACKLOG E-05). No React, no store: unit-tested.
import type { Outcome, RunMode, SealRecord } from '@/types';

/** A record is final when Monad says so, or its block is at or below the finalized height. */
export function isFinalized(r: SealRecord, finalizedBlock: bigint | null): boolean {
  if (r.finalized) return true;
  return r.blockNumber !== null && finalizedBlock !== null && r.blockNumber <= finalizedBlock;
}

export interface BiggestBatch {
  record: SealRecord;
  /** Depositors requested in the batch's ticks (the most in any one transaction). */
  count: number;
  /** Send to receipt, in ms. */
  sealMs: number | null;
}

export interface ProofModel {
  /** Which data the panel is showing. `practice` has nothing onchain to prove. */
  source: 'practice' | 'chain' | 'recorded';
  rumor: SealRecord | null;
  biggest: BiggestBatch | null;
  /** The ticks transaction that contained the verdict. */
  verdict: { record: SealRecord | null; outcome: Outcome } | null;
  ticksSealed: number;
  /** Transactions sealed so far in this run (rumor + ticks). */
  txCount: number;
}

export function sealMs(r: SealRecord): number | null {
  return r.sealedAtMs !== null && r.sentAtMs > 0 ? Math.max(0, r.sealedAtMs - r.sentAtMs) : null;
}

/** The tick transaction with the most requested depositors (at least one); the earliest wins a tie. */
export function biggestBatch(seals: readonly SealRecord[]): BiggestBatch | null {
  let best: SealRecord | null = null;
  for (const r of seals) {
    // Quiet ticks (no one has asked to withdraw yet) are not a "biggest batch".
    if (r.kind !== 'ticks' || r.status !== 'sealed' || r.requestedCount === null || r.requestedCount <= 0) continue;
    if (best === null || r.requestedCount > (best.requestedCount ?? 0)) best = r;
  }
  return best ? { record: best, count: best.requestedCount ?? 0, sealMs: sealMs(best) } : null;
}

/** The transaction whose tick range contains the verdict tick. */
export function verdictSeal(seals: readonly SealRecord[], outcome: Outcome | null): SealRecord | null {
  if (!outcome) return null;
  for (const r of seals) {
    if (r.kind !== 'ticks' || r.status !== 'sealed' || r.fromTick === null || r.toTick === null) continue;
    if (outcome.tick >= r.fromTick && outcome.tick <= r.toTick) return r;
  }
  return null;
}

export function buildProof(input: {
  mode: RunMode;
  seals: readonly SealRecord[];
  outcome: Outcome | null;
  sealedTick: number;
}): ProofModel {
  const { mode, seals, outcome } = input;
  const real = seals.filter((r) => !r.simulated);
  const practice = mode === 'practice' || (seals.length > 0 && real.length === 0);
  const source: ProofModel['source'] = practice ? 'practice' : mode === 'replay' ? 'recorded' : 'chain';
  const use = practice ? [] : real;
  return {
    source,
    rumor: use.find((r) => r.kind === 'rumor' && r.status === 'sealed') ?? null,
    biggest: biggestBatch(use),
    verdict: outcome ? { record: verdictSeal(use, outcome), outcome } : null,
    ticksSealed: input.sealedTick,
    txCount: use.filter((r) => (r.kind === 'rumor' || r.kind === 'ticks') && r.status === 'sealed').length,
  };
}

/** "14 / 14 ticks: screen and chain agree". `state` drives the colour and the icon. */
export function agreement(m: { matched: number; total: number; firstMismatchTick: number | null }): {
  state: 'none' | 'agree' | 'mismatch';
} {
  if (m.firstMismatchTick !== null || m.matched < m.total) return { state: 'mismatch' };
  return { state: m.total === 0 ? 'none' : 'agree' };
}

/**
 * What left the bank (the Street's AUSD) split into depositor payouts and fire-sale loss, so the panel's figure
 * reconciles with the vault's "out the door" + "fire-sale loss". Street holds both; the loss never exceeds it.
 */
export function streetSplit(o: { streetHeld: bigint; cumulativeLoss: bigint }): { total: bigint; paid: bigint; loss: bigint } {
  const total = o.streetHeld < 0n ? 0n : o.streetHeld;
  const loss = o.cumulativeLoss < 0n ? 0n : o.cumulativeLoss > total ? total : o.cumulativeLoss;
  return { total, paid: total - loss, loss };
}

/** Every real transaction of the run, oldest first: sealed, not simulated, with a hash to open on the explorer. */
export function chainTxs(seals: readonly SealRecord[]): SealRecord[] {
  return seals.filter((r) => r.status === 'sealed' && !r.simulated && r.txHash !== null);
}
