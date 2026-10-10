// Public store barrel (PRD §16.4). Everything the UI may import from the app layer.
import { useRef } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';
import { controller } from '@/app/controller';
import { patchUi, persistMuted, runStore, uiStore } from '@/app/state';
import { startFakeRun as startFakeRunImpl } from '@/app/fixtures/fakeRun';
import { sfx } from '@/ui/brand';
import { fontsLoaded } from '@/ui/theme/fonts';
import type { BankLevel, PreflightCheck, PreflightReport, ReplayFile, RumorCard, RunMode, RunView, UiState } from '@/types';
import type { Hex } from 'viem';

export { PATHS, isStageRoute, navSectionOf } from '@/app/paths';
export type { NavSection } from '@/app/paths';

// Equality for selector results: Object.is, then shallow (plain objects / arrays), then one level deeper for plain
// objects. The extra level means a selector like `({ seals: v.seals, practice: { tick, loss } })` can't loop forever
// ("getSnapshot should be cached") just because it builds a small nested object each call.
function isPlain(x: unknown): x is Record<string, unknown> {
  if (x === null || typeof x !== 'object') return false;
  if (Array.isArray(x)) return true;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

function shallowEq(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isPlain(a) || !isPlain(b) || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is(a[k], b[k]));
}

export function selectorEqual(a: unknown, b: unknown): boolean {
  if (shallowEq(a, b)) return true;
  if (!isPlain(a) || !isPlain(b) || Array.isArray(a) || Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && shallowEq(a[k], b[k]));
}

function useStable<S, T>(store: StoreApi<S>, selector: (s: S) => T): T {
  const prev = useRef<{ v: T } | null>(null);
  return useStore(store, (s: S) => {
    const next = selector(s);
    if (prev.current !== null && selectorEqual(prev.current.v, next)) return prev.current.v;
    prev.current = { v: next };
    return next;
  });
}

export function useRunView<T>(selector: (v: RunView) => T): T {
  return useStable(runStore, selector);
}

export function useUi<T>(selector: (u: UiState) => T): T {
  return useStable(uiStore, selector);
}

export function getRunView(): RunView {
  return runStore.getState();
}

export function subscribeRunView(cb: (v: RunView) => void): () => void {
  return runStore.subscribe((state) => cb(state));
}

export const runActions = {
  selectLevel(level: BankLevel): void { controller.selectLevel(level); },
  selectCard(card: RumorCard): void { controller.selectCard(card); },
  selectSeed(node: number | null): void { controller.selectSeed(node); },
  start(): void { controller.start(); },
  reset(): void { controller.reset(); },
  retry(): void { controller.retry(); },
  dismissError(): void { controller.dismissError(); },
  setMode(mode: RunMode, opts?: { replayId?: string; auto?: boolean }): void { controller.setMode(mode, opts); },
  connectOperator(keys: { primary: Hex; backup?: Hex | null; rpcOverride?: string | null }): Promise<void> {
    return controller.connectOperator(keys);
  },
  disconnectOperator(): void { controller.disconnectOperator(); },
  switchToBackupKey(): void { controller.switchToBackupKey(); },
  runPreflight(): Promise<PreflightReport> { return controller.runPreflight(); },
  fundBank(): Promise<void> { return controller.fundBank(); },
  ping(): Promise<void> { return controller.ping(); },
  saveReplay(): ReplayFile | null { return controller.saveReplay(); },
};

export const uiActions = {
  toggleProof(open?: boolean): void { patchUi((u) => ({ proofOpen: open ?? !u.proofOpen })); },
  togglePassbook(open?: boolean): void { patchUi((u) => ({ passbookOpen: open ?? !u.passbookOpen })); },
  toggleHelp(open?: boolean): void { patchUi((u) => ({ helpOpen: open ?? !u.helpOpen })); },
  toggleMute(): void {
    const muted = !uiStore.getState().muted;
    patchUi({ muted });
    persistMuted(muted);
    sfx.setMuted(muted);
  },
};

export const HOTKEYS: { key: string; label: string }[] = [
  { key: '1 / 2', label: "Bhau's Bank / Monad Mutual (resets first if needed)" },
  { key: 'Q W E R', label: 'Pick a rumor card' },
  { key: 'Enter', label: 'Start the run' },
  { key: 'P', label: 'Proof panel' },
  { key: 'C', label: 'Comparison passbook' },
  { key: 'X', label: 'Reset the bank' },
  { key: 'F', label: 'Full screen' },
  { key: 'M', label: 'Mute' },
  { key: 'H or ?', label: 'Help' },
  { key: 'Esc', label: 'Close overlay' },
  { key: 'L', label: 'Closing card (QR to the live link)' },
  { key: 'Shift+O', label: 'Ops page' },
  { key: 'Shift+R', label: 'Play the latest recorded run' },
];

export function startFakeRun(opts?: { level?: BankLevel; outcome?: 'failed' | 'survived' }): () => void {
  return startFakeRunImpl(opts);
}

// PRD §12.5 environment rows. Browser-only (needs fonts, audio and the window), so they are registered here, not in the
// controller. All non-critical: they never change `report.ok`.
export function environmentChecks(): PreflightCheck[] {
  const fonts = fontsLoaded();
  const unlocked = sfx.isUnlocked();
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  const bigEnough = w >= 1280 && h >= 720;
  return [
    {
      id: 'fonts',
      label: 'Fonts loaded',
      status: fonts ? 'pass' : 'fail',
      detail: fonts ? 'Self-hosted faces are ready' : 'The stage fonts have not loaded yet; reload the page',
      critical: false,
    },
    {
      id: 'audio',
      label: 'Audio unlocked',
      status: unlocked ? 'pass' : 'warn',
      detail: unlocked ? 'Sound is on' : 'Press any key once so the browser allows sound',
      critical: false,
    },
    {
      id: 'window',
      label: 'Window at least 1280×720',
      status: bigEnough ? 'pass' : 'fail',
      detail: `${w}×${h}${bigEnough ? '' : ': enlarge the window or press F for full screen'}`,
      critical: false,
    },
  ];
}
controller.setEnvChecks(environmentChecks);
