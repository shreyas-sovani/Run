// /lab/panels: proof panel, ops page, replay picker and banners against fixtures (all-pass, mixed, all-fail).
// The last tab drives the real store with F's fake run so the connected components can be seen too.
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { startFakeRun, uiActions, useUi } from '@/app/store';
import type { PreflightReport, RunView } from '@/types';
import { Button, PaperBackground } from '@/ui/brand';
import { copy } from '@/ui/copy';
import { ModeBanner, ModeBannerView } from './ModeBanner';
import { OpsView } from './OpsView';
import { ProofContent, ProofPanel } from './ProofPanel';
import type { ProofData } from './ProofPanel';
import { ReplayPickerView } from './ReplayPicker';
import type { ReplayListState } from './replayModel';
import * as fx from './fixtures';
import ps from './ProofPanel.module.css';
import s from './PanelsLab.module.css';

type Tab = 'proof' | 'ops' | 'replays' | 'banners' | 'connected';
const TABS: { id: Tab; label: string }[] = [
  { id: 'proof', label: 'Proof panel' },
  { id: 'ops', label: 'Ops page' },
  { id: 'replays', label: 'Replay picker' },
  { id: 'banners', label: 'Banners' },
  { id: 'connected', label: 'Connected (store)' },
];

const PROOFS: { id: string; label: string; data: ProofData }[] = [
  { id: 'live', label: 'Live, failed, agree', data: fx.liveProof },
  { id: 'mismatch', label: 'Live, mismatch', data: fx.liveMismatchProof },
  { id: 'idle', label: 'Live, idle', data: fx.liveIdleProof },
  { id: 'recorded', label: 'Recorded', data: fx.recordedProof },
  { id: 'practice', label: 'Practice, after a run', data: fx.practiceProof },
  { id: 'practice-idle', label: 'Practice, idle', data: fx.practiceIdleProof },
];

type OpsFixture = 'none' | 'pass' | 'mixed' | 'fail';
const REPLAY_STATES: { id: string; label: string; state: ReplayListState }[] = [
  { id: 'full', label: 'Three runs', state: { status: 'ready', entries: fx.replayEntries } },
  { id: 'empty', label: 'Empty', state: { status: 'ready', entries: [] } },
  { id: 'loading', label: 'Loading', state: { status: 'loading' } },
  { id: 'error', label: 'Error', state: { status: 'error' } },
];

export function PanelsLab() {
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return TABS.some((x) => x.id === t) ? (t as Tab) : 'proof';
  });
  return (
    <div className={s.page}>
      <PaperBackground />
      <header className={s.head}>
        <h1 className={s.wordmark}>{copy.brand.name}</h1>
        <p className={s.lead}>{copy.labs.panels}</p>
        <Link href="/lab/brand">/lab/brand</Link>
      </header>
      <div className={s.tabs} role="tablist" aria-label={copy.labs.panels}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={s.tab} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'proof' ? <ProofTab /> : null}
      {tab === 'ops' ? <OpsTab /> : null}
      {tab === 'replays' ? <ReplayTab /> : null}
      {tab === 'banners' ? <BannerTab /> : null}
      {tab === 'connected' ? <ConnectedTab /> : null}
    </div>
  );
}

