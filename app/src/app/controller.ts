// RunController. MODULE SINGLETON: no React state, idempotent init/start, so React StrictMode's
// double effects can never start two runners. F-05 replaces this bootstrap skeleton with the real
// 400 ms loop against the chain adapter (mock for Practice, live for Live).
import { loadModel } from '@/engine';
import { patchRun, runStore } from '@/app/state';
import { startFakeRun, stopFakeRun } from '@/app/fixtures/fakeRun';
import type { Hex } from 'viem';
import type { BankLevel, PreflightReport, ReplayFile, RumorCard, RunMode } from '@/types';

let initialised = false;

export const controller = {
  init(): void {
    if (initialised) return;
    initialised = true;
    patchRun({ model: loadModel() });
  },

  selectLevel(level: BankLevel): void {
    const v = runStore.getState();
    if (v.phase === 'running' || v.phase === 'starting') return;
    if (v.phase === 'failed' || v.phase === 'survived') this.reset();
    patchRun({ level });
  },

  selectCard(card: RumorCard): void {
    const v = runStore.getState();
    if (v.phase !== 'idle') return;
    patchRun({ card });
  },

  start(): void {
    const v = runStore.getState();
    if (v.phase !== 'idle') return; // idempotent
    startFakeRun({ level: v.level });
  },

  reset(): void {
    stopFakeRun();
    const v = runStore.getState();
    patchRun({
      phase: 'idle', frame: null, outcome: null, seals: [], sealedTick: 0, health: 'idle', startedAtMs: null,
      elapsedMs: 0, error: null, mirror: { matched: 0, total: 0, firstMismatchTick: null }, decisions: null,
      card: v.card,
    });
  },

  retry(): void {},
  dismissError(): void { patchRun({ error: null }); },

  setMode(mode: RunMode, opts?: { replayId?: string }): void {
    const v = runStore.getState();
    const replayId = opts?.replayId ?? null;
    if (v.mode === mode && (v.replay?.id ?? null) === replayId) return; // idempotent
    patchRun({ mode });
  },

  async connectOperator(_keys: { primary: Hex; backup?: Hex | null; rpcOverride?: string | null }): Promise<void> {},
  disconnectOperator(): void {},
  switchToBackupKey(): void {},
  async runPreflight(): Promise<PreflightReport> {
    return { checks: [], ok: false, at: Date.now() };
  },
  async fundBank(): Promise<void> {},
  async ping(): Promise<void> {},
  saveReplay(): ReplayFile | null { return null; },
};
