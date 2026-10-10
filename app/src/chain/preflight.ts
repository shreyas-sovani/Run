// Preflight (PRD §12.5, C-06). Every check names what failed in plain language; checks that cannot run report `fail`
// (or `warn` for non-critical ones) instead of throwing, so the report always renders.
import { formatUnits } from 'viem';
import type { Address } from 'viem';
import { getBalance, getChainId, readContract, getCode } from 'viem/actions';
import { CHAIN_LIMITS, NETWORK } from '@/config/network';
import type { BankSnapshotView, CheckStatus, Model, PreflightCheck, PreflightReport, SealResult } from '@/types';
import { runBankAbi } from './abi';
import type { BlockFeed } from './blocks';
import type { ChainClient, RpcEndpoint } from './clients';
import { deployment } from './deployment';
import { translateError } from './errors';
import { hashConfig } from '@/engine';

export interface PreflightDeps {
  model: Model;
  client: ChainClient;
  endpoints: RpcEndpoint[];
  blockFeed: BlockFeed;
  primary: Address | null;
  backup: Address | null;
  /** The account that will sign right now (primary, or backup after a switch). */
  active: Address | null;
  readSnapshot(): Promise<BankSnapshotView>;
  ping(): Promise<SealResult>;
}

const RPC_OK_MS = 800;
const PING_OK_MS = 2000;

const mon = (wei: bigint): string => {
  const n = Number(formatUnits(wei, 18));
  return `${n.toFixed(n >= 100 ? 0 : 1)} MON`;
};
const ausd = (v: bigint): string => `${Number(formatUnits(v, NETWORK.ausdDecimals)).toLocaleString('en-US', { maximumFractionDigits: 2 })} AUSD`;
const short = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;
const why = (e: unknown): string => translateError(e).detail;

