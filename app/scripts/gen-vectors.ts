// B-05: golden vectors for the Solidity contract (PRD §11.7). `pnpm gen:vectors`
// Scenarios replay request sequences through the TypeScript mirror (src/engine/bank.ts) and record every post-tick value.
// A's BankVectors.t.sol replays the same requests against RunBank and asserts equality. §9 decides who is wrong.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BankConfig, BankState, Ledger } from '../src/types';
import { applyTick, initialBankFor } from '../src/engine/bank';
import { hashLedgerWords } from '../src/engine/ledger';
import { defaultParams, loadModel } from '../src/engine/model';
import { createRun, stepRun } from '../src/engine/run';

const dir = fileURLToPath(new URL('../src/engine/data/', import.meta.url));
const readJson = (f: string) => JSON.parse(readFileSync(dir + f, 'utf8'));

const rawLedger = readJson('ledger.json');
const ledger: Ledger = {
  balances: rawLedger.balances.map((b: string) => BigInt(b)),
  deposits0: BigInt(rawLedger.deposits0),
  packed: rawLedger.packed.map((w: string) => BigInt(w)),
  ledgerHash: hashLedgerWords(rawLedger.packed.map((w: string) => BigInt(w))),
};
const rawCfg = readJson('configs.json') as Record<'0' | '1', Record<string, string | number>>;
const toCfg = (c: Record<string, string | number>): BankConfig => ({
  cash0: BigInt(c.cash0), bonds0: BigInt(c.bonds0), speedBumpBps: Number(c.speedBumpBps), insuredCap: BigInt(c.insuredCap),
  haircutBaseBps: Number(c.haircutBaseBps), haircutSlopeBps: Number(c.haircutSlopeBps), haircutMaxBps: Number(c.haircutMaxBps),
  quietTicks: Number(c.quietTicks),
});
const graph = readJson('graph.json') as { nodes: { id: number; degree: number; whale: boolean }[] };

const STATUS = { ready: 0, running: 1, failed: 2, survived: 3 } as const;
const asc = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);
const whalesBySize = graph.nodes.filter((n) => n.whale).map((n) => n.id).sort((a, b) => Number(ledger.balances[b] - ledger.balances[a]) || a - b);
const smalls = graph.nodes.filter((n) => !n.whale).map((n) => n.id);
const everyone = Array.from({ length: 500 }, (_, i) => i);

interface TickVec { requested: number[]; expect: Record<string, string | number> }

/** Run a request sequence through the mirror and record the expectations. Stops after the status leaves `running`. */
function scenario(name: string, level: 0 | 1, cfgRaw: Record<string, string | number>, requests: number[][]) {
  const cfg = toCfg(cfgRaw);
  let bank: BankState = { ...initialBankFor(cfg, ledger), status: 'running' };
  const ticks: TickVec[] = [];
  for (const requested of requests) {
    const r = applyTick(bank, cfg, ledger, requested);
    bank = r.bank;
    ticks.push({
      requested,
      expect: {
        cash: String(bank.cash), bonds: String(bank.bonds), depositsOwed: String(bank.depositsOwed),
        insuredOwed: String(bank.insuredOwed), cumulativeLoss: String(bank.cumulativeLoss),
        served: r.result.served.length, skipped: r.result.skipped, haircutBps: r.result.haircutBps,
        queueLength: bank.queue.length, status: STATUS[bank.status],
        // extras beyond PRD §11.7 (additive; ignore if you don't need them)
        withdrawnCount: bank.withdrawnCount, paid: String(r.result.paid), bondsSold: String(r.result.bondsSold),
        fireSaleLoss: String(r.result.fireSaleLoss),
      },
    });
    if (bank.status !== 'running') break;
  }
  return { name, level, config: cfgRaw, ledger: 'ledger.json', ticks };
}

const quiet = (n: number) => Array.from({ length: n }, () => [] as number[]);
const bhau = rawCfg['0'];
const mutual = rawCfg['1'];
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** The request lists the real panic model produces for a level × card (B-06), to be replayed against the contract. */
function realRun(level: 0 | 1, card: 0 | 1 | 2 | 3): number[][] {
  const model = loadModel();
  let run = createRun(model, defaultParams(model, level, card));
  const out: number[][] = [];
  while (run.frame.bank.status === 'running' && run.frame.tick < 80) {
    const s = stepRun(model, run);
    run = s.run;
    out.push(s.payload.requested);
  }
  return out;
}

