// Panic model constants and scoring (PRD §10.3). Pure, deterministic, only + - × ÷ min max and comparisons.
// No Math.exp/log/pow/sin here: every browser must make the same decisions. The tuner (scripts/tune.ts) owns the numbers
// in data/model.json; this file owns what they mean.
import { NodeState } from '@/types';

export interface PanicWeights {
  // spread: pTell_j = tellBase + tellStrength · strength, × whaleTellMult for whales
  tellBase: number;
  tellStrength: number;
  whaleTellMult: number;
  // score terms
  strengthW: number; // 0.50 · strength · fade
  goneW: number; // 0.35 · goneShare
  cashW: number; // 0.40 · cashStress
  queueW: number; // 0.20 · (queueLength > 0)
  haircutW: number; // 0.15 · min(1, lastHaircutBps / haircutScale)
  insuredW: number; // −0.50 · insuredShare
  fadeTicks: number; // fade(d) = max(0, 1 − d / fadeTicks)
  cashStressAt: number; // cashStress = max(0, cashStressAt − cash / depositsOwed) / cashStressAt
  haircutScale: number; // bps at which the haircut term saturates
}

export interface PanicThresholds {
  whaleBase: number;
  whaleSpan: number; // whale threshold = whaleBase + whaleSpan · u
  otherBase: number;
  otherSpan: number;
  panickingFrac: number; // display: Panicking when score ≥ panickingFrac · threshold
}

/** What the tuner can vary and the model hash commits to. */
export interface PanicParams {
  weights: PanicWeights;
  thresholds: PanicThresholds;
}

/** Decision threshold of one node, from its hashed uniform draw (`u(seed, 0, i, 1)`). */
export function thresholdOf(t: PanicThresholds, whale: boolean, draw: number): number {
  return whale ? t.whaleBase + t.whaleSpan * draw : t.otherBase + t.otherSpan * draw;
}

/** Probability that a heard node tells one un-heard neighbour in a tick. */
export function tellProbability(w: PanicWeights, strength: number, whale: boolean): number {
  const p = w.tellBase + w.tellStrength * strength;
  return whale ? p * w.whaleTellMult : p;
}

/** Rumor fades with time since the node heard it. */
export function fade(w: PanicWeights, age: number): number {
  const f = 1 - age / w.fadeTicks;
  return f > 0 ? f : 0;
}

/** Bank-wide terms of the score: identical for every node in a tick, so computed once. */
export interface BankPressure {
  cashStress: number; // 0..1
  queued: number; // 0 or 1
  haircut: number; // 0..1
}

export function bankPressure(w: PanicWeights, cash: number, depositsOwed: number, queueLength: number, lastHaircutBps: number): BankPressure {
  let cashStress = 0;
  if (depositsOwed > 0) {
    const gap = w.cashStressAt - cash / depositsOwed;
    cashStress = gap > 0 ? gap / w.cashStressAt : 0;
  }
  const h = lastHaircutBps / w.haircutScale;
  return { cashStress, queued: queueLength > 0 ? 1 : 0, haircut: h < 1 ? h : 1 };
}

/** The PRD §10.3 panic score of one node that has heard the rumor and not yet requested. */
export function panicScore(
  w: PanicWeights,
  strength: number,
  age: number,
  goneShare: number,
  insuredShare: number,
  p: BankPressure,
): number {
  return (
    w.strengthW * strength * fade(w, age) +
    w.goneW * goneShare +
    w.cashW * p.cashStress +
    w.queueW * p.queued +
    w.haircutW * p.haircut -
    w.insuredW * insuredShare
  );
}

/** UI display state of a node that has heard the rumor and has not requested (requested nodes are Queued/Withdrawn/Trapped). */
export function listeningState(t: PanicThresholds, score: number, threshold: number): NodeState {
  return score >= t.panickingFrac * threshold ? NodeState.Panicking : NodeState.Heard;
}
