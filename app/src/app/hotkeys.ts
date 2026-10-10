// Global hotkeys (PRD §13.4). One keydown listener, registered once (module-level guard), so
// StrictMode double effects or HMR can't double-register.
import { navigate } from 'wouter/use-browser-location';
import { PATHS, isStageRoute } from '@/app/paths';
import { runActions, uiActions } from '@/app/store';
import { sfx } from '@/ui/brand';

let installed = false;

function typingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (typingTarget(e.target)) return;
  void sfx.unlock();
  if (!isStageRoute(window.location.pathname)) return;
  const key = e.key;
  if (key === '?') { uiActions.toggleHelp(); e.preventDefault(); return; }
  if (key === 'Escape') {
    uiActions.toggleProof(false);
    uiActions.togglePassbook(false);
    uiActions.toggleHelp(false);
    return;
  }
  if (key === 'Enter') {
    if (e.repeat) return;
    runActions.start();
    return;
  }
  const lower = key.toLowerCase();
  if (e.shiftKey) {
    if (lower === 'o') { navigate(PATHS.ops); e.preventDefault(); }
    else if (lower === 'r') { runActions.setMode('replay'); e.preventDefault(); }
    return;
  }
  switch (lower) {
    case '1': runActions.selectLevel(0); break;
    case '2': runActions.selectLevel(1); break;
    case 'q': runActions.selectCard(0); break;
    case 'w': runActions.selectCard(1); break;
    case 'e': runActions.selectCard(2); break;
    case 'r': runActions.selectCard(3); break;
    case 'p': uiActions.toggleProof(); break;
    case 'c': uiActions.togglePassbook(); break;
    case 'x': runActions.reset(); break;
    case 'f': toggleFullscreen(); break;
    case 'm': uiActions.toggleMute(); break;
    case 'h': uiActions.toggleHelp(); break;
    default: return;
  }
  e.preventDefault();
}

export function installHotkeys(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', onKeyDown);
}
