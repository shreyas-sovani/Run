// Live mode (F-06) and Spectate (F-08) against a fake "live" adapter built on the mock adapter, so there is no
// testnet traffic and no real key. The controller only sees the ChainAdapter interface, so this exercises the real path.
import { generatePrivateKey } from 'viem/accounts';
import { describe, expect, it, vi } from 'vitest';
import type { ChainAdapter } from '@/chain';
import type { OutcomeEvent, RumorEvent, TickSealedEvent } from '@/types';

const MON = 10n ** 18n;

const h = vi.hoisted(() => ({
  balances: { primary: 40n * 10n ** 18n, backup: 25n * 10n ** 18n } as { primary: bigint; backup: bigint | null },
  sp: {
    rumor: [] as ((e: RumorEvent) => void)[],
    ticks: [] as ((e: TickSealedEvent[]) => void)[],
    outcome: [] as ((e: OutcomeEvent) => void)[],
    reset: [] as ((n: number) => void)[],
    snap: [] as ((s: never) => void)[],
    started: 0,
  },
  live: null as null | ChainAdapter,
}));

vi.mock('@/chain', async (orig) => {
  const real = await orig<typeof import('@/chain')>();
  const engine = await import('@/engine');
  const reg = <T>(list: T[]) => (cb: T) => {
    list.push(cb);
    return () => {
      list.splice(list.indexOf(cb), 1);
    };
  };
  return {
    ...real,
    createLiveAdapter: (): ChainAdapter => {
      const base = real.createMockAdapter(engine.loadModel(), { latencyMs: [5, 15] });
      let usingBackup = false;
      const live: ChainAdapter = {
        ...base,
        kind: 'live',
        operator: '0x85db51Abac83F8B1DF2E674c29f8D68527Bf6b10',
        balances: async () => h.balances,
        switchToBackup: () => {
          if (h.balances.backup === null || usingBackup) return false;
          usingBackup = true;
          return true;
        },
        async preflight() {
          return { ok: true, at: Date.now(), checks: [{ id: 'fake', label: 'Fake live adapter', status: 'pass', detail: 'ok', critical: true }] };
        },
      };
      h.live = live;
      return live;
    },
    createSpectator: (): Spectator => ({
      start() { h.sp.started += 1; },
      stop() {},
      onRumor: reg(h.sp.rumor),
      onTicks: reg(h.sp.ticks),
      onOutcome: reg(h.sp.outcome),
      onReset: reg(h.sp.reset),
      onSnapshot: reg(h.sp.snap),
    }),
  };
});

type Spectator = import('@/chain').Spectator;

import { controller } from '@/app/controller';
import { getRunView, runActions } from '@/app/store';
import { createRun, defaultParams, loadModel, stepRun } from '@/engine';
import { createMockAdapter } from '@/chain';

function waitFor(pred: () => boolean, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (pred()) { clearInterval(id); resolve(); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(id); reject(new Error(`timeout waiting for ${label}`)); }
    }, 25);
  });
}