function Pick<T extends string>(props: { value: T; options: { id: T; label: string }[]; onChange(v: T): void; name: string }) {
  return (
    <div className={s.picks} role="group" aria-label={props.name}>
      {props.options.map((o) => (
        <Button key={o.id} kind={o.id === props.value ? 'primary' : 'secondary'} onClick={() => props.onChange(o.id)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function ProofTab() {
  const [id, setId] = useState(PROOFS[0].id);
  const cur = PROOFS.find((p) => p.id === id) ?? PROOFS[0];
  return (
    <section>
      <Pick name="Proof fixture" value={id} options={PROOFS} onChange={setId} />
      <div className={s.proofFrame}>
        <div className={ps.head}>
          <div>
            <h2 className={ps.title}>{copy.proof.title}</h2>
            <p className={ps.sub}>{copy.proof.subtitle}</p>
          </div>
        </div>
        <ProofContent data={cur.data} onWatchRecorded={() => {}} />
      </div>
    </section>
  );
}

function OpsTab() {
  const [fixture, setFixture] = useState<OpsFixture>('mixed');
  const [pending, setPending] = useState<RunView['pending']>({ switching: false, starting: false, resetting: false, funding: false, pinging: false, preflight: false });
  const [loaded, setLoaded] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const timers = useRef<number[]>([]);

  const note = (m: string) => setLog((l) => [m, ...l].slice(0, 6));
  const fake = (key: keyof RunView['pending'], label: string) => {
    note(`${label} (pending)`);
    setPending((p) => ({ ...p, [key]: true }));
    timers.current.push(
      window.setTimeout(() => {
        setPending((p) => ({ ...p, [key]: false }));
        note(`${label} (done)`);
      }, 1800),
    );
  };

  const report: PreflightReport | null =
    fixture === 'pass' ? fx.preflightAllPass : fixture === 'mixed' ? fx.preflightMixed : fixture === 'fail' ? fx.preflightAllFail : null;
  const noKey = fixture === 'none' || fixture === 'fail' || !loaded;

  return (
    <section>
      <Pick
        name="Preflight fixture"
        value={fixture}
        options={[
          { id: 'none', label: 'No key, no checks' },
          { id: 'fail', label: 'All fail' },
          { id: 'mixed', label: 'Mixed' },
          { id: 'pass', label: 'All pass' },
        ]}
        onChange={(v) => {
          setFixture(v);
          setLoaded(v !== 'none' && v !== 'fail');
        }}
      />
      <p className={s.log} aria-live="polite">
        {log.length ? log.join(' · ') : 'Click anything: the lab fakes every action with a 1.8 s pending state.'}
      </p>
      <div className={s.frame}>
        <OpsView
          operator={noKey ? { address: null, balanceWei: null, backupAddress: null, usingBackup: false } : fx.fixOperator}
          preflight={report}
          pending={pending}
          deployment={fx.fixDeployed}
          error={fixture === 'fail' ? { code: 'allDown', title: copy.errors.AllRpcsDown.title, detail: copy.errors.AllRpcsDown.body, action: null } : null}
          keySource="session"
          buildId="a1b2c3d-2026-10-10T08:40:00.000Z"
          onLoadKeys={() =>
            new Promise<void>((done) => {
              note('Load keys (pending)');
              timers.current.push(
                window.setTimeout(() => {
                  setLoaded(true);
                  setFixture((f) => (f === 'none' || f === 'fail' ? 'mixed' : f));
                  note('Load keys (done)');
                  done();
                }, 1500),
              );
            })
          }
          onReconnectRpc={() => new Promise<void>((done) => window.setTimeout(done, 1200))}
          onForget={() => {
            setLoaded(false);
            note('Forget keys');
          }}
          onRecheck={() => fake('preflight', 'Run checks')}
          onFund={() => fake('funding', 'Fund the bank')}
          onPing={() => fake('pinging', 'Test transaction')}
          onReset={() => fake('resetting', 'Reset the bank')}
          onSave={() => {
            note('Save replay');
            return fixture === 'pass' ? 'saved' : 'none';
          }}
          onGoStage={() => note('Go to stage')}
          onDismissError={() => note('Dismiss error')}
        />
      </div>
    </section>
  );
}

function ReplayTab() {
  const [id, setId] = useState(REPLAY_STATES[0].id);
  const cur = REPLAY_STATES.find((r) => r.id === id) ?? REPLAY_STATES[0];
  return (
    <section>
      <Pick name="Replay list state" value={id} options={REPLAY_STATES} onChange={setId} />
      <div className={s.frame}>
        <ReplayPickerView state={cur.state} onPlay={() => {}} onRetry={() => {}} onPractice={() => {}} onFollow={() => {}} />
      </div>
    </section>
  );
}

function BannerTab() {
  const noop = () => {};
  const base = { onWatchRecorded: noop, onFollowLive: noop, onAllRecorded: noop, onPractice: noop };
  return (
    <section className={s.banners}>
      <ModeBannerView mode="practice" replay={null} {...base} onDismiss={noop} />
      <ModeBannerView mode="replay" replay={{ name: 'Monad Mutual survives', recordedAt: '2026-10-10T14:12:00+05:30' }} {...base} onDismiss={noop} />
      <ModeBannerView mode="replay" replay={null} {...base} onDismiss={noop} />
      <ModeBannerView mode="spectate" replay={null} {...base} onDismiss={noop} />
      <p className={s.log}>Phone layout (no dismiss button):</p>
      <div className={s.phone}>
        <ModeBannerView mode="practice" replay={null} {...base} />
      </div>
    </section>
  );
}

function ConnectedTab() {
  const proofOpen = useUi((u) => u.proofOpen);
  return (
    <section className={s.connected}>
      <ModeBanner />
      <p className={s.log}>
        The real, store-connected ModeBanner (above) and ProofPanel (slides in from the right), driven by F’s fake run.
      </p>
      <div className={s.picks}>
        <Button onClick={() => startFakeRun({ outcome: 'failed' })}>Fake run: Bhau’s fails</Button>
        <Button onClick={() => startFakeRun({ outcome: 'survived' })}>Fake run: Mutual survives</Button>
        <Button kind="secondary" onClick={() => uiActions.toggleProof()}>
          {proofOpen ? 'Close proof panel' : 'Open proof panel'}
        </Button>
      </div>
      <ProofPanel open={proofOpen} onClose={() => uiActions.toggleProof(false)} />
    </section>
  );
}
