import type { Address, Hex } from 'viem';

// ── Domain ──────────────────────────────────────────────────────────────
export type BankLevel = 0 | 1;          // 0 = Bhau's Bank (no defences), 1 = Monad Mutual (speed bump + insurance)
export type RumorCard = 0 | 1 | 2 | 3;  // Q W E R
export type BankStatus = 'ready' | 'running' | 'failed' | 'survived';

export const NodeState = { Calm: 0, Heard: 1, Panicking: 2, Queued: 3, Withdrawn: 4, Trapped: 5 } as const;
export type NodeState = (typeof NodeState)[keyof typeof NodeState];

export interface BankConfig {
  cash0: bigint; bonds0: bigint;           // AUSD base units (6 dp)
  speedBumpBps: number;                    // 0 = none
  insuredCap: bigint;                      // 0n = none
  haircutBaseBps: number; haircutSlopeBps: number; haircutMaxBps: number;
  quietTicks: number;
}

export interface Ledger {
  balances: bigint[];                      // length N, base units
  deposits0: bigint;
  packed: bigint[];                        // 63 words, 8 × uint32 per word (PRD §9.1)
  ledgerHash: Hex;
}

export interface GraphNode { id: number; x: number; y: number; degree: number; whale: boolean }
export interface GraphData { nodes: GraphNode[]; edges: [number, number][]; neighbors: number[][] }

export interface RumorCardDef { id: RumorCard; hotkey: 'Q' | 'W' | 'E' | 'R'; text: string; strength: number; seedNode: number }

export interface Model {
  graph: GraphData; ledger: Ledger;
  configs: Record<BankLevel, BankConfig>;
  cards: RumorCardDef[];
  modelHash: Hex; modelVersion: string;
}

export interface BankState {
  status: BankStatus; tick: number;
  cash: bigint; bonds: bigint; depositsOwed: bigint; insuredOwed: bigint; deposits0: bigint;
  cumulativeLoss: bigint; lastHaircutBps: number; quietCount: number; withdrawnCount: number;
  queue: number[];                         // FIFO, head first
  withdrawn: Uint8Array; queued: Uint8Array; // length N, 0 or 1
}

export interface TickPayload { tick: number; requested: number[] }  // strictly ascending ids

export interface TickResult {
  tick: number; requested: number[]; served: number[]; skipped: number;
  paid: bigint; bondsSold: bigint; fireSaleLoss: bigint; haircutBps: number;
  cashAfter: bigint; bondsAfter: bigint; depositsOwedAfter: bigint; queueLengthAfter: number;
  statusAfter: BankStatus;
  trapped: { count: number; amount: bigint; uninsured: bigint } | null; // set when statusAfter === 'failed'
}

export interface SimFrame {
  tick: number;
  nodeState: Uint8Array; panic: Float32Array;   // per node; panic = score / threshold
  heardAt: Int16Array; goneAt: Int16Array;       // tick, or -1
  newlyHeard: number[]; newlyRequested: number[]; newlyServed: number[];
  bank: BankState; last: TickResult | null;
}

export interface RunParams { level: BankLevel; card: RumorCard; seedNode: number; modelSeed: bigint }
export interface RunState { params: RunParams; frame: SimFrame; history: TickPayload[]; internal: unknown }

// ── Chain ───────────────────────────────────────────────────────────────
export type RunMode = 'live' | 'practice' | 'replay' | 'spectate';
export type RunPhase = 'idle' | 'switching' | 'starting' | 'running' | 'failing' | 'surviving' | 'failed' | 'survived' | 'resetting' | 'paused';
export type SealHealth = 'idle' | 'sealing' | 'delayed' | 'paused' | 'offline';
export type TxKind = 'setLevel' | 'rumor' | 'ticks' | 'reset' | 'ping' | 'fund' | 'loadLedger';

export interface SealRecord {
  id: number; kind: TxKind; simulated: boolean;
  fromTick: number | null; toTick: number | null; requestedCount: number | null;
  txHash: Hex | null; blockNumber: bigint | null;
  sentAtMs: number; sealedAtMs: number | null;   // Date.now()
  gasLimit: bigint | null; gasUsed: bigint | null;
  status: 'pending' | 'sealed' | 'reverted' | 'dropped';
  finalized: boolean; mirrorMatch: boolean | null; rpc: string | null;
}

