// /lab/stage (D-00): a sandbox for the stage. Dev tooling, so its button labels are not part of the copy deck.
// Reads and forces store state through `@/app/state` (F's leaf module) because the public store has no
// "force phase" action; this file is the only place in the stage that does.
import { useEffect, useMemo, useState } from 'react';
import { patchRun, runStore } from '@/app/state';
import { runActions, startFakeRun, uiActions } from '@/app/store';
import { PaperBackground } from '@/ui/brand';
import type { Outcome, RunMode, RunPhase, UiError } from '@/types';
import { StageScreen } from './StageScreen';
import styles from './StageLab.module.css';

const PRESETS = [
  { id: 'window', label: 'Window', w: 0, h: 0 },
  { id: 'hd', label: '1280×720', w: 1280, h: 720 },
  { id: 'fhd', label: '1920×1080', w: 1920, h: 1080 },
  { id: 'phone', label: '375×812', w: 375, h: 812 },
] as const;

const PHASES: RunPhase[] = ['idle', 'switching', 'starting', 'running', 'failing', 'surviving', 'failed', 'survived', 'resetting', 'paused'];
const MODES: RunMode[] = ['practice', 'live', 'replay', 'spectate'];

const SCENARIOS = ['fail', 'survive', 'idle', 'failed', 'survived', 'verdict', 'error', 'passbook', 'help'] as const;
type Scenario = (typeof SCENARIOS)[number];

const FIXTURE_ERROR: UiError = {
  code: 'lab',
  title: 'Sealing paused',
  detail: 'Lab fixture: the seal queue stopped after an error.',
  action: { label: 'Retry sealing', run: 'retry' },
};

function fixtureOutcome(kind: 'failed' | 'survived', sealed: boolean): Outcome {
  const v = runStore.getState();
  const bank = v.frame?.bank;
  return {
    kind,
    tick: bank?.tick ?? 13,
    wallMs: 5400,
    blocks: 13,
    rumorBlock: 21_483_200n,
    outcomeBlock: 21_483_213n,
    trappedCount: 41,
    trappedAmount: 1_200_000_000n,
    uninsuredTrapped: 900_000_000n,
    withdrawnAmount: bank ? bank.deposits0 - bank.depositsOwed : 7_100_000_000n,
    sealed,
  };
}

let stopFake: (() => void) | null = null;

function applyScenario(s: Scenario): void {
  stopFake?.();
  stopFake = null;
  uiActions.togglePassbook(false);
  uiActions.toggleHelp(false);
  const base = { error: null, outcome: null } as const;
  switch (s) {
    case 'fail':
      stopFake = startFakeRun({ outcome: 'failed' });
      break;
    case 'survive':
      stopFake = startFakeRun({ outcome: 'survived' });
      break;
    case 'idle':
      patchRun({ ...base, phase: 'idle', frame: null, seals: [], startedAtMs: null, elapsedMs: 0, card: 1 });
      break;
    case 'failed':
    case 'survived':
      patchRun({ phase: s, outcome: fixtureOutcome(s, false) });
      break;
    case 'verdict':
      patchRun({ ...base, phase: 'failing' });
      break;
    case 'error':
      patchRun({ phase: 'paused', health: 'paused', error: FIXTURE_ERROR });
      break;
    case 'passbook':
      patchRun({ phase: 'failed', outcome: fixtureOutcome('failed', false) });
      uiActions.togglePassbook(true);
      break;
    case 'help':
      uiActions.toggleHelp(true);
      break;
  }
}

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

export function StageLab() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const embedded = params.get('embed') === '1';
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['id']>('window');
  const vp = useViewport();

  // In the embedded frame the scenario comes from the URL; it runs once.
  useEffect(() => {
    const sc = params.get('scenario') as Scenario | null;
    if (embedded && sc && SCENARIOS.includes(sc)) applyScenario(sc);
    return () => {
      stopFake?.();
      stopFake = null;
    };
  }, [embedded, params]);

  if (embedded) {
    return (
      <>
        <PaperBackground />
        <StageScreen />
      </>
    );
  }

  const cur = PRESETS.find((p) => p.id === preset)!;
  const scale = cur.w ? Math.min(1, (vp.w - 24) / cur.w, (vp.h - 120) / cur.h) : 1;
  const frameSrc = `${window.location.pathname}?embed=1`;

  return (
    <>
      {cur.w === 0 ? (
        <>
          <PaperBackground />
          <StageScreen />
        </>
      ) : (
        <div className={styles.frameWrap}>
          <div className={styles.frameBox} style={{ width: cur.w * scale, height: cur.h * scale }}>
            <iframe
              title={cur.label}
              src={frameSrc}
              className={styles.frame}
              style={{ width: cur.w, height: cur.h, transform: `scale(${scale})` }}
            />
          </div>
        </div>
      )}

      <aside className={styles.bar} aria-label="Stage lab">
        <div className={styles.group}>
          {PRESETS.map((p) => (
            <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {cur.w === 0 ? (
          <>
            <div className={styles.group}>
              {SCENARIOS.map((s) => (
                <button key={s} type="button" onClick={() => applyScenario(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className={styles.group}>
              {PHASES.map((p) => (
                <button key={p} type="button" onClick={() => patchRun({ phase: p })}>
                  {p}
                </button>
              ))}
            </div>
            <div className={styles.group}>
              {MODES.map((m) => (
                <button key={m} type="button" onClick={() => patchRun({ mode: m })}>
                  {m}
                </button>
              ))}
              <button type="button" onClick={() => runActions.selectLevel(1)}>
                level 1
              </button>
              <button type="button" onClick={() => runActions.selectLevel(0)}>
                level 0
              </button>
            </div>
          </>
        ) : (
          <p className={styles.note}>Frames run their own store. Use window mode to drive state.</p>
        )}
      </aside>
    </>
  );
}
