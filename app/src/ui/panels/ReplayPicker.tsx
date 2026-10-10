import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { PATHS } from '@/app/store';
import { listReplays } from '@/chain';
import { Button, ModeChip, PaperBackground } from '@/ui/brand';
import { copy } from '@/ui/copy';
import { fmtRecorded } from '@/ui/format';
import { sortReplays } from './replayModel';
import type { ReplayListState } from './replayModel';
import s from './ReplayPicker.module.css';


/** The picker body. Pure on its props, so `/lab/panels` can show loading, empty, error and full states. */
export function ReplayPickerView(props: { state: ReplayListState; onPlay(id: string): void; onRetry(): void; onPractice(): void; onFollow(): void }) {
  const { state } = props;
  return (
    <main className={s.main}>
      <header className={s.head}>
        <h1 className={s.wordmark}>{copy.brand.name}</h1>
        <div>
          <h2 className={s.title}>{copy.replays.title}</h2>
          <p className={s.lead}>{copy.replays.lead}</p>
        </div>
      </header>

      <div className={s.chip}>
        <ModeChip mode="replay" />
      </div>

      {state.status === 'loading' ? (
        <p className={s.status} role="status">
          {copy.replays.loading}
        </p>
      ) : state.status === 'error' ? (
        <div className={s.empty} role="alert">
          <p>{copy.replays.loadError}</p>
          <Button onClick={props.onRetry}>{copy.replays.retry}</Button>
        </div>
      ) : state.entries.length === 0 ? (
        <div className={s.empty}>
          <p className={s.emptyTitle}>{copy.replays.empty}</p>
          <p>{copy.replays.emptyHint}</p>
          <div className={s.emptyActions}>
            <Button onClick={props.onPractice}>{copy.replays.practice}</Button>
            <Button kind="secondary" onClick={props.onFollow}>
              {copy.replays.follow}
            </Button>
          </div>
        </div>
      ) : (
        <ul className={s.list}>
          {sortReplays(state.entries).map((e) => {
            const when = fmtRecorded(e.recordedAt);
            return (
              <li key={e.id} className={s.item}>
                <div className={s.itemText}>
                  <span className={s.bank}>{copy.banks[e.level].name}</span>
                  <span className={`${s.outcome} ${e.kind === 'failed' ? s.failed : s.survived}`}>
                    <span className={s.glyph} aria-hidden="true">
                      {e.kind === 'failed' ? '✕' : '✓'}
                    </span>
                    {e.kind === 'failed' ? copy.replays.failed : copy.replays.survived}
                  </span>
                  <span className={s.name}>{e.name}</span>
                  {when ? <span className={`${s.when} tnum`}>{copy.replays.recorded(when)}</span> : null}
                </div>
                <Button onClick={() => props.onPlay(e.id)} title={`${copy.replays.play}: ${e.name}`}>
                  {copy.replays.play}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

/** `/replay`: pick a recorded run. */
export function ReplayPicker() {
  const [state, setState] = useState<ReplayListState>({ status: 'loading' });
  const [, navigate] = useLocation();

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    listReplays().then(
      (entries) => live && setState({ status: 'ready', entries }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <div className={s.page}>
      <PaperBackground />
      <ReplayPickerView
        state={state}
        onPlay={(id) => navigate(PATHS.replay(id))}
        onRetry={() => {
          setState({ status: 'loading' });
          setAttempt((n) => n + 1);
        }}
        onPractice={() => navigate(PATHS.app)}
        onFollow={() => navigate(PATHS.watch)}
      />
    </div>
  );
}