export interface TickSealedEvent {
  runId: number; tick: number; requested: number[];
  served: number; skipped: number; haircutBps: number; queueLengthAfter: number;
  paid: bigint; bondsSold: bigint; fireSaleLoss: bigint;
  cashAfter: bigint; bondsAfter: bigint; depositsOwedAfter: bigint;
  txHash: Hex; blockNumber: bigint; logIndex: number;
}
export interface RumorEvent { runId: number; level: BankLevel; card: RumorCard; seedNode: number; modelSeed: bigint; modelHash: Hex; startBlock: bigint; txHash: Hex; blockNumber: bigint }
export interface OutcomeEvent { kind: 'failed' | 'survived'; runId: number; tick: number; trappedCount: number; trappedAmount: bigint; uninsuredTrapped: bigint; txHash: Hex; blockNumber: bigint }
export interface SealResult { record: SealRecord; rumor: RumorEvent | null; ticks: TickSealedEvent[]; outcome: OutcomeEvent | null }

export interface BankSnapshotView {
  status: BankStatus; level: BankLevel; runId: number; tick: number;
  cash: bigint; bonds: bigint; depositsOwed: bigint; insuredOwed: bigint; deposits0: bigint;
  cumulativeLoss: bigint; lastHaircutBps: number; queueLength: number; quietCount: number; withdrawnCount: number;
  startBlock: bigint; ausdHeld: bigint; streetHeld: bigint; ledgerHash: Hex; configHash: Hex;
  readAtBlock: bigint | null;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'pending';
export interface PreflightCheck { id: string; label: string; status: CheckStatus; detail: string; critical: boolean }
export interface PreflightReport { checks: PreflightCheck[]; ok: boolean; at: number }

export interface UiError {
  code: string; title: string; detail: string;
  action: { label: string; run: 'retry' | 'reset' | 'replay' | 'ops' | 'backup' } | null;
}

// ── App ─────────────────────────────────────────────────────────────────
export interface Outcome {
  kind: 'failed' | 'survived'; tick: number;
  wallMs: number | null;                   // rumor receipt → outcome receipt
  blocks: number | null; rumorBlock: bigint | null; outcomeBlock: bigint | null;
  trappedCount: number; trappedAmount: bigint; uninsuredTrapped: bigint; withdrawnAmount: bigint;
  sealed: boolean;                         // false in practice mode
}

export interface RunView {
  mode: RunMode; phase: RunPhase; level: BankLevel; card: RumorCard | null;
  model: Model | null; frame: SimFrame | null;
  sealedTick: number; seals: SealRecord[]; health: SealHealth;
  startedAtMs: number | null; elapsedMs: number;
  blockNumber: bigint | null; finalizedBlock: bigint | null;
  outcome: Outcome | null; onchain: BankSnapshotView | null; preflight: PreflightReport | null;
  pending: { switching: boolean; starting: boolean; resetting: boolean; funding: boolean; pinging: boolean; preflight: boolean };
  error: UiError | null;
  mirror: { matched: number; total: number; firstMismatchTick: number | null };
  decisions: { matched: number; total: number } | null;      // P1 decision check
  replay: { id: string; name: string; recordedAt: string } | null;
  operator: { address: Address | null; balanceWei: bigint | null; backupAddress: Address | null; usingBackup: boolean };
  deployment: { runBank: Address | null; street: Address | null; ausd: Address; deployed: boolean };
}

export interface UiState { proofOpen: boolean; passbookOpen: boolean; helpOpen: boolean; muted: boolean; reducedMotion: boolean }

export interface ReplayFile {
  version: 1; id: string; name: string; recordedAt: string;
  chainId: number; runBank: Address; runId: number;
  params: { level: BankLevel; card: RumorCard; seedNode: number; modelSeed: string; modelHash: Hex };
  rumor: { txHash: Hex; blockNumber: string };
  ticks: TickPayload[];
  seals: { fromTick: number; toTick: number; txHash: Hex; blockNumber: string; sentAtMs: number; sealedAtMs: number; gasUsed: string }[];
  outcome: { kind: 'failed' | 'survived'; tick: number; txHash: Hex; blockNumber: string; atMs: number; trappedCount: number; trappedAmount: string; uninsuredTrapped: string };
}
export interface ReplayIndexEntry { id: string; name: string; recordedAt: string; kind: 'failed' | 'survived'; level: BankLevel }
