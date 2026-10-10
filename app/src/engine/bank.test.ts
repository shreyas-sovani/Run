import { concat, keccak256, toHex } from 'viem';
import { describe, expect, it } from 'vitest';
import type { BankConfig, BankState, Ledger } from '@/types';
import { applyTick, hashConfig, initialBankFor } from './bank';
import { hashLedgerWords, packBalances } from './ledger';

const A = 1_000_000n; // 1 AUSD

/** A 500-depositor ledger totalling exactly 9,500 AUSD; `overrides` set specific ids, the rest share the remainder. */
function makeLedger(overrides: Record<number, bigint> = {}, filler?: bigint): Ledger {
  const total = 9_500n * A;
  const fixedIds = Object.keys(overrides).map(Number);
  const fixedSum = fixedIds.reduce((s, i) => s + overrides[i], 0n);
  const rest = 500 - fixedIds.length;
  const each = filler ?? (total - fixedSum) / BigInt(rest);
  const balances = Array.from({ length: 500 }, (_, i) => overrides[i] ?? each);
  // the last free id absorbs the remainder so deposits0 is always exactly 9,500 AUSD (the speed-bump cap depends on it)
  const last = [...balances.keys()].reverse().find((i) => !(i in overrides))!;
  balances[last] += total - balances.reduce((s, b) => s + b, 0n);
  if (balances[last] < 0n || balances[last] > 0xffffffffn) throw new Error('test ledger does not fit');
  const packed = packBalances(balances);
  return {
    balances,
    deposits0: balances.reduce((s, b) => s + b, 0n),
    packed,
    ledgerHash: hashLedgerWords(packed),
  };
}

const BHAU: BankConfig = {
  cash0: 1500n * A, bonds0: 8500n * A, speedBumpBps: 0, insuredCap: 0n,
  haircutBaseBps: 200, haircutSlopeBps: 6000, haircutMaxBps: 9000, quietTicks: 8,
};
const MUTUAL: BankConfig = { ...BHAU, speedBumpBps: 300, insuredCap: 50n * A };

const running = (cfg: BankConfig, ledger: Ledger): BankState => ({ ...initialBankFor(cfg, ledger), status: 'running' });

describe('initialBankFor (PRD §9.4 reset)', () => {
  it('starts Ready with the balance sheet from the config', () => {
    const ledger = makeLedger();
    const b = initialBankFor(MUTUAL, ledger);
    expect(b.status).toBe('ready');
    expect(b.tick).toBe(0);
    expect(b.cash).toBe(1500n * A);
    expect(b.bonds).toBe(8500n * A);
    expect(b.depositsOwed).toBe(9500n * A);
    expect(b.deposits0).toBe(9500n * A);
    expect(b.queue).toEqual([]);
    expect(b.withdrawn).toHaveLength(500);
    expect(b.withdrawn.every((x) => x === 0)).toBe(true);
  });

  it('insuredOwed = Σ min(balance, insuredCap)', () => {
    const ledger = makeLedger({ 0: 600n * A, 1: 10n * A }, 15n * A);
    expect(initialBankFor(BHAU, ledger).insuredOwed).toBe(0n);
    const cap = 50n * A;
    const expected = ledger.balances.reduce((s, b) => s + (b < cap ? b : cap), 0n);
    expect(initialBankFor(MUTUAL, ledger).insuredOwed).toBe(expected);
    expect(expected).toBeGreaterThan(50n * A + 10n * A); // sanity: whale capped at 50, small ones fully insured
  });
});

