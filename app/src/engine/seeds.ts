// P2: bestSeeds(model, card). Which depositor should start the rumor? Rank candidates by what their rumor does to
// Bhau's Bank (the defenceless bank): who brings it down fastest and loudest. Pure and deterministic; memoised per model.
import type { Model, RumorCard } from '@/types';
import { evaluate } from './eval';
import { defaultParams } from './model';

const cache = new WeakMap<Model, Map<RumorCard, number[]>>();
const CANDIDATES = 40;

/** Cheap structural pre-filter: money held by the node and (half-weighted) by its neighbours. */
function structural(model: Model): number[] {
  const bal = model.ledger.balances;
  return model.graph.nodes
    .map((n) => {
      let s = Number(bal[n.id]) / 1e6;
      for (const k of model.graph.neighbors[n.id]) s += (Number(bal[k]) / 1e6) * 0.5;
      return { id: n.id, s };
    })
    .sort((a, b) => b.s - a.s || a.id - b.id)
    .slice(0, CANDIDATES)
    .map((x) => x.id);
}

/** Good starting depositors for a card, best first (the ones whose rumor ruins Bhau's Bank soonest and is heard by the most). */
export function bestSeeds(model: Model, card: RumorCard, count = 8): number[] {
  let byCard = cache.get(model);
  if (!byCard) cache.set(model, (byCard = new Map()));
  let ranked = byCard.get(card);
  if (!ranked) {
    ranked = structural(model)
      .map((id) => {
        const r = evaluate(model, defaultParams(model, 0, card, id));
        // failed runs first, fastest first; then by how many heard
        return { id, failed: r.outcome === 'failed' ? 0 : 1, tick: r.tick, heard: r.heardPct };
      })
      .sort((a, b) => a.failed - b.failed || a.tick - b.tick || b.heard - a.heard || a.id - b.id)
      .map((x) => x.id);
    byCard.set(card, ranked);
  }
  return ranked.slice(0, count);
}
