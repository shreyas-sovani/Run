// Public store barrel (PRD §16.4). Everything the UI may import from the app layer.
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { controller } from '@/app/controller';
import { patchUi, persistMuted, runStore, uiStore } from '@/app/state';
import { startFakeRun as startFakeRunImpl } from '@/app/fixtures/fakeRun';
import { sfx } from '@/ui/brand';
import type { BankLevel, PreflightReport, ReplayFile, RumorCard, RunMode, RunView, UiState } from '@/types';
import type { Hex } from 'viem';

export function useRunView<T>(selector: (v: RunView) => T): T {
  return useStore(runStore, useShallow(selector));
}

export function useUi<T>(selector: (u: UiState) => T): T {
  return useStore(uiStore, useShallow(selector));
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
  { key: 'Shift+O', label: 'Ops page' },
  { key: 'Shift+R', label: 'Play the latest recorded run' },
];

export function startFakeRun(opts?: { level?: BankLevel; outcome?: 'failed' | 'survived' }): () => void {
  return startFakeRunImpl(opts);
}