const scenarios = [
  // 1. whales go first, in waves, until the bank fails
  scenario('bhau-whale-waves-failure', 0, bhau, [...chunk(whalesBySize, 5).map(asc), asc(smalls.slice(0, 250))]),
  // 2. cash-only tick (no haircut), a quiet tick, a resend with skips, then a big wave that fails
  scenario('bhau-skips-and-quiet', 0, bhau, [
    asc(smalls.slice(0, 20)), [], asc(smalls.slice(0, 30)), asc(smalls.slice(10, 40)), asc([...smalls.slice(0, 40), ...whalesBySize.slice(0, 4)]),
    ...chunk(whalesBySize.slice(4), 6).map(asc), asc(everyone),
  ]),
  // 3. everyone at once: serves in id order until bonds run out, the rest are trapped (failure mid-serve)
  scenario('bhau-everyone-at-once-mid-serve-failure', 0, bhau, [asc(everyone)]),
  // 4. a custom config whose haircut hits haircutMaxBps
  scenario('bhau-haircut-capped', 0, { ...bhau, haircutMaxBps: 1200, haircutSlopeBps: 9000 }, [...chunk(whalesBySize, 9).map(asc), asc(everyone)]),
  // 5. Monad Mutual: whales + smalls all queue; the cap overshoots; the queue drains with empty ticks; resent ids are skips
  scenario('mutual-queue-overshoot-and-drain', 1, mutual, [
    asc([...whalesBySize.slice(0, 6), ...smalls.slice(0, 30)]),
    [], asc(smalls.slice(0, 10)), asc(smalls.slice(40, 50)), ...quiet(12),
  ]),
  // 6. Monad Mutual survives: a little panic, then quiet
  scenario('mutual-survival-after-quiet-ticks', 1, mutual, [asc(smalls.slice(0, 15)), asc(smalls.slice(15, 25)), ...quiet(14)]),
  // 7. Monad Mutual: a quiet streak is reset by a new request, then survival
  scenario('mutual-quiet-streak-resets', 1, mutual, [asc(smalls.slice(0, 5)), ...quiet(6), asc(smalls.slice(5, 9)), ...quiet(12)]),
  // 8. Monad Mutual: everybody requests at once; the speed bump spreads it over many ticks
  scenario('mutual-everyone-at-once', 1, mutual, [asc(everyone), ...quiet(60)]),
  // 9–10. what the real model actually does on stage (Bhau's × W fails; Monad Mutual × R survives), from stepRun
  scenario('real-model-bhau-W', 0, bhau, realRun(0, 1)),
  scenario('real-model-mutual-R', 1, mutual, realRun(1, 3)),
];

mkdirSync(dir + 'vectors', { recursive: true });
const out = {
  format: {
    description: 'Golden vectors for the RunBank contract (PRD §11.7). Replay each scenario against the contract and assert every field after every tick.',
    scenarios: 'name; level 0|1; config (BankConfig, decimal strings for amounts, numbers for bps and ticks); ledger "ledger.json" in this folder; ticks[]',
    setup: 'loadLedger(ledger.json), setLevel(level, config), fund cash0+bonds0, startRumor, then sealTicks one tick at a time (or batched) with ticks[i].requested',
    expect: {
      cash: 'snapshot.cash after the tick (decimal string, base units)',
      bonds: 'snapshot.bonds', depositsOwed: 'snapshot.depositsOwed', insuredOwed: 'snapshot.insuredOwed', cumulativeLoss: 'snapshot.cumulativeLoss',
      served: 'TickSummary.served = length of the PRD §9.4 `serve` list (includes ids trapped by a failure in this tick)',
      skipped: 'TickSummary.skipped', haircutBps: 'TickSummary.haircutBps', queueLength: 'snapshot.queueLength / TickSummary.queueLengthAfter',
      status: 'snapshot.status after the tick: 0 Ready, 1 Running, 2 Failed, 3 Survived',
      withdrawnCount: 'snapshot.withdrawnCount (who was actually paid; differs from the running sum of `served` after a mid-serve failure)',
      paid: 'TickSummary.paid', bondsSold: 'TickSummary.bondsSold', fireSaleLoss: 'TickSummary.fireSaleLoss',
    },
    notes: 'A scenario ends at the first tick after which status != Running. `requested` is strictly ascending; [] is a quiet tick.',
  },
  ledgerHash: rawLedger.ledgerHash,
  scenarios,
};
writeFileSync(dir + 'vectors/bank-vectors.json', JSON.stringify(out, null, 1) + '\n');
for (const s of scenarios) {
  const last = s.ticks[s.ticks.length - 1].expect;
  console.log(`${s.name.padEnd(44)} L${s.level} ticks ${String(s.ticks.length).padStart(2)} end status ${last.status} withdrawn ${last.withdrawnCount} loss ${Number(BigInt(last.cumulativeLoss as string)) / 1e6}`);
}