describe('applyTick: PRD §9.5 worked example (Bhau\'s Bank), exact base units', () => {
  const ledger = makeLedger({ 0: 2000n * A, 1: 3000n * A });

  it('tick 1: demand 2,000 → shortfall 500, haircut 552 bps, bonds sold 529.212532, loss 29.212532', () => {
    const { bank, result } = applyTick(running(BHAU, ledger), BHAU, ledger, [0]);
    expect(result.haircutBps).toBe(552);
    expect(result.paid).toBe(2000n * A);
    expect(result.bondsSold).toBe(529_212_532n);
    expect(result.fireSaleLoss).toBe(29_212_532n);
    expect(result.cashAfter).toBe(0n);
    expect(result.bondsAfter).toBe(8500n * A - 529_212_532n);
    expect(result.depositsOwedAfter).toBe(7500n * A);
    expect(result.statusAfter).toBe('running');
    expect(result.trapped).toBeNull();
    expect(bank.cumulativeLoss).toBe(29_212_532n);
    expect(bank.lastHaircutBps).toBe(552);
  });

  it('tick 2: demand 3,000 all from bonds, haircut 2317 bps, cumulative loss 933.937249 > equity → Failed', () => {
    const t1 = applyTick(running(BHAU, ledger), BHAU, ledger, [0]);
    const { bank, result } = applyTick(t1.bank, BHAU, ledger, [1]);
    expect(result.haircutBps).toBe(2317);
    expect(result.bondsSold).toBe(3_904_724_717n);
    expect(result.fireSaleLoss).toBe(904_724_717n);
    expect(bank.cumulativeLoss).toBe(933_937_249n);
    expect(bank.bonds).toBe(4_066_062_751n);
    expect(bank.cash).toBe(0n);
    expect(bank.depositsOwed).toBe(4500n * A);
    expect(bank.status).toBe('failed');
    expect(result.statusAfter).toBe('failed');
    // everyone requested was served; the other 498 are trapped
    expect(result.trapped).toEqual({ count: 498, amount: 4500n * A, uninsured: 4500n * A });
    expect(result.tick).toBe(2);
  });
});

describe('applyTick: payouts', () => {
  it('pays from cash first with no haircut and no bond sales', () => {
    const ledger = makeLedger({}, 19n * A);
    const { bank, result } = applyTick(running(BHAU, ledger), BHAU, ledger, [3, 4, 5]);
    expect(result.haircutBps).toBe(0);
    expect(result.bondsSold).toBe(0n);
    expect(result.fireSaleLoss).toBe(0n);
    expect(result.paid).toBe(57n * A);
    expect(bank.cash).toBe(1500n * A - 57n * A);
    expect(bank.bonds).toBe(8500n * A);
    expect(bank.withdrawnCount).toBe(3);
    expect(bank.withdrawn[3]).toBe(1);
    expect(bank.withdrawn[6]).toBe(0);
    expect(result.served).toEqual([3, 4, 5]);
  });

  it('a depositor that straddles the cash boundary is paid partly from cash, partly from bonds', () => {
    const ledger = makeLedger({ 0: 1000n * A, 1: 1000n * A });
    const { bank, result } = applyTick(running(BHAU, ledger), BHAU, ledger, [0, 1]);
    // demand 2000, shortfall 500 → haircut 552; id0 from cash (cash 500 left), id1 needs 500 from bonds
    expect(result.haircutBps).toBe(552);
    expect(result.bondsSold).toBe(529_212_532n);
    expect(bank.cash).toBe(0n);
  });
});

