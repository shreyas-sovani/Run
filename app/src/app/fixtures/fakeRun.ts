// F-02: scripted fake run for labs. Drives the store through
// idle → starting → running → failing/surviving → failed/survived using the engine, with simulated seals.
import { keccak256, toHex } from 'viem';
import { MAX_LEAD, TICK_MS, createRun, defaultParams, loadModel, stepRun } from '@/engine';
import { initialRunView, patchRun, runStore } from '@/app/state';
import type { BankLevel, Outcome, RunState, SealRecord } from '@/types';

const SEAL_EVERY_MS = 900;
let cancelActive: (() => void) | null = null;

export function startFakeRun(opts?: { level?: BankLevel; outcome?: 'failed' | 'survived' }): () => void {
  cancelActive?.();
  const level: BankLevel = opts?.outcome ? (opts.outcome === 'failed' ? 0 : 1) : (opts?.level ?? 0);
  const model = loadModel();
  const params = defaultParams(model, level, 1);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  let cancelled = false;
  let seq = 0;
  let block = 21_483_200n;
  const hash = () => keccak256(toHex(`fake-${seq++}-${Date.now()}`));
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!cancelled) fn();
    }, ms);
    timers.add(t);
  };
  const every = (ms: number, fn: () => void) => {
    const t = setInterval(() => {
      if (!cancelled) fn();
    }, ms);
    intervals.add(t);
  };
  const cancel = () => {
    cancelled = true;
    timers.forEach(clearTimeout);
    intervals.forEach(clearInterval);
    if (cancelActive === cancel) cancelActive = null;
  };
  cancelActive = cancel;

  const base = initialRunView();
  patchRun({
    ...base,
    operator: runStore.getState().operator,
    mode: 'practice',
    level,
    card: params.card,
    model,
    phase: 'starting',
    pending: { ...base.pending, starting: true },
  });

  let run: RunState;
  let startedAt = 0;
  let pendingFrom = 1;
  let pendingTo = 0;
  let seals: SealRecord[] = [];
  let sealedTick = 0;
  let matched = 0;

  const record = (kind: SealRecord['kind'], from: number | null, to: number | null, count: number | null): SealRecord => {
    block += 1n;
    return {
      id: seals.length + 1, kind, simulated: true, fromTick: from, toTick: to, requestedCount: count,
      txHash: hash(), blockNumber: block, sentAtMs: Date.now() - 400, sealedAtMs: Date.now(),
      gasLimit: 400_000n, gasUsed: 310_000n, status: 'sealed', finalized: true, mirrorMatch: kind === 'ticks' ? true : null, rpc: 'fake',
    };
  };

  const flushSeal = () => {
    if (pendingTo < pendingFrom) return;
    const requested = run.history.slice(pendingFrom - 1, pendingTo).reduce((n, t) => n + t.requested.length, 0);
    seals = [...seals, record('ticks', pendingFrom, pendingTo, requested)];
    matched += pendingTo - pendingFrom + 1;
    sealedTick = pendingTo;
    pendingFrom = pendingTo + 1;
    patchRun({
      seals, sealedTick, blockNumber: block, finalizedBlock: block - 2n, health: 'sealing',
      mirror: { matched, total: matched, firstMismatchTick: null },
    });
  };

  later(500, () => {
    run = createRun(model, params);
    startedAt = Date.now();
    seals = [record('rumor', null, null, null)];
    patchRun({
      phase: 'running', pending: { ...runStore.getState().pending, starting: false }, frame: run.frame, startedAtMs: startedAt,
      seals, blockNumber: block, finalizedBlock: block - 2n,
    });

    every(SEAL_EVERY_MS, flushSeal);
    every(TICK_MS, () => {
      if (run.frame.bank.status !== 'running') return;
      if (run.frame.tick - sealedTick >= MAX_LEAD) return;
      const step = stepRun(model, run);
      run = step.run;
      pendingTo = step.result.tick;
      patchRun({ frame: run.frame, elapsedMs: Date.now() - startedAt });
      const kind = step.result.statusAfter;
      if (kind !== 'failed' && kind !== 'survived') return;
      patchRun({ phase: kind === 'failed' ? 'failing' : 'surviving' });
      later(SEAL_EVERY_MS, () => {
        flushSeal();
        const bank = run.frame.bank;
        const trapped = step.result.trapped;
        const outcomeBlock = block + 1n;
        const outcome: Outcome = {
          kind, tick: step.result.tick, wallMs: Date.now() - startedAt, blocks: Number(outcomeBlock - seals[0].blockNumber!),
          rumorBlock: seals[0].blockNumber, outcomeBlock,
          trappedCount: trapped?.count ?? 0, trappedAmount: trapped?.amount ?? 0n, uninsuredTrapped: trapped?.uninsured ?? 0n,
          withdrawnAmount: bank.deposits0 - bank.depositsOwed, sealed: false,
        };
        patchRun({ phase: kind, outcome, health: 'idle', elapsedMs: Date.now() - startedAt });
        intervals.forEach(clearInterval);
      });
    });
  });

  return cancel;
}

/** Stops any fake run in flight (used by the controller's reset). */
export function stopFakeRun(): void {
  cancelActive?.();
}
