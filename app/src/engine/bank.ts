// Bank-maths mirror of the RunBank contract (PRD §9.4). Integer (bigint) maths only; §9 decides who is wrong.
import { encodeAbiParameters, keccak256 } from 'viem';
import type { Hex } from 'viem';
import type { BankConfig, BankLevel, BankState, BankStatus, Ledger, Model, TickResult } from '@/types';

const BPS = 10_000n;

/** Mirrors the contract's custom errors (WrongStatus, NotAscending, BadDepositor). */
export class BankError extends Error {
  code: 'WrongStatus' | 'NotAscending' | 'BadDepositor';
  constructor(code: 'WrongStatus' | 'NotAscending' | 'BadDepositor', detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'BankError';
    this.code = code;
  }
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
const minBig = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** PRD §9.4 reset / initial state for a level: status `ready`, ticks 0, nothing withdrawn. */
export function initialBankFor(cfg: BankConfig, ledger: Ledger): BankState {
  const n = ledger.balances.length;
  let insuredOwed = 0n;
  for (const b of ledger.balances) insuredOwed += minBig(b, cfg.insuredCap);
  return {
    status: 'ready',
    tick: 0,
    cash: cfg.cash0,
    bonds: cfg.bonds0,
    depositsOwed: ledger.deposits0,
    insuredOwed,
    deposits0: ledger.deposits0,
    cumulativeLoss: 0n,
    lastHaircutBps: 0,
    quietCount: 0,
    withdrawnCount: 0,
    queue: [],
    withdrawn: new Uint8Array(n),
    queued: new Uint8Array(n),
  };
}

export function initialBank(model: Model, level: BankLevel): BankState {
  return initialBankFor(model.configs[level], model.ledger);
}

/**
 * One tick, PRD §9.4. `requested` must be strictly ascending ids < N. Returns a new BankState (the input is not
 * mutated) and a TickResult. `result.served` is the whole `serve` list in order, including ids trapped by a
 * failure in this tick (this is what the contract's `TickSummary.served` counts); `bank.withdrawn` says who was paid.
 */
export function applyTick(
  bank: BankState,
  cfg: BankConfig,
  ledger: Ledger,
  requested: number[],
): { bank: BankState; result: TickResult } {
  if (bank.status !== 'running') throw new BankError('WrongStatus', `expected running, got ${bank.status}`);
  const n = ledger.balances.length;
  let prev = -1;
  for (const id of requested) {
    if (!Number.isInteger(id) || id < 0 || id >= n) throw new BankError('BadDepositor', String(id));
    if (id <= prev) throw new BankError('NotAscending', String(id));
    prev = id;
  }

  const bal = ledger.balances;
  const withdrawn = bank.withdrawn.slice();
  const queued = bank.queued.slice();
  const queue = bank.queue.slice();
  let { cash, bonds, depositsOwed, insuredOwed, cumulativeLoss, quietCount, withdrawnCount } = bank;
  let status: BankStatus = bank.status;
  const tick = bank.tick + 1;

  // 1. who gets served this tick
  const serve: number[] = [];
  let newCount = 0;
  let skipped = 0;
  for (const id of requested) {
    if (withdrawn[id] || queued[id]) {
      skipped += 1;
      continue;
    }
    newCount += 1;
    if (cfg.speedBumpBps === 0) serve.push(id);
    else {
      queue.push(id);
      queued[id] = 1;
    }
  }
  let head = 0;
  if (cfg.speedBumpBps > 0) {
    const cap = (bank.deposits0 * BigInt(cfg.speedBumpBps)) / BPS;
    let used = 0n;
    while (head < queue.length && used < cap) {
      const id = queue[head++];
      queued[id] = 0;
      serve.push(id);
      used += bal[id];
    }
  }
  const queueAfter = head === 0 ? queue : queue.slice(head);

  // 2. haircut from this tick's total shortfall
  let demand = 0n;
  for (const id of serve) demand += bal[id];
  const shortfall = demand > cash ? demand - cash : 0n;
  let haircutBps = 0;
  if (shortfall !== 0n) {
    const h = BigInt(cfg.haircutBaseBps) + (BigInt(cfg.haircutSlopeBps) * shortfall) / cfg.bonds0;
    haircutBps = Number(minBig(BigInt(cfg.haircutMaxBps), h));
  }

  // 3. pay in order; sell bonds at the haircut when cash runs out
  let paid = 0n;
  let bondsSold = 0n;
  let loss = 0n;
  let failedNow = false;
  const hb = BigInt(haircutBps);
  for (const id of serve) {
    const b = bal[id];
    if (cash >= b) {
      cash -= b;
    } else {
      const need = b - cash;
      const sell = ceilDiv(need * BPS, BPS - hb);
      if (sell > bonds) {
        failedNow = true; // this id and the rest of serve are trapped
        break;
      }
      bonds -= sell;
      bondsSold += sell;
      loss += sell - need;
      cash = 0n;
    }
    withdrawn[id] = 1;
    withdrawnCount += 1;
    paid += b;
    depositsOwed -= b;
    insuredOwed -= minBig(b, cfg.insuredCap);
  }
  cumulativeLoss += loss;

  // 4. verdict
  if (failedNow || cash + bonds < depositsOwed) {
    status = 'failed';
  } else if (newCount === 0 && queueAfter.length === 0) {
    quietCount += 1;
    if (quietCount >= cfg.quietTicks) status = 'survived';
  } else {
    quietCount = 0;
  }

  const next: BankState = {
    status,
    tick,
    cash,
    bonds,
    depositsOwed,
    insuredOwed,
    deposits0: bank.deposits0,
    cumulativeLoss,
    lastHaircutBps: haircutBps,
    quietCount,
    withdrawnCount,
    queue: queueAfter,
    withdrawn,
    queued,
  };
  const result: TickResult = {
    tick,
    requested: requested.slice(),
    served: serve,
    skipped,
    paid,
    bondsSold,
    fireSaleLoss: loss,
    haircutBps,
    cashAfter: cash,
    bondsAfter: bonds,
    depositsOwedAfter: depositsOwed,
    queueLengthAfter: queueAfter.length,
    statusAfter: status,
    trapped:
      status === 'failed'
        ? { count: n - withdrawnCount, amount: depositsOwed, uninsured: depositsOwed - insuredOwed }
        : null,
  };
  return { bank: next, result };
}

/** keccak256(abi.encode(Config)), field order exactly as PRD §9.2 (a static struct = eight 32-byte words). */
export function hashConfig(cfg: BankConfig): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint64' }, { type: 'uint64' }, { type: 'uint16' }, { type: 'uint64' },
        { type: 'uint16' }, { type: 'uint16' }, { type: 'uint16' }, { type: 'uint16' },
      ],
      [
        cfg.cash0, cfg.bonds0, cfg.speedBumpBps, cfg.insuredCap,
        cfg.haircutBaseBps, cfg.haircutSlopeBps, cfg.haircutMaxBps, cfg.quietTicks,
      ],
    ),
  );
}
