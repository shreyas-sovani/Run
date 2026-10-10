// Zustand stores for RunView and UiState. No controller import here (the controller and
// store.ts both depend on this file, so it must stay leaf-like to avoid import cycles).
import { create } from 'zustand';
import { addressOfKey, deployment, loadOperatorKeys } from '@/chain';
import type { RunView, UiState } from '@/types';

const MUTE_KEY = 'run.muted';

function initialOperator(): RunView['operator'] {
  const keys = loadOperatorKeys();
  let address: RunView['operator']['address'] = null;
  let backupAddress: RunView['operator']['backupAddress'] = null;
  try {
    if (keys.primary) address = addressOfKey(keys.primary);
    if (keys.backup) backupAddress = addressOfKey(keys.backup);
  } catch {
    // invalid key material: treat as not loaded (never log it)
  }
  return { address, balanceWei: null, backupAddress, usingBackup: false };
}

export function initialRunView(): RunView {
  return {
    mode: 'practice',
    phase: 'idle',
    level: 0,
    card: null,
    model: null,
    frame: null,
    sealedTick: 0,
    seals: [],
    health: 'idle',
    startedAtMs: null,
    elapsedMs: 0,
    blockNumber: null,
    finalizedBlock: null,
    outcome: null,
    onchain: null,
    preflight: null,
    pending: { switching: false, starting: false, resetting: false, funding: false, pinging: false, preflight: false },
    error: null,
    mirror: { matched: 0, total: 0, firstMismatchTick: null },
    decisions: null,
    replay: null,
    operator: initialOperator(),
    deployment: {
      runBank: deployment.runBank,
      street: deployment.street,
      ausd: deployment.ausd,
      deployed: deployment.runBank !== null,
    },
  };
}

function initialUi(): UiState {
  const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  let muted = false;
  try {
    muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }
  return { proofOpen: false, passbookOpen: false, helpOpen: false, muted, reducedMotion };
}

export const runStore = create<RunView>()(() => initialRunView());
export const uiStore = create<UiState>()(() => initialUi());

export function patchRun(patch: Partial<RunView> | ((v: RunView) => Partial<RunView>)): void {
  runStore.setState(patch);
}

export function patchPending(p: Partial<RunView['pending']>): void {
  runStore.setState((v) => ({ pending: { ...v.pending, ...p } }));
}

export function patchUi(patch: Partial<UiState> | ((u: UiState) => Partial<UiState>)): void {
  uiStore.setState(patch);
}

export function persistMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage unavailable: mute still applies for this session
  }
}
