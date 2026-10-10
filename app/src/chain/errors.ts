// Error classes and plain-language translation (PRD §12.6). Never include raw hex blobs or keys.
import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  NonceTooLowError,
  RawContractError,
  TimeoutError,
  TransactionReceiptNotFoundError,
  WaitForTransactionReceiptTimeoutError,
  decodeErrorResult,
  formatUnits,
} from 'viem';
import type { UiError } from '@/types';
import { runBankAbi } from './abi';

export const BANK_STATUS_NAMES = ['ready', 'running', 'failed', 'survived'] as const;

/** A decoded RunBank custom error (or a mock-adapter equivalent). */
export class RunBankRevert extends Error {
  readonly errorName: string;
  readonly args: readonly unknown[];
  /** Tick the failing batch started at, when known. */
  readonly tick: number | null;
  constructor(errorName: string, args: readonly unknown[] = [], tick: number | null = null, options?: { cause?: unknown }) {
    super(`RunBank reverted: ${errorName}`, options);
    this.name = 'RunBankRevert';
    this.errorName = errorName;
    this.args = args;
    this.tick = tick;
  }
}

/** The sync send or the receipt lookup didn't finish in time. Retryable. */
export class ChainTimeoutError extends Error {
  readonly tick: number | null;
  constructor(tick: number | null = null, options?: { cause?: unknown }) {
    super('Timed out waiting for the receipt', options);
    this.name = 'ChainTimeoutError';
    this.tick = tick;
  }
}

/** Every RPC failed. */
export class AllRpcsDownError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Every RPC failed', options);
    this.name = 'AllRpcsDownError';
  }
}

/** The operator wallet is below the safe MON level. */
export class LowBalanceError extends Error {
  readonly balanceWei: bigint;
  readonly kind: 'gas' | 'refuse';
  constructor(balanceWei: bigint, kind: 'gas' | 'refuse' = 'gas') {
    super('Operator wallet is low on MON');
    this.name = 'LowBalanceError';
    this.balanceWei = balanceWei;
    this.kind = kind;
  }
}

/** Reserve-balance rule rejection. */
export class ReserveBalanceError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Reserve balance rule', options);
    this.name = 'ReserveBalanceError';
  }
}

