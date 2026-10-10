// Chain barrel interfaces (PRD §16.3). Frozen: additive changes only.
import type { Address, Hex } from 'viem';
import type {
  BankConfig,
  BankLevel,
  BankSnapshotView,
  Model,
  OutcomeEvent,
  PreflightReport,
  ReplayFile,
  RumorEvent,
  RunParams,
  SealHealth,
  SealResult,
  TickPayload,
  TickSealedEvent,
  UiError,
} from '@/types';

export interface BlockInfo { number: bigint; finalized: bigint | null }

export interface ChainAdapter {
  readonly kind: 'live' | 'mock';
  readonly operator: Address | null;
  preflight(model: Model): Promise<PreflightReport>;
  readSnapshot(): Promise<BankSnapshotView>;
  setLevel(level: BankLevel, cfg: BankConfig): Promise<SealResult>;
  startRumor(params: RunParams, modelHash: Hex): Promise<SealResult>; // result.rumor set
  sealTicks(firstTick: number, ticks: number[][]): Promise<SealResult>; // result.ticks, result.outcome
  reset(): Promise<SealResult>;
  ping(): Promise<SealResult>;
  fundBank(amount: bigint): Promise<SealResult>;
  balances(): Promise<{ primary: bigint; backup: bigint | null }>;
  /** False if there is no backup key. (Named without "use" so lint doesn't treat it as a hook.) */
  switchToBackup(): boolean;
  watchBlocks(cb: (b: BlockInfo) => void): () => void;
  /**
   * Additive (C). Rebuild the `SealResult` of ticks that already landed (used by SealQueue's
   * `TickMismatch` / `WrongStatus` recovery). Returns null when the logs can't be found.
   */
  recoverTicks?(fromTick: number, toTick: number): Promise<SealResult | null>;
}

export interface SealQueue {
  push(p: TickPayload): void;
  readonly sealedTick: number;
  readonly pending: number;
  readonly health: SealHealth;
  onSealed(cb: (r: SealResult) => void): () => void;
  onHealth(cb: (h: SealHealth) => void): () => void;
  onError(cb: (e: UiError) => void): () => void;
  /** Resolves when everything pushed is sealed (or the queue is stopped). Stays pending while paused. */
  drain(): Promise<void>;
  retry(): void;
  stop(): void;
}

export interface SealQueueOptions {
  maxTicksPerTx?: number;
  delayedAfterMs?: number;
  /** Additive: auto-retry attempts after a timeout / offline before pausing. Default 3 (offline retries forever). */
  timeoutRetries?: number;
  /** Additive: delay between automatic retries. Default 500 ms (offline: 2000 ms). */
  retryDelayMs?: number;
}

export interface Spectator {
  start(): void;
  stop(): void;
  onRumor(cb: (e: RumorEvent) => void): () => void;
  onTicks(cb: (e: TickSealedEvent[]) => void): () => void;
  onOutcome(cb: (e: OutcomeEvent) => void): () => void;
  onReset(cb: (runId: number) => void): () => void;
  onSnapshot(cb: (s: BankSnapshotView) => void): () => void;
}

export interface Recorder {
  begin(params: RunParams, rumor: RumorEvent, modelHash: Hex): void;
  add(r: SealResult): void;
  finish(o: OutcomeEvent): ReplayFile | null;
  current(): ReplayFile | null;
}

/** Additive (C-13): one row per `sealTicks` batch, for gas-model calibration (PRD §12.3). */
export interface GasLogEntry {
  at: number;
  ticks: number;
  ids: number;
  /** Distinct 8-per-slot ledger words the ids touch (a proxy for cold-storage reads). */
  distinctSlots: number;
  /** `estimateGas` result, or null when the formula was used without estimating. */
  estimate: bigint | null;
  /** The A formula's value for this batch (null until A's model is calibrated is irrelevant: always computed). */
  formula: bigint;
  gasLimit: bigint;
  gasUsed: bigint;
  mode: 'estimate' | 'formula';
  txHash: Hex;
}

export type GasMode = 'estimate' | 'formula';

/** Additive: what `createLiveAdapter` really returns. Everything beyond `ChainAdapter` is optional for consumers. */
export interface LiveAdapter extends ChainAdapter {
  readonly kind: 'live';
  readonly gasLog: readonly GasLogEntry[];
  readonly usingBackup: boolean;
  readonly primaryAddress: Address;
  readonly backupAddress: Address | null;
  gasMode: GasMode;
  /** Name of the RPC that last answered, for the proof panel. */
  lastRpc(): string | null;
  /** Cancels timers and block-feed subscriptions. */
  dispose(): void;
}