describe('applyTick: input validation (contract reverts)', () => {
  const ledger = makeLedger({}, 19n * A);
  const fresh = () => running(BHAU, ledger);
  it('rejects non-ascending and duplicate ids', () => {
    expect(() => applyTick(fresh(), BHAU, ledger, [5, 3])).toThrow(/NotAscending/);
    expect(() => applyTick(fresh(), BHAU, ledger, [5, 5])).toThrow(/NotAscending/);
  });
  it('rejects ids outside the ledger', () => {
    expect(() => applyTick(fresh(), BHAU, ledger, [500])).toThrow(/BadDepositor/);
    expect(() => applyTick(fresh(), BHAU, ledger, [-1])).toThrow();
  });
  it('rejects ticks unless the bank is running', () => {
    expect(() => applyTick(initialBankFor(BHAU, ledger), BHAU, ledger, [1])).toThrow(/WrongStatus/);
  });
  it('does not mutate the input bank', () => {
    const b = fresh();
    const snapshot = JSON.stringify({ ...b, withdrawn: [...b.withdrawn], queued: [...b.queued] }, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
    applyTick(b, BHAU, ledger, [1, 2, 3]);
    expect(JSON.stringify({ ...b, withdrawn: [...b.withdrawn], queued: [...b.queued] }, (_, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(snapshot);
  });
});

describe('applyTick: skips', () => {
  it('already-withdrawn ids are skipped, not paid twice', () => {
    const ledger = makeLedger({}, 19n * A);
    const t1 = applyTick(running(BHAU, ledger), BHAU, ledger, [1, 2]);
    const t2 = applyTick(t1.bank, BHAU, ledger, [1, 2, 3]);
    expect(t2.result.skipped).toBe(2);
    expect(t2.result.served).toEqual([3]);
    expect(t2.result.paid).toBe(19n * A);
    expect(t2.bank.withdrawnCount).toBe(3);
  });
  it('a tick of only skips counts as quiet', () => {
    const ledger = makeLedger({}, 19n * A);
    const t1 = applyTick(running(BHAU, ledger), BHAU, ledger, [1]);
    const t2 = applyTick(t1.bank, BHAU, ledger, [1]);
    expect(t2.bank.quietCount).toBe(1);
  });
});

describe('applyTick: speed bump queue (Monad Mutual)', () => {
  // cap = 9500 × 300 / 10000 = 285 AUSD per tick
  const ledger = makeLedger({ 0: 100n * A, 1: 100n * A, 2: 100n * A, 3: 100n * A, 4: 100n * A }, 10n * A);

  it('serves FIFO until used ≥ cap; the last one may overshoot', () => {
    const { bank, result } = applyTick(running(MUTUAL, ledger), MUTUAL, ledger, [0, 1, 2, 3, 4]);
    // 100, 200 (<285) → third served → 300 ≥ 285, stop. Overshoot by 15.
    expect(result.served).toEqual([0, 1, 2]);
    expect(result.paid).toBe(300n * A);
    expect(result.queueLengthAfter).toBe(2);
    expect(bank.queue).toEqual([3, 4]);
    expect(bank.queued[3]).toBe(1);
    expect(bank.queued[0]).toBe(0);
  });

  it('the queue persists and drains in order on later ticks, even with no new requests', () => {
    const t1 = applyTick(running(MUTUAL, ledger), MUTUAL, ledger, [0, 1, 2, 3, 4]);
    const t2 = applyTick(t1.bank, MUTUAL, ledger, []);
    expect(t2.result.served).toEqual([3, 4]);
    expect(t2.bank.queue).toEqual([]);
    // PRD §9.4 checks "queue is empty" after serving, so draining the queue empty with no new requests is a quiet tick
    expect(t2.bank.quietCount).toBe(1);
  });

  it('a tick that leaves the queue non-empty is not quiet', () => {
    const t1 = applyTick(running(MUTUAL, ledger), MUTUAL, ledger, [0, 1, 2, 3, 4]);
    expect(t1.bank.quietCount).toBe(0);
    const big = makeLedger({ 0: 100n * A, 1: 100n * A, 2: 100n * A, 3: 100n * A, 4: 100n * A, 5: 100n * A, 6: 100n * A }, 10n * A);
    const s = applyTick(running(MUTUAL, big), MUTUAL, big, [0, 1, 2, 3, 4, 5, 6]);
    const s2 = applyTick(s.bank, MUTUAL, big, []); // serves 3,4,5 (300 ≥ 285), leaves 6
    expect(s2.bank.queue).toEqual([6]);
    expect(s2.bank.quietCount).toBe(0);
  });

  it('re-requesting a queued id is a skip', () => {
    const t1 = applyTick(running(MUTUAL, ledger), MUTUAL, ledger, [0, 1, 2, 3, 4]);
    const t2 = applyTick(t1.bank, MUTUAL, ledger, [3, 9]);
    expect(t2.result.skipped).toBe(1);
    expect(t2.result.served).toEqual([3, 4, 9]);
  });

  it('new requests queue behind older ones', () => {
    const t1 = applyTick(running(MUTUAL, ledger), MUTUAL, ledger, [0, 1, 2, 3, 4]);
    // t2: queue [3,4] + new [10..] ; cap 285 ; 3→100, 4→200, 10→210, 11→220 ... filler 10 each
    const t2 = applyTick(t1.bank, MUTUAL, ledger, [10, 11]);
    expect(t2.result.served).toEqual([3, 4, 10, 11]);
  });

  it('insurance: insuredOwed falls by min(balance, cap) per payout', () => {
    const l = makeLedger({ 0: 200n * A, 1: 20n * A }, 15n * A);
    const start = running(MUTUAL, l);
    const { bank } = applyTick(start, MUTUAL, l, [0, 1]);
    expect(start.insuredOwed - bank.insuredOwed).toBe(50n * A + 20n * A);
  });
});

describe('applyTick: failure mid-serve', () => {
  it('serves in order until a depositor cannot be covered; the rest are trapped and unpaid', () => {
    // cash 100, bonds 700. demand 630 → shortfall 530 → haircut 200 + 6000·530/700 = 4742 bps.
    // id0 (90) from cash; id1 (20) sells ≈19 of bonds; id2 (500) would need ≈951 > ≈681 left → failedNow; id3 untouched.
    const cfg: BankConfig = { ...BHAU, cash0: 100n * A, bonds0: 700n * A };
    const l = makeLedger({ 0: 90n * A, 1: 20n * A, 2: 500n * A, 3: 20n * A }, 15n * A);
    const { bank, result } = applyTick(running(cfg, l), cfg, l, [0, 1, 2, 3]);
    expect(result.haircutBps).toBe(4742);
    expect(bank.status).toBe('failed');
    expect(result.served).toEqual([0, 1, 2, 3]); // contract counts the whole serve list
    expect(bank.withdrawn[0]).toBe(1);
    expect(bank.withdrawn[1]).toBe(1);
    expect(bank.withdrawn[2]).toBe(0); // could not be covered
    expect(bank.withdrawn[3]).toBe(0); // after the break: not paid
    expect(bank.withdrawnCount).toBe(2);
    expect(result.paid).toBe(110n * A);
    expect(result.trapped!.count).toBe(498);
    expect(result.trapped!.amount).toBe(bank.depositsOwed);
  });

  it('rejects further ticks after Failed', () => {
    const ledger = makeLedger({ 0: 2000n * A, 1: 3000n * A });
    const t1 = applyTick(running(BHAU, ledger), BHAU, ledger, [0]);
    const t2 = applyTick(t1.bank, BHAU, ledger, [1]);
    expect(() => applyTick(t2.bank, BHAU, ledger, [2])).toThrow(/WrongStatus/);
  });
});

describe('applyTick: survival', () => {
  const ledger = makeLedger({}, 19n * A);

  it('survives after quietTicks consecutive quiet ticks', () => {
    let b = applyTick(running(MUTUAL, ledger), MUTUAL, ledger, [1]).bank; // queue the one; it is served same tick
    for (let i = 0; i < 7; i++) {
      const r = applyTick(b, MUTUAL, ledger, []);
      b = r.bank;
      expect(b.status).toBe('running');
    }
    const last = applyTick(b, MUTUAL, ledger, []);
    expect(last.bank.status).toBe('survived');
    expect(last.result.statusAfter).toBe('survived');
    expect(last.bank.tick).toBe(9);
  });

  it('a new request resets the quiet counter', () => {
    let b = running(MUTUAL, ledger);
    for (let i = 0; i < 5; i++) b = applyTick(b, MUTUAL, ledger, []).bank;
    expect(b.quietCount).toBe(5);
    b = applyTick(b, MUTUAL, ledger, [7]).bank;
    expect(b.quietCount).toBe(0);
    expect(b.status).toBe('running');
  });
});

describe('hashConfig (PRD §9.2)', () => {
  it('= keccak256(abi.encode(Config)) with fields in PRD order, each a 32-byte word', () => {
    const cfg = MUTUAL;
    const words = [
      cfg.cash0, cfg.bonds0, BigInt(cfg.speedBumpBps), cfg.insuredCap,
      BigInt(cfg.haircutBaseBps), BigInt(cfg.haircutSlopeBps), BigInt(cfg.haircutMaxBps), BigInt(cfg.quietTicks),
    ];
    expect(hashConfig(cfg)).toBe(keccak256(concat(words.map((w) => toHex(w, { size: 32 })))));
  });
  it('differs between levels', () => {
    expect(hashConfig(BHAU)).not.toBe(hashConfig(MUTUAL));
  });
});
