// C-08: chain smoke test. Uses the same adapter and SealQueue code as the app.
//
//   pnpm chain:smoke                 RPC latencies, operator balances, bank snapshot
//   pnpm chain:smoke --ping          + one ping() transaction
//   pnpm chain:smoke --mini          + setLevel(0) → startRumor → sealTicks (3 real ticks) → reset      (CP1 for C)
//   pnpm chain:smoke --run           + a full real run through the SealQueue at 400 ms cadence, then reset
//   pnpm chain:smoke --soak 20       + 20 ticks through the SealQueue at 400 ms cadence with a trickle of small withdrawals
//                                      (the bank never fails), proving 15+ ticks seal without a gap, then reset
//   options: --no-sync (force sendRawTransaction + receipt polling), --stress (--mini with 60 synthetic ids, for gas calibration), --level 0|1, --card 0..3, --rpc <url>
//
// Testnet only (chain 10143). Keys come from VITE_OPERATOR_PK / VITE_BACKUP_PK (app/.env.local, via --env-file),
// falling back to the repo's gitignored .env files. Only addresses are ever printed.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Hex } from 'viem';
import { formatEther, formatUnits } from 'viem';
import { createLiveAdapter, createSealQueue, deployment, explorerTx, loadOperatorKeys, translateError, NETWORK } from '@/chain';
import type { LiveAdapter } from '@/chain';
import { addressOfKey, normalizePk } from '@/chain/keys';
import { endpointsFor } from '@/chain/clients';
import { createRun, defaultParams, loadModel, stepRun } from '@/engine';
import type { BankLevel, RumorCard, SealResult, TickPayload, TickResult } from '@/types';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/** Read one variable from a dotenv file without echoing anything. */
function fromEnvFile(file: string, names: string[]): string | null {
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && names.includes(m[1])) {
      const v = m[2].replace(/^['"]|['"]$/g, '');
      if (v) return v;
    }
  }
  return null;
}

function keys(): { primary: Hex | null; backup: Hex | null } {
  const k = loadOperatorKeys();
  if (k.primary) return { primary: k.primary, backup: k.backup };
  const files = [here('../.env.local'), here('../../.env'), here('../../contracts/.env')];
  let primary: Hex | null = null;
  let backup: Hex | null = null;
  for (const f of files) {
    primary ??= normalizePk(fromEnvFile(f, ['VITE_OPERATOR_PK', 'OPERATOR_PK']));
    backup ??= normalizePk(fromEnvFile(f, ['VITE_BACKUP_PK', 'BACKUP_PK']));
  }
  return { primary, backup };
}

const mon = (w: bigint) => `${Number(formatEther(w)).toFixed(3)} MON`;
const ausd = (v: bigint) => `${Number(formatUnits(v, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 })} AUSD`;
const sec = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const line = (s = '') => console.log(s);
const head = (s: string) => line(`\n── ${s} ${'─'.repeat(Math.max(2, 60 - s.length))}`);

function show(label: string, r: SealResult): void {
  const t = r.record;
  const ms = (t.sealedAtMs ?? Date.now()) - t.sentAtMs;
  const hash = t.txHash ? `${t.txHash.slice(0, 12)}…` : '–';
  line(
    `  ✓ ${label.padEnd(10)} ${sec(ms).padStart(7)}  block ${String(t.blockNumber ?? '–').padStart(9)}  gas ${String(t.gasUsed ?? '–').padStart(8)}` +
      ` / limit ${String(t.gasLimit ?? '–').padStart(8)}  ${hash}`,
  );
  if (t.txHash) line(`      ${explorerTx(t.txHash)}`);
}

let failures = 0;
const fail = (msg: string) => {
  failures += 1;
  line(`  ✗ ${msg}`);
};

const soakTicks = Number(opt('soak') ?? 0) || 0;