async function timed<T>(fn: () => Promise<T>, timeoutMs = CHAIN_LIMITS.rpcTimeoutMs): Promise<{ value: T; ms: number }> {
  const t0 = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const value = await Promise.race([
    fn(),
    new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error('timed out')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  return { value, ms: Math.round(performance.now() - t0) };
}

export async function runPreflight(d: PreflightDeps): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string, critical: boolean) => {
    checks.push({ id, label, status, detail, critical });
  };

  // ── RPCs: each one separately (non-critical), plus a summary (critical: at least one).
  const rpcResults = await Promise.all(
    d.endpoints.map(async (e) => {
      try {
        // A one-off client per endpoint would duplicate setup; fetch directly so a single RPC is measured in isolation.
        const { value, ms } = await timed(async () => {
          const res = await fetch(e.http, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
          });
          const j = (await res.json()) as { result?: string; error?: { message?: string } };
          if (j.error || !j.result) throw new Error(j.error?.message ?? 'bad response');
          return parseInt(j.result, 16);
        });
        return { name: e.name, chainId: value, ms, error: null as string | null };
      } catch (err) {
        return { name: e.name, chainId: null, ms: null, error: err instanceof Error ? err.message : 'unreachable' };
      }
    }),
  );
  for (const r of rpcResults) {
    if (r.error || r.chainId === null) add(`rpc:${r.name}`, `RPC · ${r.name}`, 'warn', `Unreachable (${r.error ?? 'no answer'})`, false);
    else if (r.chainId !== NETWORK.chainId) add(`rpc:${r.name}`, `RPC · ${r.name}`, 'fail', `Wrong chain (${r.chainId}, expected ${NETWORK.chainId})`, false);
    else add(`rpc:${r.name}`, `RPC · ${r.name}`, r.ms! <= RPC_OK_MS ? 'pass' : 'warn', `${r.ms} ms`, false);
  }
  const good = rpcResults.filter((r) => r.chainId === NETWORK.chainId && r.ms !== null);
  const fastest = good.length ? good.reduce((a, b) => (a.ms! <= b.ms! ? a : b)) : null;
  if (!fastest) add('rpc', 'Monad RPC reachable', 'fail', "Can't reach Monad testnet on any RPC.", true);
  else add('rpc', 'Monad RPC reachable', fastest.ms! <= RPC_OK_MS ? 'pass' : 'warn', `${fastest.name} · ${fastest.ms} ms · chain ${NETWORK.chainId}`, true);

  // Also confirm through the real fallback client (chain id), so a failover bug can't hide behind direct fetches.
  try {
    const id = await timed(() => getChainId(d.client));
    if (id.value !== NETWORK.chainId) checks[checks.length - 1] = { ...checks[checks.length - 1], status: 'fail', detail: `Wrong chain (${id.value})` };
  } catch {
    /* covered by the per-endpoint checks above */
  }

  // ── Block feed: a block within the last 2 s.
  try {
    const n0 = await timed(() => d.client.getBlockNumber({ cacheTime: 0 }));
    const deadline = Date.now() + 2000;
    let advanced = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      const n = await d.client.getBlockNumber({ cacheTime: 0 });
      if (n > n0.value) { advanced = true; break; }
    }
    add('blocks', 'Block feed live', advanced ? 'pass' : 'fail', advanced ? `Block #${n0.value.toLocaleString('en-US')} and counting` : 'No new block in 2 s', true);
  } catch (e) {
    add('blocks', 'Block feed live', 'fail', why(e), true);
  }

  // ── Keys and balances.
  if (!d.primary) {
    add('key', 'Operator key loaded', 'fail', 'No operator key loaded. Paste it on the Ops page.', true);
    add('operatorMon', 'Operator MON', 'fail', 'No operator key, so no balance to check.', true);
  } else {
    add('key', 'Operator key loaded', 'pass', short(d.primary), true);
    try {
      const bal = await getBalance(d.client, { address: d.active ?? d.primary });
      const st: CheckStatus = bal >= CHAIN_LIMITS.warnMonWei ? 'pass' : bal >= CHAIN_LIMITS.refuseMonWei ? 'warn' : 'fail';
      add('operatorMon', 'Operator MON', st, st === 'pass' ? mon(bal) : `${mon(bal)}. Keep it above 15 MON (Monad's 10 MON reserve throttles sends below that).`, true);
    } catch (e) {
      add('operatorMon', 'Operator MON', 'fail', why(e), true);
    }
  }
  if (!d.backup) add('backupMon', 'Backup MON', 'warn', 'No backup key loaded.', false);
  else {
    try {
      const bal = await getBalance(d.client, { address: d.backup });
      add('backupMon', 'Backup MON', bal >= CHAIN_LIMITS.refuseMonWei ? 'pass' : 'warn', `${short(d.backup)} · ${mon(bal)}`, false);
    } catch (e) {
      add('backupMon', 'Backup MON', 'warn', why(e), false);
    }
  }

  // ── Contract.
  const bankAddr = deployment.runBank;
  let snap: BankSnapshotView | null = null;
  if (!bankAddr) {
    for (const [id, label] of [['bank', 'RunBank contract'], ['status', 'Bank status'], ['ausd', 'AUSD held by the bank'], ['ledger', 'Ledger matches the engine'], ['ping', 'Test transaction']] as const) {
      add(id, label, 'fail', 'No contract deployed yet. Agent A writes the address to deployment.testnet.json.', true);
    }
    add('config', 'Bank config matches the engine', 'warn', 'No contract deployed yet.', false);
    return finish(checks);
  }

  try {
    const code = await getCode(d.client, { address: bankAddr });
    if (!code || code === '0x') {
      add('bank', 'RunBank contract', 'fail', `No code at ${short(bankAddr)}. Was it deployed to the right network?`, true);
    } else if (!d.active) {
      add('bank', 'RunBank contract', 'fail', 'Contract found, but no operator key to check against.', true);
    } else {
      const ok = await readContract(d.client, { address: bankAddr, abi: runBankAbi, functionName: 'isOperator', args: [d.active] });
      add('bank', 'RunBank contract', ok ? 'pass' : 'fail', ok ? `${short(bankAddr)} · operator allowed` : "This key can't run the bank. Load the operator key on the Ops page.", true);
    }
  } catch (e) {
    add('bank', 'RunBank contract', 'fail', why(e), true);
  }

  try {
    snap = await d.readSnapshot();
  } catch (e) {
    for (const [id, label, critical] of [['status', 'Bank status', true], ['ausd', 'AUSD held by the bank', true], ['ledger', 'Ledger matches the engine', true], ['config', 'Bank config matches the engine', false]] as const) {
      add(id, label, critical ? 'fail' : 'warn', `Couldn't read the bank: ${why(e)}`, critical);
    }
  }

  if (snap) {
    add('status', 'Bank status', snap.status === 'ready' ? 'pass' : 'warn', snap.status === 'ready' ? 'Ready' : `Bank is ${snap.status}. Reset the bank before starting.`, true);

    const cfg = d.model.configs[snap.level] ?? d.model.configs[0];
    const need = cfg.cash0 + cfg.bonds0;
    // After a run, part of the money sits in Street until reset: count both.
    const have = snap.ausdHeld + (snap.status === 'ready' ? 0n : snap.streetHeld);
    add('ausd', 'AUSD held by the bank', have >= need ? 'pass' : 'fail', have >= need ? `${ausd(have)} held` : `The bank holds ${ausd(have)} but needs ${ausd(need)}. Fund it on the Ops page.`, true);

    const ledgerOk = snap.ledgerHash.toLowerCase() === d.model.ledger.ledgerHash.toLowerCase();
    add('ledger', 'Ledger matches the engine', ledgerOk ? 'pass' : 'fail', ledgerOk ? 'Ledger hash matches' : 'The onchain ledger differs from the engine ledger. Ask A to re-run LoadLedger.', true);

    const cfgOk = snap.configHash.toLowerCase() === hashConfig(cfg).toLowerCase();
    add('config', 'Bank config matches the engine', cfgOk ? 'pass' : 'warn', cfgOk ? `Level ${snap.level} config matches` : 'Config differs; it will be set when you switch banks.', false);
  }

  // ── Test transaction: ping, sealed within 2 s.
  if (!d.active) {
    add('ping', 'Test transaction', 'fail', 'No operator key, so no transaction can be sent.', true);
  } else {
    try {
      const t0 = Date.now();
      const res = await d.ping();
      const ms = (res.record.sealedAtMs ?? Date.now()) - t0;
      add('ping', 'Test transaction', ms <= PING_OK_MS ? 'pass' : 'fail', `Sealed in ${(ms / 1000).toFixed(2)} s${res.record.blockNumber ? ` · block #${res.record.blockNumber.toLocaleString('en-US')}` : ''}`, true);
    } catch (e) {
      add('ping', 'Test transaction', 'fail', why(e), true);
    }
  }
  return finish(checks);
}

function finish(checks: PreflightCheck[]): PreflightReport {
  // The report stays in the order the presenter reads it: RPCs, blocks, keys, bank, transaction.
  return { checks, ok: checks.every((c) => !c.critical || c.status === 'pass' || c.status === 'warn'), at: Date.now() };
}
