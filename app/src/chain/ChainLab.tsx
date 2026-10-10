// /lab/chain (C-12): drive the chain layer by hand. Shows addresses only, never keys.
import { useCallback, useMemo, useRef, useState } from 'react';
import { formatEther, formatUnits } from 'viem';
import type { Hex } from 'viem';
import { createRun, defaultParams, loadModel, stepRun } from '@/engine';
import type { BankSnapshotView, PreflightReport, SealResult, TxKind } from '@/types';
import { NETWORK, explorerTx } from '@/config/network';
import { endpointsFor } from './clients';
import { deployment } from './deployment';
import { translateError } from './errors';
import { addressOfKey, loadOperatorKeys } from './keys';
import { createLiveAdapter } from './liveAdapter';
import { createMockAdapter } from './mockAdapter';
import type { ChainAdapter, GasLogEntry, LiveAdapter } from './types';
import styles from './ChainLab.module.css';

type Pending = 'ping' | 'mini' | 'reset' | 'snapshot' | 'preflight' | 'rpcs' | 'balances' | null;
interface LogLine { id: number; at: string; kind: TxKind | 'info' | 'error'; text: string; hash?: Hex | null; simulated?: boolean }

const mon = (w: bigint) => `${Number(formatEther(w)).toFixed(3)} MON`;
const ausd = (v: bigint) => `${Number(formatUnits(v, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 })} AUSD`;
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const isLive = (a: ChainAdapter): a is LiveAdapter => a.kind === 'live';

