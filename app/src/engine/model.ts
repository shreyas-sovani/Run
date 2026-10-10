// Model loading (B-07): reads data/*.json, builds the frozen `Model` (PRD §16.1) and carries the panic tuning next to it.
// Pure: no network, no DOM. The only library imports are viem's pure hashing utils.
import { keccak256, toHex } from 'viem';
import type { Hex } from 'viem';
import type { BankConfig, BankLevel, GraphData, Ledger, Model, RumorCard, RumorCardDef, RunParams } from '@/types';
import { hashConfig } from './bank';
import { hashLedgerWords } from './ledger';
import type { PanicParams } from './panic';
import cardsJson from './data/cards.json';
import configsJson from './data/configs.json';
import graphJson from './data/graph.json';
import ledgerJson from './data/ledger.json';
import modelJson from './data/model.json';

export const TICK_MS = 400;
export const MAX_LEAD = 6;

/** Shape of data/model.json (written by `pnpm tune --search`). */
export interface ModelFile extends PanicParams {
  modelVersion: string;
  strengths: number[]; // per card, mirrors cards.json
  seeds: number[]; // seed node per card, mirrors cards.json
  modelSeeds: string[]; // constant modelSeed per card (decimal strings, < 2^64)
  inputs: { ledgerHash: Hex; graphHash: Hex; configHashes: Hex[] };
  modelHash: Hex;
}

/** What the run engine needs on top of the frozen `Model`. */
export interface Tuning extends PanicParams {
  modelSeeds: bigint[];
}

/** JSON with sorted keys and no whitespace: the same bytes in every environment. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function graphHashOf(neighbors: readonly (readonly number[])[]): Hex {
  return keccak256(toHex(canonicalJson(neighbors)));
}

/** modelHash = keccak256 of the canonical JSON of the model file without its own hash. */
export function hashModelFile(f: Omit<ModelFile, 'modelHash'>): Hex {
  return keccak256(toHex(canonicalJson(f)));
}

/** The inputs a model hash commits to besides the tuning: the ledger, the graph and both bank configs. */
export function modelInputs(m: Pick<Model, 'graph' | 'ledger' | 'configs'>): ModelFile['inputs'] {
  return {
    ledgerHash: hashLedgerWords(m.ledger.packed),
    graphHash: graphHashOf(m.graph.neighbors),
    configHashes: [hashConfig(m.configs[0]), hashConfig(m.configs[1])],
  };
}

/** Assemble a complete, hashed model file from a model and its tuning (used by gen-model.ts and the tuner). */
export function buildModelFile(
  model: Pick<Model, 'graph' | 'ledger' | 'configs' | 'cards'>,
  tuning: Tuning,
  modelVersion: string,
): ModelFile {
  const body: Omit<ModelFile, 'modelHash'> = {
    modelVersion,
    weights: tuning.weights,
    thresholds: tuning.thresholds,
    strengths: model.cards.map((c) => c.strength),
    seeds: model.cards.map((c) => c.seedNode),
    modelSeeds: tuning.modelSeeds.map((s) => s.toString()),
    inputs: modelInputs(model),
  };
  return { ...body, modelHash: hashModelFile(body) };
}

const toConfig = (c: Record<string, string | number>): BankConfig => ({
  cash0: BigInt(c.cash0), bonds0: BigInt(c.bonds0), speedBumpBps: Number(c.speedBumpBps), insuredCap: BigInt(c.insuredCap),
  haircutBaseBps: Number(c.haircutBaseBps), haircutSlopeBps: Number(c.haircutSlopeBps), haircutMaxBps: Number(c.haircutMaxBps),
  quietTicks: Number(c.quietTicks),
});

const tunings = new WeakMap<Model, Tuning>();
let cached: Model | null = null;

export function loadModel(): Model {
  if (cached) return cached;
  const file = modelJson as unknown as ModelFile;
  const graph: GraphData = {
    nodes: graphJson.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, degree: n.degree, whale: n.whale })),
    edges: graphJson.edges.map(([a, b]) => [a, b] as [number, number]),
    neighbors: graphJson.neighbors.map((l) => l.slice()),
  };
  const packed = ledgerJson.packed.map((w) => BigInt(w));
  const ledger: Ledger = {
    balances: ledgerJson.balances.map((b) => BigInt(b)),
    deposits0: BigInt(ledgerJson.deposits0),
    packed,
    ledgerHash: ledgerJson.ledgerHash as Hex,
  };
  const configs: Record<BankLevel, BankConfig> = { 0: toConfig(configsJson['0']), 1: toConfig(configsJson['1']) };
  const cards: RumorCardDef[] = cardsJson.map((c) => ({
    id: c.id as RumorCard, hotkey: c.hotkey as RumorCardDef['hotkey'], text: c.text, strength: c.strength, seedNode: c.seedNode,
  }));
  const model: Model = { graph, ledger, configs, cards, modelHash: file.modelHash, modelVersion: file.modelVersion };
  tunings.set(model, {
    weights: { ...file.weights }, thresholds: { ...file.thresholds }, modelSeeds: file.modelSeeds.map((s) => BigInt(s)),
  });
  cached = model;
  return model;
}

/** Panic tuning of a model. Models built by hand (tests) fall back to the shipped tuning. */
export function tuningOf(model: Model): Tuning {
  return tunings.get(model) ?? tunings.get(loadModel())!;
}

/** A copy of `base` with different tuning / cards / configs, for the tuner and tests. Never used at runtime. */
export function deriveModel(
  base: Model,
  patch: { tuning?: Partial<Tuning>; cards?: RumorCardDef[]; configs?: Record<BankLevel, BankConfig> },
): Model {
  const m: Model = { ...base, cards: patch.cards ?? base.cards, configs: patch.configs ?? base.configs };
  const t = tuningOf(base);
  tunings.set(m, { ...t, ...patch.tuning });
  return m;
}

/** Default run parameters: the card's seed node (or a chosen one) and a constant modelSeed per card, so rehearsals replay identically. */
export function defaultParams(model: Model, level: BankLevel, card: RumorCard, seedNode?: number): RunParams {
  return { level, card, seedNode: seedNode ?? model.cards[card].seedNode, modelSeed: tuningOf(model).modelSeeds[card] };
}
