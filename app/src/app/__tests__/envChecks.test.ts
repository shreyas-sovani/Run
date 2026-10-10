// PRD §12.5 environment rows (fonts, audio, window) and the read-only gas log. Mocked adapter, no testnet, no keys.
import { generatePrivateKey } from 'viem/accounts';
import { describe, expect, it, vi } from 'vitest';
import type { ChainAdapter } from '@/chain';
import type { PreflightCheck, PreflightReport } from '@/types';

const h = vi.hoisted(() => ({
  report: null as null | PreflightReport,
  gasLog: [] as { at: number; ticks: number; ids: number; distinctSlots: number; estimate: bigint | null; formula: bigint; gasLimit: bigint; gasUsed: bigint; mode: 'estimate' | 'formula'; txHash: `0x${string}` }[],
}));

vi.mock('@/chain', async (orig) => {
  const real = await orig<typeof import('@/chain')>();
  const engine = await import('@/engine');
  return {
    ...real,
    createLiveAdapter: (): ChainAdapter => {
      const base = real.createMockAdapter(engine.loadModel(), { latencyMs: [1, 3] });
      return {
        ...base,
        kind: 'live',
        operator: '0x85db51Abac83F8B1DF2E674c29f8D68527Bf6b10',
        gasLog: h.gasLog,
        preflight: async () => h.report!,
      } as ChainAdapter;
    },
  };
});

import { controller } from '@/app/controller';
import { environmentChecks, getRunView, runActions } from '@/app/store';

const passing: PreflightReport = {
  ok: true,
  at: 0,
  checks: [{ id: 'rpc', label: 'RPC', status: 'pass', detail: 'ok', critical: true }],
};
const failing: PreflightReport = {
  ok: false,
  at: 0,
  checks: [{ id: 'rpc', label: 'RPC', status: 'fail', detail: 'down', critical: true }],
};
const envIds = ['fonts', 'audio', 'window'];
const row = (id: string, status: PreflightCheck['status']): PreflightCheck => ({ id, label: id, status, detail: id, critical: true /* must be forced to false */ });

describe('environment preflight rows', () => {
  it('appends fonts / audio / window as non-critical rows to every stored report without changing ok', async () => {
    controller.init();
    controller.setEnvChecks(() => [row('fonts', 'fail'), row('audio', 'warn'), row('window', 'fail')]);

    h.report = passing;
    await runActions.connectOperator({ primary: generatePrivateKey() });
    let p = getRunView().preflight!;
    expect(p.checks.map((c) => c.id)).toEqual(['rpc', ...envIds]);
    expect(p.checks.filter((c) => envIds.includes(c.id)).every((c) => c.critical === false)).toBe(true);
    expect(p.ok).toBe(true); // a failing non-critical row never turns a green report red

    h.report = failing;
    p = await runActions.runPreflight();
    expect(p.ok).toBe(false); // …and never turns a red one green
    expect(getRunView().preflight).toBe(p);
    expect(p.checks.filter((c) => envIds.includes(c.id))).toHaveLength(3);
  });

  it('re-running replaces the rows instead of duplicating them', async () => {
    h.report = { ...passing, checks: [...passing.checks, row('audio', 'fail')] }; // a stale audio row from the adapter's report
    const p = await runActions.runPreflight();
    expect(p.checks.filter((c) => c.id === 'audio')).toHaveLength(1);
    expect(p.checks.filter((c) => c.id === 'audio')[0].status).toBe('warn');
  });

  it('adds the rows to the "no operator" and bad-key reports too', async () => {
    runActions.disconnectOperator();
    const none = await runActions.runPreflight();
    expect(none.ok).toBe(false);
    expect(none.checks.map((c) => c.id)).toEqual(['operator', ...envIds]);
    await runActions.connectOperator({ primary: '0x1234' as `0x${string}` });
    expect(getRunView().preflight!.checks.map((c) => c.id)).toEqual(['keys', ...envIds]);
  });

  it('adds nothing when no provider is registered (tsx scripts)', async () => {
    controller.setEnvChecks(null);
    const none = await runActions.runPreflight();
    expect(none.checks.map((c) => c.id)).toEqual(['operator']);
    controller.setEnvChecks(environmentChecks); // restore the real provider
  });

  it('the real provider reports pass/warn/fail per PRD §12.5 (audio not unlocked is a warn)', () => {
    const rows = environmentChecks();
    expect(rows.map((r) => r.id)).toEqual(envIds);
    expect(rows.every((r) => r.critical === false)).toBe(true);
    expect(rows.find((r) => r.id === 'fonts')!.status).toBe('pass'); // no document in node: nothing to wait for
    expect(rows.find((r) => r.id === 'audio')!.status).toBe('warn'); // never 'fail'
    expect(rows.find((r) => r.id === 'window')!.status).toBe('fail'); // node has no window: 0×0
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 });
    expect(environmentChecks().find((r) => r.id === 'window')!.status).toBe('pass');
    vi.stubGlobal('window', { innerWidth: 1279, innerHeight: 720 });
    expect(environmentChecks().find((r) => r.id === 'window')!.status).toBe('fail');
    vi.stubGlobal('window', { innerWidth: 1920, innerHeight: 719 });
    expect(environmentChecks().find((r) => r.id === 'window')!.status).toBe('fail');
    vi.unstubAllGlobals();
  });
});

describe('controller.debug.gasLog', () => {
  it('is empty when no live adapter is connected, and a read-only copy of the adapter log when live', async () => {
    runActions.disconnectOperator();
    expect(controller.debug.gasLog()).toEqual([]);

    h.gasLog.push({
      at: 1, ticks: 3, ids: 60, distinctSlots: 12, estimate: 300_000n, formula: 400_000n, gasLimit: 330_000n, gasUsed: 330_000n, mode: 'estimate',
      txHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
    });
    h.report = passing;
    await runActions.connectOperator({ primary: generatePrivateKey() });
    const rows = controller.debug.gasLog();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ticks: 3, ids: 60, distinctSlots: 12, gasLimit: 330_000n, mode: 'estimate' });
    rows.pop(); // mutating the copy must not touch the adapter's log
    expect(controller.debug.gasLog()).toHaveLength(1);
    expect(h.gasLog).toHaveLength(1);
  });
});