async function main(): Promise<void> {
  const rpcOverride = opt('rpc') ?? process.env.VITE_RPC_URL ?? null;
  const model = loadModel();

  head('RPC latency');
  for (const e of endpointsFor('presenter', rpcOverride)) {
    const t0 = performance.now();
    try {
      const res = await fetch(e.http, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }]).slice(1, -1),
        signal: AbortSignal.timeout(5000),
      });
      const j = (await res.json()) as { result?: string };
      const chain = j.result ? parseInt(j.result, 16) : null;
      line(`  ${chain === NETWORK.chainId ? '✓' : '✗'} ${e.name.padEnd(17)} ${Math.round(performance.now() - t0)} ms  chain ${chain}`);
    } catch (err) {
      line(`  ✗ ${e.name.padEnd(17)} ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  const { primary, backup } = keys();
  if (!primary) {
    fail('No operator key found. Put VITE_OPERATOR_PK in app/.env.local (testnet-only key).');
    return;
  }

  head('Wallets');
  line(`  operator  ${addressOfKey(primary)}`);
  if (backup) line(`  backup    ${addressOfKey(backup)}`);
  const adapter: LiveAdapter = createLiveAdapter({ primaryPk: primary, backupPk: backup, rpcOverride, syncSend: !flag('no-sync') });
  const bal = await adapter.balances();
  line(`  operator balance  ${mon(bal.primary)}`);
  if (bal.backup !== null) line(`  backup balance    ${mon(bal.backup)}`);

  head('Deployment');
  if (!deployment.deployed) {
    fail('No contract deployed yet (config/deployment.testnet.json has runBank: null).');
    return;
  }
  line(`  RunBank  ${deployment.runBank}  (${deployment.tokenKind}, block ${deployment.deployBlock ?? '?'})`);
  let snap = await adapter.readSnapshot();
  line(`  status ${snap.status} · level ${snap.level} · run ${snap.runId} · tick ${snap.tick} · read at block ${snap.readAtBlock ?? '?'}`);
  line(`  bank holds ${ausd(snap.ausdHeld)} · street holds ${ausd(snap.streetHeld)} · cash ${ausd(snap.cash)} · bonds ${ausd(snap.bonds)}`);
  const ledgerOk = snap.ledgerHash.toLowerCase() === model.ledger.ledgerHash.toLowerCase();
  line(`  ledger hash ${ledgerOk ? 'matches the engine' : 'DIFFERS from the engine'}`);
  if (!ledgerOk) fail('Onchain ledger differs from the engine ledger: ask A to re-run LoadLedger.');
  const need = model.configs[0].cash0 + model.configs[0].bonds0;
  if (snap.ausdHeld + snap.streetHeld < need) fail(`Bank holds ${ausd(snap.ausdHeld + snap.streetHeld)} but needs ${ausd(need)}. Fund it first.`);

  if (flag('ping') || flag('mini') || flag('run') || soakTicks > 0) {
    head('ping');
    try {
      show('ping', await adapter.ping());
    } catch (e) {
      fail(`ping: ${translateError(e).detail}`);
      return;
    }
  }

  if (flag('mini') || flag('run') || soakTicks > 0) {
    const level = Number(opt('level') ?? 0) as BankLevel;
    const card = Number(opt('card') ?? 0) as RumorCard;
    if (snap.status !== 'ready') {
      head('reset (bank was not ready)');
      show('reset', await adapter.reset());
    }
    if (failures) return;

    head(`${soakTicks > 0 ? 'soak' : flag('run') ? 'run' : 'mini'} · level ${level} · card ${card}`);
    try {
      show('setLevel', await adapter.setLevel(level, model.configs[level]));
      const params = defaultParams(model, level, card);
      const started = await adapter.startRumor(params, model.modelHash);
      show('rumor', started);
      if (!started.rumor) fail('startRumor returned no RumorStarted event');

      let run = createRun(model, params);
      if (soakTicks > 0) await playSoak(adapter, model, soakTicks);
      else if (flag('run')) await playRun(adapter, model, run);
      else {
        const payloads: TickPayload[] = [];
        const results: TickResult[] = [];
        for (let i = 0; i < 3; i++) {
          const s = stepRun(model, run);
          run = s.run;
          payloads.push(s.payload);
          results.push(s.result);
        }
        if (flag('stress')) {
          const ids = Array.from({ length: 60 }, (_, i) => i * 8 + 1);
          for (let i = 0; i < 3; i++) payloads[i] = { tick: i + 1, requested: ids.slice(i * 20, i * 20 + 20) };
          line('  (stress: 60 synthetic ids instead of engine requests; mirror comparison skipped)');
        }
        const res = await adapter.sealTicks(1, payloads.map((p) => p.requested));
        show(`ticks 1-${payloads.length}`, res);
        line(`      requested per tick: ${payloads.map((p) => p.requested.length).join(', ')} · TickSealed events: ${res.ticks.length}`);
        if (res.ticks.length !== payloads.length && !res.outcome) fail(`expected ${payloads.length} TickSealed events, got ${res.ticks.length}`);
        if (!flag('stress')) {
          const bad = res.ticks.filter((t, i) => t.paid !== results[i].paid || t.cashAfter !== results[i].cashAfter || t.served !== results[i].served.length);
          line(`      mirror: ${res.ticks.length - bad.length}/${res.ticks.length} ticks match the engine`);
          if (bad.length) fail(`mirror mismatch at tick ${bad[0].tick}`);
        }
        if (res.outcome) line(`      outcome: ${res.outcome.kind} at tick ${res.outcome.tick}`);
      }
    } catch (e) {
      fail(translateError(e).detail);
    } finally {
      try {
        head('reset');
        show('reset', await adapter.reset());
      } catch (e) {
        fail(`reset: ${translateError(e).detail}`);
      }
    }
    snap = await adapter.readSnapshot();
    line(`  bank is ${snap.status}, holds ${ausd(snap.ausdHeld)}, street ${ausd(snap.streetHeld)}`);
    if (snap.status !== 'ready') fail(`bank is ${snap.status} after reset`);
  }

  if (adapter.gasLog.length) {
    head('gas log (for calibration)');
    line('  ticks  ids  slots  estimate   formula    limit      used');
    for (const g of adapter.gasLog) {
      line(`  ${String(g.ticks).padStart(5)} ${String(g.ids).padStart(4)} ${String(g.distinctSlots).padStart(6)} ${String(g.estimate ?? '–').padStart(9)} ${String(g.formula).padStart(9)} ${String(g.gasLimit).padStart(8)} ${String(g.gasUsed).padStart(9)}`);
    }
  }
  const after = await adapter.balances();
  line(`\n  operator spent ${mon(bal.primary - after.primary)}`);
  adapter.dispose();
}

/** A whole run through the SealQueue at 400 ms cadence, the way the controller drives it. */
async function playRun(adapter: LiveAdapter, model: ReturnType<typeof loadModel>, run0: ReturnType<typeof createRun>): Promise<void> {
  const queue = createSealQueue(adapter);
  const mirror = new Map<number, TickResult>();
  const chainTicks: number[] = [];
  let outcome: SealResult['outcome'] = null;
  let matched = 0;
  queue.onHealth((h) => line(`      health → ${h}`));
  queue.onError((e) => fail(`queue paused: ${e.detail}`));
  queue.onSealed((r) => {
    show(`ticks ${r.record.fromTick}-${r.record.toTick}`, r);
    for (const t of r.ticks) {
      chainTicks.push(t.tick);
      const m = mirror.get(t.tick);
      if (m && m.paid === t.paid && m.cashAfter === t.cashAfter && m.served.length === t.served && m.fireSaleLoss === t.fireSaleLoss) matched += 1;
    }
    if (r.outcome) outcome = r.outcome;
  });

  let run = run0;
  const t0 = Date.now();
  for (let i = 0; i < 80 && !outcome; i++) {
    const s = stepRun(model, run);
    run = s.run;
    mirror.set(s.payload.tick, s.result);
    queue.push(s.payload);
    if (s.result.statusAfter !== 'running') break;
    await new Promise((r) => setTimeout(r, 400));
  }
  await queue.drain();
  queue.stop();

  const gaps = chainTicks.some((t, i) => t !== i + 1);
  line(`\n  sealed ${chainTicks.length} ticks in ${sec(Date.now() - t0)} · mirror ${matched}/${chainTicks.length} · gap-free: ${gaps ? 'NO' : 'yes'}`);
  if (gaps) fail(`ticks were not contiguous: ${chainTicks.join(',')}`);
  if (matched !== chainTicks.length) fail('mirror mismatch during the run');
  if (!outcome) fail('the run ended without an outcome event');
  else {
    const o = outcome as NonNullable<SealResult['outcome']>;
    line(`  outcome: ${o.kind} at tick ${o.tick}${o.kind === 'failed' ? ` · trapped ${o.trappedCount} (${ausd(o.trappedAmount)})` : ''}`);
  }
  if (chainTicks.length < 15) line(`  note: only ${chainTicks.length} ticks; pick a slower card for the 15+ tick check (--card).`);
}

/** N ticks through the SealQueue with one small depositor per tick: nothing can fail the bank, so the queue is the test. */
async function playSoak(adapter: LiveAdapter, model: ReturnType<typeof loadModel>, n: number): Promise<void> {
  const small = model.ledger.balances.map((b, id) => ({ b, id })).filter((x) => x.b > 0n && x.b < 10_000_000n).map((x) => x.id);
  const queue = createSealQueue(adapter);
  const chainTicks: number[] = [];
  let outcome: SealResult['outcome'] = null;
  let txs = 0;
  queue.onError((e) => fail(`queue paused: ${e.detail}`));
  queue.onSealed((r) => {
    txs += 1;
    line(`  ✓ tx ${String(txs).padStart(2)}  ticks ${r.record.fromTick}-${r.record.toTick}  ${sec((r.record.sealedAtMs ?? 0) - r.record.sentAtMs)}  gas ${r.record.gasLimit}`);
    for (const t of r.ticks) chainTicks.push(t.tick);
    if (r.outcome) outcome = r.outcome;
  });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    queue.push({ tick: i + 1, requested: [small[i % small.length]] });
    await new Promise((r) => setTimeout(r, 400));
  }
  await queue.drain();
  queue.stop();
  const gaps = chainTicks.length !== n || chainTicks.some((t, i) => t !== i + 1);
  line(`\n  sealed ${chainTicks.length}/${n} ticks in ${txs} txs over ${sec(Date.now() - t0)} · gap-free: ${gaps ? 'NO' : 'yes'}`);
  if (gaps) fail(`ticks were not contiguous: ${chainTicks.join(',')}`);
  if (outcome) line(`  (the bank ended early: ${(outcome as NonNullable<SealResult['outcome']>).kind})`);
}

main()
  .catch((e) => {
    fail(`unexpected: ${translateError(e).detail}`);
  })
  .finally(() => {
    line(failures ? `\nFAILED (${failures} problem${failures === 1 ? '' : 's'})` : '\nOK');
    process.exit(failures ? 1 : 0);
  });