function walk(e: unknown, pred: (x: unknown) => boolean): unknown {
  if (e instanceof BaseError) {
    const hit = e.walk(pred as (err: unknown) => boolean);
    return hit ?? null;
  }
  let cur: unknown = e;
  for (let i = 0; i < 8 && cur; i++) {
    if (pred(cur)) return cur;
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

/** Pull a RunBank custom error out of any error shape (ours, or viem's). */
export function extractRevert(e: unknown): { name: string; args: readonly unknown[]; tick: number | null } | null {
  if (e instanceof RunBankRevert) return { name: e.errorName, args: e.args, tick: e.tick };
  const own = walk(e, (x) => x instanceof RunBankRevert) as RunBankRevert | null;
  if (own) return { name: own.errorName, args: own.args, tick: own.tick };
  const reverted = walk(e, (x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
  if (reverted?.data?.errorName) return { name: reverted.data.errorName, args: reverted.data.args ?? [], tick: null };
  const raw = walk(e, (x) => x instanceof RawContractError) as RawContractError | null;
  let data = typeof raw?.data === 'string' ? raw.data : (raw?.data as { data?: string } | undefined)?.data;
  if (!data) {
    // A plain `eth_call` / `eth_estimateGas` revert: viem keeps the revert data on the RPC error (code 3), not on a contract error.
    const holder = walk(e, (x) => {
      const d = (x as { data?: unknown } | null)?.data;
      const s = typeof d === 'string' ? d : (d as { data?: unknown } | undefined)?.data;
      return typeof s === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(s);
    }) as { data?: string | { data?: string } } | null;
    const d = holder?.data;
    data = typeof d === 'string' ? d : d?.data;
  }
  if (data && data.startsWith('0x') && data.length >= 10) {
    try {
      const d = decodeErrorResult({ abi: runBankAbi, data: data as `0x${string}` });
      return { name: d.errorName, args: (d.args ?? []) as readonly unknown[], tick: null };
    } catch {
      /* not a RunBank error */
    }
  }
  return null;
}

const msgOf = (e: unknown): string => {
  if (e instanceof BaseError) return `${e.shortMessage} ${e.details ?? ''}`;
  return e instanceof Error ? e.message : String(e);
};

export function isNonceTooLow(e: unknown): boolean {
  return !!walk(e, (x) => x instanceof NonceTooLowError) || /nonce too low|nonce is too low/i.test(msgOf(e));
}
export function isAlreadyKnown(e: unknown): boolean {
  return /already known|known transaction|already imported|replacement transaction underpriced|already in (the )?(mempool|pool)/i.test(msgOf(e));
}
export function isInsufficientFunds(e: unknown): boolean {
  return !!walk(e, (x) => x instanceof InsufficientFundsError) || /insufficient funds|insufficient balance for transfer|exceeds balance/i.test(msgOf(e));
}
export function isReserveBalance(e: unknown): boolean {
  return e instanceof ReserveBalanceError || /reserve balance|reserve rule|below reserve/i.test(msgOf(e));
}
export function isTimeout(e: unknown): boolean {
  return (
    e instanceof ChainTimeoutError ||
    !!walk(e, (x) => x instanceof TimeoutError || x instanceof WaitForTransactionReceiptTimeoutError || x instanceof TransactionReceiptNotFoundError) ||
    /timed? ?out|timeout|expired/i.test(msgOf(e))
  );
}
export function isNetworkDown(e: unknown): boolean {
  return (
    e instanceof AllRpcsDownError ||
    !!walk(e, (x) => x instanceof HttpRequestError) ||
    /fetch failed|failed to fetch|network ?error|ECONNREFUSED|ENOTFOUND|ECONNRESET|socket hang up|HTTP request failed|\b429\b|too many requests|rate.?limit/i.test(msgOf(e))
  );
}

const ausd = (v: unknown): string => {
  try {
    const n = Number(formatUnits(BigInt(v as bigint), 6));
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  } catch {
    return '?';
  }
};
const mon = (wei: bigint): string => {
  const n = Number(formatUnits(wei, 18));
  return `${n.toFixed(n >= 100 ? 0 : 2)} MON`;
};

const sanitize = (s: string): string =>
  s
    .replace(/0x[0-9a-fA-F]{40,}/g, '0x…') // keys, hashes, calldata, addresses
    .replace(/[0-9a-fA-F]{64}/g, '…') // key without 0x
    .replace(/\s+/g, ' ')
    .trim();

function shortReason(e: unknown): string {
  const first = (e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e)).split('\n')[0] ?? '';
  const s = sanitize(first).replace(/[.!\s]+$/, '');
  return s.length > 120 ? `${s.slice(0, 117)}…` : s || 'unknown error';
}

export function translateError(e: unknown): UiError {
  const rv = extractRevert(e);
  if (rv) {
    const a = rv.args;
    switch (rv.name) {
      case 'NotOperator':
        return { code: 'NotOperator', title: 'Not the operator', detail: "This key can't run the bank. Load the operator key on the Ops page.", action: { label: 'Open Ops', run: 'ops' } };
      case 'WrongStatus': {
        const actual = BANK_STATUS_NAMES[Number(a[1])] ?? 'in another state';
        return { code: 'WrongStatus', title: 'Bank is not ready', detail: `The bank is ${actual}. Reset the bank first.`, action: { label: 'Reset the bank', run: 'reset' } };
      }
      case 'TickMismatch':
        return { code: 'TickMismatch', title: 'Screen and chain disagree', detail: 'Screen and chain disagree on the tick. Press Reset to start clean.', action: { label: 'Reset the bank', run: 'reset' } };
      case 'BadDepositor':
      case 'NotAscending': {
        const n = rv.tick;
        return { code: rv.name, title: 'Bad batch', detail: `The engine sent a bad batch${n === null ? '' : ` (tick ${n})`}. Press Reset.`, action: { label: 'Reset the bank', run: 'reset' } };
      }
      case 'Underfunded':
        return { code: 'Underfunded', title: 'Bank is underfunded', detail: `The bank holds ${ausd(a[1])} AUSD but needs ${ausd(a[0])} AUSD. Fund it on the Ops page.`, action: { label: 'Open Ops', run: 'ops' } };
      case 'LedgerNotLoaded':
        return { code: 'LedgerNotLoaded', title: 'Ledger missing', detail: "The depositor ledger isn't loaded onchain yet.", action: { label: 'Open Ops', run: 'ops' } };
      case 'BadConfig':
        return { code: 'BadConfig', title: 'Bank config rejected', detail: 'The contract rejected this bank config. Check the Ops page.', action: { label: 'Open Ops', run: 'ops' } };
      default:
        break; // unknown custom error: fall through to the generic path below
    }
  }

  if (e instanceof LowBalanceError) {
    return {
      code: e.kind === 'refuse' ? 'low_balance' : 'insufficient_funds',
      title: 'Operator is low on MON',
      detail: `The operator wallet is low on MON (${mon(e.balanceWei)}). Switch to the backup key.`,
      action: { label: 'Switch to backup key', run: 'backup' },
    };
  }
  if (isReserveBalance(e)) {
    return { code: 'reserve_balance', title: 'Reserve rule blocked the send', detail: "Monad's 10 MON reserve rule blocked this send. Top up the operator above 15 MON.", action: { label: 'Switch to backup key', run: 'backup' } };
  }
  if (isInsufficientFunds(e)) {
    return { code: 'insufficient_funds', title: 'Operator is low on MON', detail: 'The operator wallet is low on MON. Switch to the backup key.', action: { label: 'Switch to backup key', run: 'backup' } };
  }
  if (isNonceTooLow(e)) {
    // Handled silently by the adapter; if it ever reaches the UI it should read as a retry, not a failure.
    return { code: 'nonce', title: 'Resyncing', detail: 'Resyncing with the chain…', action: null };
  }
  if (e instanceof ChainTimeoutError || isTimeout(e)) {
    const tick = e instanceof ChainTimeoutError ? e.tick : null;
    return { code: 'timeout', title: 'Sealing is slow', detail: `Monad hasn't sealed ${tick === null ? 'this tick' : `tick ${tick}`} yet. Retrying…`, action: null };
  }
  if (isNetworkDown(e)) {
    return { code: 'offline', title: "Can't reach Monad", detail: "Can't reach Monad testnet. Retrying every 2 s. Press Shift+R for the recorded run.", action: { label: 'Play the recorded run', run: 'replay' } };
  }
  return { code: 'unknown', title: 'Sealing failed', detail: `Sealing failed: ${shortReason(e)}. Press Retry, or Shift+R for the recorded run.`, action: { label: 'Retry', run: 'retry' } };
}

/** True for failures the SealQueue should retry on its own (timeout, RPCs down). */
export function classify(e: unknown): 'timeout' | 'offline' | 'mismatch' | 'revert' | 'other' {
  const rv = extractRevert(e);
  if (rv) return rv.name === 'TickMismatch' || rv.name === 'WrongStatus' ? 'mismatch' : 'revert';
  if (e instanceof LowBalanceError || isInsufficientFunds(e) || isReserveBalance(e)) return 'other';
  if (e instanceof ChainTimeoutError || isTimeout(e)) return 'timeout';
  if (isNetworkDown(e)) return 'offline';
  return 'other';
}
