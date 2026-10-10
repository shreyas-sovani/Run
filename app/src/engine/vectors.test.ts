import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BankConfig, Ledger } from '@/types';
import { applyTick, initialBankFor } from './bank';
import { hashLedgerWords } from './ledger';

const read = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`./data/${f}`, import.meta.url)), 'utf8'));

interface Expect {
  cash: string; bonds: string; depositsOwed: string; insuredOwed: string; cumulativeLoss: string;
  served: number; skipped: number; haircutBps: number; queueLength: number; status: number;
  withdrawnCount: number; paid: string; bondsSold: string; fireSaleLoss: string;
}
interface Scenario { name: string; level: 0 | 1; config: Record<string, string | number>; ledger: string; ticks: { requested: number[]; expect: Expect }[] }
const file = read('vectors/bank-vectors.json') as { format: unknown; scenarios: Scenario[] };

const rawLedger = read('ledger.json');
const ledger: Ledger = {
  balances: rawLedger.balances.map((b: string) => BigInt(b)),
  deposits0: BigInt(rawLedger.deposits0),
  packed: rawLedger.packed.map((w: string) => BigInt(w)),
  ledgerHash: hashLedgerWords(rawLedger.packed.map((w: string) => BigInt(w))),
};
const toCfg = (c: Scenario['config']): BankConfig => ({
  cash0: BigInt(c.cash0), bonds0: BigInt(c.bonds0), speedBumpBps: Number(c.speedBumpBps), insuredCap: BigInt(c.insuredCap),
  haircutBaseBps: Number(c.haircutBaseBps), haircutSlopeBps: Number(c.haircutSlopeBps), haircutMaxBps: Number(c.haircutMaxBps),
  quietTicks: Number(c.quietTicks),
});
const STATUS = { ready: 0, running: 1, failed: 2, survived: 3 } as const;

describe('bank-vectors.json (PRD §11.7)', () => {
  it('documents its format and references the current ledger', () => {
    expect(file.format).toBeTruthy();
    expect(file.scenarios.length).toBeGreaterThanOrEqual(6);
    for (const s of file.scenarios) expect(s.ledger).toBe('ledger.json');
  });

  it('the mirror reproduces every expected value, tick by tick (self-consistency)', () => {
    for (const s of file.scenarios) {
      const cfg = toCfg(s.config);
      let bank = { ...initialBankFor(cfg, ledger), status: 'running' as const };
      for (const [i, t] of s.ticks.entries()) {
        const r = applyTick(bank, cfg, ledger, t.requested);
        bank = r.bank as typeof bank;
        const e = t.expect;
        const where = `${s.name} tick ${i + 1}`;
        expect({ where, cash: String(bank.cash), bonds: String(bank.bonds), depositsOwed: String(bank.depositsOwed), insuredOwed: String(bank.insuredOwed), cumulativeLoss: String(bank.cumulativeLoss) })
          .toEqual({ where, cash: e.cash, bonds: e.bonds, depositsOwed: e.depositsOwed, insuredOwed: e.insuredOwed, cumulativeLoss: e.cumulativeLoss });
        expect({ where, served: r.result.served.length, skipped: r.result.skipped, haircutBps: r.result.haircutBps, queueLength: bank.queue.length, status: STATUS[bank.status], withdrawnCount: bank.withdrawnCount, paid: String(r.result.paid), bondsSold: String(r.result.bondsSold), fireSaleLoss: String(r.result.fireSaleLoss) })
          .toEqual({ where, served: e.served, skipped: e.skipped, haircutBps: e.haircutBps, queueLength: e.queueLength, status: e.status, withdrawnCount: e.withdrawnCount, paid: e.paid, bondsSold: e.bondsSold, fireSaleLoss: e.fireSaleLoss });
      }
    }
  });

  it('covers the hard cases the contract must get right', () => {
    const all = file.scenarios.flatMap((s) => s.ticks.map((t, i) => ({ s, t, prev: i > 0 ? s.ticks[i - 1] : null })));
    const cap = (9_500n * 1_000_000n * 300n) / 10_000n;
    // both outcomes
    expect(file.scenarios.some((s) => s.ticks.at(-1)!.expect.status === 2)).toBe(true);
    expect(file.scenarios.some((s) => s.ticks.at(-1)!.expect.status === 3)).toBe(true);
    // both levels
    expect(new Set(file.scenarios.map((s) => s.level))).toEqual(new Set([0, 1]));
    // failure mid-serve: some paid this tick but not everyone in `serve`
    expect(all.some(({ s, t, prev }) => {
      const delta = t.expect.withdrawnCount - (prev?.expect.withdrawnCount ?? 0);
      return t.expect.status === 2 && delta > 0 && delta < t.expect.served && s.level === 0;
    })).toBe(true);
    // skips (already withdrawn / queued ids resent)
    expect(all.some(({ t }) => t.expect.skipped > 0)).toBe(true);
    // queue overshoot: paid more than the per-tick cap
    expect(all.some(({ s, t }) => s.level === 1 && BigInt(t.expect.paid) > cap)).toBe(true);
    // queue persists across ticks and drains with no new requests
    expect(all.some(({ s, t, prev }) => s.level === 1 && t.requested.length === 0 && (prev?.expect.queueLength ?? 0) > 0 && t.expect.served > 0)).toBe(true);
    // a haircut that hits haircutMaxBps (needs a custom config: the defaults top out near 6,900 bps), and a cash-only tick
    expect(all.some(({ s, t }) => t.expect.haircutBps > 0 && t.expect.haircutBps === Number(s.config.haircutMaxBps))).toBe(true);
    expect(all.some(({ t }) => t.expect.haircutBps === 0 && t.expect.served > 0)).toBe(true);
    // quiet ticks
    expect(all.some(({ t }) => t.requested.length === 0)).toBe(true);
  });
});