export function ChainLab() {
  const keys = useMemo(() => loadOperatorKeys(), []);
  const canGoLive = !!keys.primary && deployment.deployed;
  const [mode, setMode] = useState<'live' | 'mock'>(canGoLive ? 'live' : 'mock');
  const [pending, setPending] = useState<Pending>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [snapshot, setSnapshot] = useState<BankSnapshotView | null>(null);
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [rpcs, setRpcs] = useState<{ name: string; ms: number | null; chainId: number | null }[]>([]);
  const [balances, setBalances] = useState<{ primary: bigint; backup: bigint | null } | null>(null);
  const [gasLog, setGasLog] = useState<readonly GasLogEntry[]>([]);
  const nextLine = useRef(1);
  const model = useMemo(() => loadModel(), []);

  const adapter = useMemo<ChainAdapter>(() => {
    if (mode === 'live' && keys.primary) return createLiveAdapter({ primaryPk: keys.primary, backupPk: keys.backup, rpcOverride: import.meta.env.VITE_RPC_URL || null });
    return createMockAdapter(model);
  }, [mode, keys, model]);

  const add = useCallback((kind: LogLine['kind'], text: string, extra: Partial<LogLine> = {}) => {
    setLog((l) => [{ id: nextLine.current++, at: new Date().toLocaleTimeString(), kind, text, ...extra }, ...l].slice(0, 80));
  }, []);

  const showResult = useCallback((label: string, r: SealResult) => {
    const t = r.record;
    const ms = (t.sealedAtMs ?? Date.now()) - t.sentAtMs;
    const extra = [
      t.fromTick !== null ? `ticks ${t.fromTick}–${t.toTick}` : null,
      `${(ms / 1000).toFixed(2)} s`,
      t.blockNumber !== null ? `block ${t.blockNumber}` : null,
      t.gasUsed !== null ? `gas ${t.gasUsed}` : null,
      r.outcome ? `→ ${r.outcome.kind} at tick ${r.outcome.tick}` : null,
    ].filter(Boolean).join(' · ');
    add(t.kind, `${label}: ${extra}`, { hash: t.txHash, simulated: t.simulated });
  }, [add]);

  const guard = useCallback(async (name: Exclude<Pending, null>, fn: () => Promise<void>) => {
    setPending(name);
    try {
      await fn();
    } catch (e) {
      add('error', translateError(e).detail);
    } finally {
      if (isLive(adapter)) setGasLog([...adapter.gasLog]);
      setPending(null);
    }
  }, [add, adapter]);

  const doSnapshot = () => guard('snapshot', async () => setSnapshot(await adapter.readSnapshot()));
  const doBalances = () => guard('balances', async () => setBalances(await adapter.balances()));
  const doPing = () => guard('ping', async () => showResult('ping', await adapter.ping()));
  const doReset = () => guard('reset', async () => {
    showResult('reset', await adapter.reset());
    setSnapshot(await adapter.readSnapshot());
  });
  const doPreflight = () => guard('preflight', async () => {
    const r = await adapter.preflight(model);
    setReport(r);
    add('info', `preflight ${r.ok ? 'passed' : 'FAILED'}: ${r.checks.filter((c) => c.status === 'pass').length}/${r.checks.length} pass`);
  });
  const doRpcs = () => guard('rpcs', async () => {
    const out = await Promise.all(endpointsFor('presenter', import.meta.env.VITE_RPC_URL || null).map(async (e) => {
      const t0 = performance.now();
      try {
        const res = await fetch(e.http, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(5000) });
        const j = (await res.json()) as { result?: string };
        return { name: e.name, ms: Math.round(performance.now() - t0), chainId: j.result ? parseInt(j.result, 16) : null };
      } catch {
        return { name: e.name, ms: null, chainId: null };
      }
    }));
    setRpcs(out);
  });

  /** setLevel(0) → startRumor → seal 3 real model ticks → reset. The same sequence as `pnpm chain:smoke --mini`. */
  const doMini = () => guard('mini', async () => {
    const snap = await adapter.readSnapshot();
    if (snap.status !== 'ready') showResult('reset (bank was not ready)', await adapter.reset());
    showResult('setLevel 0', await adapter.setLevel(0, model.configs[0]));
    const params = defaultParams(model, 0, 0);
    showResult('rumor', await adapter.startRumor(params, model.modelHash));
    let run = createRun(model, params);
    const ticks: number[][] = [];
    for (let i = 0; i < 3; i++) {
      const s = stepRun(model, run);
      run = s.run;
      ticks.push(s.payload.requested);
    }
    try {
      showResult('sealTicks', await adapter.sealTicks(1, ticks));
    } finally {
      showResult('reset', await adapter.reset());
      setSnapshot(await adapter.readSnapshot());
    }
  });

  const busy = pending !== null;
  const btn = (name: Exclude<Pending, null>, label: string, busyLabel: string, run: () => void, disabled = false) => (
    <button type="button" className={styles.btn} onClick={run} disabled={busy || disabled}>{pending === name ? busyLabel : label}</button>
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Chain lab</h1>

      <section className={styles.card}>
        <h2>Adapter</h2>
        <div className={styles.row}>
          <label><input type="radio" checked={mode === 'live'} disabled={!canGoLive} onChange={() => setMode('live')} /> Live (Monad testnet)</label>
          <label><input type="radio" checked={mode === 'mock'} onChange={() => setMode('mock')} /> Mock (simulated)</label>
        </div>
        <dl className={styles.kv}>
          <dt>Network</dt><dd>{NETWORK.name} · chain {NETWORK.chainId}</dd>
          <dt>RunBank</dt><dd>{deployment.runBank ?? 'not deployed yet'}</dd>
          <dt>Operator key</dt><dd>{keys.primary ? `${shortAddr(addressOfKey(keys.primary))} (from ${keys.source})` : 'none loaded'}</dd>
          <dt>Backup key</dt><dd>{keys.backup ? shortAddr(addressOfKey(keys.backup)) : 'none loaded'}</dd>
          <dt>Signing now</dt><dd>{adapter.operator ?? 'nobody (mock)'}{isLive(adapter) && adapter.usingBackup ? ' (backup)' : ''}</dd>
          <dt>Gas mode</dt><dd>{isLive(adapter) ? adapter.gasMode : 'n/a'}</dd>
        </dl>
        {!canGoLive && <p className={styles.note}>Live needs a key (VITE_OPERATOR_PK in app/.env.local, or the Ops page) and a deployed RunBank.</p>}
      </section>

      <section className={styles.card}>
        <h2>Actions</h2>
        <div className={styles.row}>
          {btn('ping', 'Ping', 'Pinging…', doPing)}
          {btn('mini', 'Mini run (3 ticks)', 'Running…', doMini)}
          {btn('reset', 'Reset bank', 'Resetting…', doReset)}
          {btn('snapshot', 'Read snapshot', 'Reading…', doSnapshot)}
          {btn('preflight', 'Preflight', 'Checking…', doPreflight)}
          {btn('rpcs', 'Test RPCs', 'Testing…', doRpcs)}
          {btn('balances', 'Balances', 'Reading…', doBalances)}
          <button type="button" className={styles.btn} disabled={busy || !isLive(adapter) || !keys.backup} onClick={() => add('info', adapter.switchToBackup() ? 'now signing with the backup key' : 'no backup key')}>Switch to backup</button>
        </div>
      </section>

      {rpcs.length > 0 && (
        <section className={styles.card}>
          <h2>RPCs</h2>
          <table className={styles.table}><tbody>
            {rpcs.map((r) => (
              <tr key={r.name}><td>{r.chainId === NETWORK.chainId ? '✓' : '✗'}</td><td>{r.name}</td><td>{r.ms === null ? 'unreachable' : `${r.ms} ms`}</td><td>chain {r.chainId ?? '–'}</td></tr>
            ))}
          </tbody></table>
        </section>
      )}

      {balances && (
        <section className={styles.card}>
          <h2>Balances</h2>
          <dl className={styles.kv}>
            <dt>Operator</dt><dd>{mon(balances.primary)}</dd>
            <dt>Backup</dt><dd>{balances.backup === null ? 'no backup key' : mon(balances.backup)}</dd>
          </dl>
        </section>
      )}

      {snapshot && (
        <section className={styles.card}>
          <h2>Bank snapshot</h2>
          <dl className={styles.kv}>
            <dt>Status</dt><dd>{snapshot.status} · level {snapshot.level} · run {snapshot.runId} · tick {snapshot.tick}</dd>
            <dt>Cash / bonds</dt><dd>{ausd(snapshot.cash)} / {ausd(snapshot.bonds)}</dd>
            <dt>Owed</dt><dd>{ausd(snapshot.depositsOwed)} (insured {ausd(snapshot.insuredOwed)})</dd>
            <dt>Loss</dt><dd>{ausd(snapshot.cumulativeLoss)} · haircut {snapshot.lastHaircutBps / 100}%</dd>
            <dt>AUSD held</dt><dd>bank {ausd(snapshot.ausdHeld)} · street {ausd(snapshot.streetHeld)}</dd>
            <dt>Queue</dt><dd>{snapshot.queueLength} waiting · {snapshot.withdrawnCount} withdrawn</dd>
            <dt>Read at block</dt><dd>{String(snapshot.readAtBlock ?? '–')}</dd>
          </dl>
        </section>
      )}

      {report && (
        <section className={styles.card}>
          <h2>Preflight · {report.ok ? 'ok' : 'blocked'}</h2>
          <table className={styles.table}><tbody>
            {report.checks.map((c) => (
              <tr key={c.id} data-status={c.status}>
                <td className={styles[c.status]}>{c.status}</td><td>{c.label}{c.critical ? ' *' : ''}</td><td>{c.detail}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}

      {gasLog.length > 0 && (
        <section className={styles.card}>
          <h2>Gas log (sealTicks batches)</h2>
          <table className={styles.table}>
            <thead><tr><th>ticks</th><th>ids</th><th>slots</th><th>estimate</th><th>formula</th><th>limit</th><th>mode</th></tr></thead>
            <tbody>
              {gasLog.map((g, i) => (
                <tr key={i}><td>{g.ticks}</td><td>{g.ids}</td><td>{g.distinctSlots}</td><td>{String(g.estimate ?? '–')}</td><td>{String(g.formula)}</td><td>{String(g.gasLimit)}</td><td>{g.mode}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className={styles.card}>
        <h2>Log</h2>
        {log.length === 0 && <p className={styles.note}>Nothing yet. Press Ping.</p>}
        <ul className={styles.log}>
          {log.map((l) => (
            <li key={l.id} className={l.kind === 'error' ? styles.err : undefined}>
              <span className={styles.time}>{l.at}</span> {l.text}
              {l.simulated && <span className={styles.sim}> · simulated</span>}
              {l.hash && <> · <a href={explorerTx(l.hash)} target="_blank" rel="noreferrer">{l.hash.slice(0, 10)}…</a></>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