describe('live mode on a fake live adapter', () => {
  it('connects, passes preflight, runs Bhau\'s Bank to a sealed failure and runs the decision check', async () => {
    controller.init();
    await runActions.connectOperator({ primary: generatePrivateKey(), backup: generatePrivateKey() });
    expect(getRunView().preflight?.ok).toBe(true);
    expect(getRunView().operator.address).not.toBeNull();
    expect(getRunView().operator.balanceWei).toBe(40n * MON);

    runActions.setMode('live', { auto: true });
    expect(getRunView().mode).toBe('live');
    runActions.selectLevel(0);
    runActions.selectCard(1);
    void runActions.start();
    void runActions.start(); // doubled: must be ignored
    await waitFor(() => getRunView().phase === 'failed', 30_000, 'live bank to fail');

    const v = getRunView();
    expect(v.mode).toBe('live');
    expect(v.outcome?.kind).toBe('failed');
    expect(v.outcome?.sealed).toBe(true); // adapter.kind === 'live'
    expect(v.mirror.matched).toBe(v.mirror.total);
    expect(v.onchain).not.toBeNull();
    await waitFor(() => getRunView().decisions !== null, 5_000, 'decision check');
    expect(getRunView().decisions!.matched).toBe(getRunView().decisions!.total);
    expect(controller.saveReplay()?.outcome.kind).toBe('failed');

    // The bank is Failed onchain: Enter after a reset sequence works, and a reset then switching bank survives.
    runActions.selectLevel(1);
    await waitFor(() => getRunView().phase === 'idle' && getRunView().level === 1, 10_000, 'reset + switch');
    runActions.selectCard(1);
    void runActions.start();
    await waitFor(() => getRunView().phase === 'survived', 45_000, 'live bank to survive');
    expect(getRunView().outcome?.trappedCount).toBe(0);
    expect(getRunView().seals.some((s) => s.kind === 'setLevel')).toBe(true);
  }, 120_000);

  it('refuses to start below 10.5 MON and offers the backup key, then starts after switching', async () => {
    runActions.reset();
    await waitFor(() => getRunView().phase === 'idle', 10_000, 'idle');
    runActions.selectLevel(0);
    h.balances = { primary: 10n * MON, backup: 25n * MON };
    runActions.selectCard(1);
    await runActions.start();
    let v = getRunView();
    expect(v.phase).toBe('idle');
    expect(v.error?.code).toBe('low-balance');
    expect(v.error?.action?.run).toBe('backup');

    runActions.switchToBackupKey();
    v = getRunView();
    expect(v.operator.usingBackup).toBe(true);
    expect(v.error).toBeNull();
    await waitFor(() => getRunView().operator.balanceWei === 25n * MON, 3_000, 'backup balance');
    void runActions.start();
    await waitFor(() => getRunView().phase === 'running', 5_000, 'running on backup');
    runActions.reset();
    await waitFor(() => getRunView().phase === 'idle', 10_000, 'reset');
    h.balances = { primary: 40n * MON, backup: 25n * MON };
  }, 60_000);

  it('disconnecting returns to practice with no operator', () => {
    runActions.disconnectOperator();
    expect(getRunView().operator.address).toBeNull();
    expect(getRunView().mode).toBe('practice');
  });
});

describe('spectate mode', () => {
  it('rebuilds a run from chain events alone and matches every tick against the mirror', async () => {
    // Produce real "chain events" by running the engine against the mock chain.
    const m = loadModel();
    const chain = createMockAdapter(m, { latencyMs: [0, 1] });
    const params = defaultParams(m, 0, 1);
    const started = await chain.startRumor(params, m.modelHash);
    let eng = createRun(m, params);
    const events: TickSealedEvent[] = [];
    let outcome: OutcomeEvent | null = null;
    let payloads: number[][] = [];
    let first = 1;
    for (let i = 0; i < 60 && !outcome; i++) {
      const s = stepRun(m, eng);
      eng = s.run;
      payloads.push(s.payload.requested);
      if (payloads.length === 2 || s.result.statusAfter !== 'running') {
        const r = await chain.sealTicks(first, payloads);
        events.push(...r.ticks);
        outcome = r.outcome;
        first += payloads.length;
        payloads = [];
      }
    }
    expect(outcome?.kind).toBe('failed');

    runActions.setMode('spectate');
    expect(getRunView().mode).toBe('spectate');
    expect(h.sp.started).toBeGreaterThan(0);

    // Joining mid-run: ticks may arrive before/with the rumor. Rumor first, then ticks in two chunks, then the outcome.
    h.sp.rumor.forEach((cb) => cb(started.rumor!));
    expect(getRunView().phase).toBe('running');
    const mid = Math.floor(events.length / 2);
    h.sp.ticks.forEach((cb) => cb(events.slice(mid))); // out of order: nothing applies yet
    expect(getRunView().frame?.tick).toBe(0);
    h.sp.ticks.forEach((cb) => cb(events.slice(0, mid))); // gap filled: all apply, in order
    const v = getRunView();
    expect(v.frame?.tick).toBe(events.length);
    expect(v.mirror.total).toBe(events.length);
    expect(v.mirror.matched).toBe(events.length);

    h.sp.outcome.forEach((cb) => cb(outcome!));
    await waitFor(() => getRunView().decisions !== null, 5_000, 'decision check');
    const end = getRunView();
    expect(end.phase).toBe('failed');
    expect(end.outcome?.sealed).toBe(true);
    expect(end.decisions!.matched).toBe(end.decisions!.total);

    // A reset event clears the stage back to idle.
    h.sp.reset.forEach((cb) => cb(1));
    expect(getRunView().phase).toBe('idle');
    expect(getRunView().mode).toBe('spectate');
  }, 60_000);
});
