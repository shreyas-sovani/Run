// Decoding of RunBank logs and snapshots into the frozen app types (PRD §16.1).
import { parseEventLogs } from 'viem';
import type { Address, Hex, Log } from 'viem';
import type {
  BankLevel,
  BankSnapshotView,
  BankStatus,
  OutcomeEvent,
  RumorCard,
  RumorEvent,
  TickSealedEvent,
} from '@/types';
import { runBankAbi } from './abi';
import { BANK_STATUS_NAMES } from './errors';

export const ZERO_HASH: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function statusOf(n: number | bigint): BankStatus {
  return BANK_STATUS_NAMES[Number(n)] ?? 'ready';
}

/** Shape returned by `snapshot()` (named tuple components). */
export interface RawSnapshot {
  status: number | bigint;
  level: number | bigint;
  runId: number | bigint;
  tick: number | bigint;
  cash: bigint;
  bonds: bigint;
  depositsOwed: bigint;
  insuredOwed: bigint;
  deposits0: bigint;
  cumulativeLoss: bigint;
  lastHaircutBps: number | bigint;
  queueLength: number | bigint;
  quietCount: number | bigint;
  withdrawnCount: number | bigint;
  startBlock: bigint;
  ausdHeld: bigint;
  streetHeld: bigint;
  ledgerHash: Hex;
  configHash: Hex;
}

export function decodeSnapshot(s: RawSnapshot, readAtBlock: bigint | null): BankSnapshotView {
  return {
    status: statusOf(s.status),
    level: (Number(s.level) === 1 ? 1 : 0) as BankLevel,
    runId: Number(s.runId),
    tick: Number(s.tick),
    cash: s.cash,
    bonds: s.bonds,
    depositsOwed: s.depositsOwed,
    insuredOwed: s.insuredOwed,
    deposits0: s.deposits0,
    cumulativeLoss: s.cumulativeLoss,
    lastHaircutBps: Number(s.lastHaircutBps),
    queueLength: Number(s.queueLength),
    quietCount: Number(s.quietCount),
    withdrawnCount: Number(s.withdrawnCount),
    startBlock: s.startBlock,
    ausdHeld: s.ausdHeld,
    streetHeld: s.streetHeld,
    ledgerHash: s.ledgerHash,
    configHash: s.configHash,
    readAtBlock,
  };
}

export interface DecodedLogs {
  rumor: RumorEvent | null;
  ticks: TickSealedEvent[];
  outcome: OutcomeEvent | null;
  /** runId of a `BankReset`, if the logs contain one. */
  reset: number | null;
  /** Every decoded event in chain order, for consumers that care about interleaving (the spectator). */
  ordered: DecodedEvent[];
}

export type DecodedEvent =
  | { type: 'rumor'; event: RumorEvent; blockNumber: bigint; logIndex: number }
  | { type: 'tick'; event: TickSealedEvent; blockNumber: bigint; logIndex: number }
  | { type: 'outcome'; event: OutcomeEvent; blockNumber: bigint; logIndex: number }
  | { type: 'reset'; runId: number; blockNumber: bigint; logIndex: number };

/** Decode every RunBank event in `logs` (other contracts' logs and unknown topics are ignored). */
export function decodeBankLogs(logs: readonly Log[], runBank: Address): DecodedLogs {
  const want = runBank.toLowerCase();
  const mine = logs.filter((l) => l.address.toLowerCase() === want && !l.removed);
  const parsed = parseEventLogs({ abi: runBankAbi, logs: mine as Log[], strict: false });

  const out: DecodedLogs = { rumor: null, ticks: [], outcome: null, reset: null, ordered: [] };
  for (const l of parsed) {
    if (l.transactionHash === null || l.blockNumber === null || l.logIndex === null) continue;
    const base = { txHash: l.transactionHash, blockNumber: l.blockNumber };
    const at = { blockNumber: l.blockNumber, logIndex: l.logIndex };
    switch (l.eventName) {
      case 'RumorStarted': {
        const a = l.args as {
          runId: number; level: number; card: number; seedNode: number; modelSeed: bigint; modelHash: Hex; startBlock: bigint;
        };
        const event: RumorEvent = {
          runId: Number(a.runId), level: (Number(a.level) === 1 ? 1 : 0) as BankLevel, card: Number(a.card) as RumorCard,
          seedNode: Number(a.seedNode), modelSeed: a.modelSeed, modelHash: a.modelHash, startBlock: a.startBlock, ...base,
        };
        out.rumor = event;
        out.ordered.push({ type: 'rumor', event, ...at });
        break;
      }
      case 'TickSealed': {
        const a = l.args as {
          runId: number;
          tick: number;
          requested: readonly number[];
          summary: {
            served: number; skipped: number; haircutBps: number; queueLengthAfter: number;
            paid: bigint; bondsSold: bigint; fireSaleLoss: bigint; cashAfter: bigint; bondsAfter: bigint; depositsOwedAfter: bigint;
          };
        };
        const s = a.summary;
        const event: TickSealedEvent = {
          runId: Number(a.runId), tick: Number(a.tick), requested: a.requested.map(Number),
          served: Number(s.served), skipped: Number(s.skipped), haircutBps: Number(s.haircutBps),
          queueLengthAfter: Number(s.queueLengthAfter), paid: s.paid, bondsSold: s.bondsSold, fireSaleLoss: s.fireSaleLoss,
          cashAfter: s.cashAfter, bondsAfter: s.bondsAfter, depositsOwedAfter: s.depositsOwedAfter,
          ...base, logIndex: l.logIndex,
        };
        out.ticks.push(event);
        out.ordered.push({ type: 'tick', event, ...at });
        break;
      }
      case 'BankFailed': {
        const a = l.args as { runId: number; tick: number; trappedCount: number; trappedAmount: bigint; uninsuredTrapped: bigint };
        const event: OutcomeEvent = {
          kind: 'failed', runId: Number(a.runId), tick: Number(a.tick), trappedCount: Number(a.trappedCount),
          trappedAmount: a.trappedAmount, uninsuredTrapped: a.uninsuredTrapped, ...base,
        };
        out.outcome = event;
        out.ordered.push({ type: 'outcome', event, ...at });
        break;
      }
      case 'BankSurvived': {
        const a = l.args as { runId: number; tick: number };
        const event: OutcomeEvent = {
          kind: 'survived', runId: Number(a.runId), tick: Number(a.tick), trappedCount: 0, trappedAmount: 0n, uninsuredTrapped: 0n, ...base,
        };
        out.outcome = event;
        out.ordered.push({ type: 'outcome', event, ...at });
        break;
      }
      case 'BankReset': {
        const a = l.args as { runId: number };
        out.reset = Number(a.runId);
        out.ordered.push({ type: 'reset', runId: Number(a.runId), ...at });
        break;
      }
      default:
        break;
    }
  }
  out.ticks.sort((a, b) => a.tick - b.tick || a.logIndex - b.logIndex);
  return out;
}
