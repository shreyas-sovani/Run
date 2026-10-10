// The top bar (D-03): wordmark, bank selector, rumor chits, the one primary action, run clock, mode + health chips.
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { getRunView, runActions, useRunView } from '@/app/store';
import { Button, ModeChip } from '@/ui/brand';
import { fmtBlock, fmtClock } from '@/ui/format';
import type { BankLevel, RumorCard, RunPhase } from '@/types';
import { S, splitEmphasis } from './stageCopy';
import styles from './TopBar.module.css';

const LEVELS: readonly BankLevel[] = [0, 1];
const CARDS: readonly RumorCard[] = [0, 1, 2, 3];
const HOTKEY_LEVEL = ['1', '2'] as const;

const SETTLED: readonly RunPhase[] = ['idle', 'failed', 'survived'];

function useControlsLocked(): boolean {
  return useRunView((v) => v.mode === 'replay' || v.mode === 'spectate' || !SETTLED.includes(v.phase));
}

function BankSelector() {
  const level = useRunView((v) => v.level);
  const phase = useRunView((v) => v.phase);
  const locked = useControlsLocked();
  const settled = phase === 'failed' || phase === 'survived';
  return (
    <div role="group" aria-label={S.bankGroup()} className={styles.banks}>
      {LEVELS.map((l) => {
        const selected = level === l;
        return (
          <button
            key={l}
            type="button"
            className={styles.bank}
            aria-pressed={selected}
            disabled={locked}
            onClick={() => runActions.selectLevel(l)}
          >
            <kbd className={styles.key}>{HOTKEY_LEVEL[l]}</kbd>
            <span className={styles.bankText}>
              <span className={styles.bankName}>{S.bankName(l)}</span>
              <span className={styles.bankTag}>{settled && !selected ? S.bankSwitchTag(l) : S.bankTag(l)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RumorChits() {
  const card = useRunView((v) => v.card);
  const locked = useControlsLocked();
  return (
    <div role="group" aria-label={S.rumorGroup()} className={styles.chits}>
      {CARDS.map((c) => {
        const selected = card === c;
        return (
          <button
            key={c}
            type="button"
            className={styles.chit}
            aria-pressed={selected}
            disabled={locked}
            onClick={() => runActions.selectCard(c)}
          >
            <kbd className={styles.key}>{S.cardKey(c)}</kbd>
            <span className={styles.chitText}>
              {splitEmphasis(S.cardText(c)).map((seg, i) =>
                seg.em ? (
                  <em key={i} className={styles.em}>
                    {seg.text}
                  </em>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PrimaryAction() {
  const phase = useRunView((v) => v.phase);
  const mode = useRunView((v) => v.mode);
  const hasCard = useRunView((v) => v.card !== null);
  const canBackup = useRunView((v) => v.operator.backupAddress !== null && !v.operator.usingBackup);

  if (mode === 'replay' || mode === 'spectate') return <div className={styles.actionSlot} />;
  switch (phase) {
    case 'idle':
      return (
        <div className={styles.actionSlot}>
          {hasCard ? (
            <Button kind="primary" hotkey={S.key.start} onClick={() => runActions.start()}>
              {S.btn.start()}
            </Button>
          ) : (
            <Button kind="secondary" disabled onClick={() => {}}>
              {S.btn.pickRumor()}
            </Button>
          )}
        </div>
      );
    case 'switching':
      return (
        <div className={styles.actionSlot}>
          <Button pending pendingLabel={S.btn.switching()} onClick={() => {}}>
            {S.btn.switching()}
          </Button>
        </div>
      );
    case 'starting':
      return (
        <div className={styles.actionSlot}>
          <Button pending pendingLabel={S.btn.starting()} onClick={() => {}}>
            {S.btn.starting()}
          </Button>
        </div>
      );
    case 'running':
      return <div className={styles.actionSlot} />;
    case 'failing':
    case 'surviving':
      return (
        <div className={styles.actionSlot}>
          <Button pending pendingLabel={S.btn.verdict()} onClick={() => {}}>
            {S.btn.verdict()}
          </Button>
        </div>
      );
    case 'failed':
    case 'survived':
      return (
        <div className={styles.actionSlot}>
          <Button kind="primary" hotkey={S.key.reset} onClick={() => runActions.reset()}>
            {S.btn.reset()}
          </Button>
        </div>
      );
    case 'resetting':
      return (
        <div className={styles.actionSlot}>
          <Button pending pendingLabel={S.btn.resetting()} onClick={() => {}}>
            {S.btn.resetting()}
          </Button>
        </div>
      );
    case 'paused':
      return (
        <div className={styles.actionSlot}>
          <Button kind="primary" onClick={() => runActions.retry()}>
            {S.btn.retry()}
          </Button>
          {canBackup ? (
            <Button kind="secondary" onClick={() => runActions.switchToBackupKey()}>
              {S.btn.backup()}
            </Button>
          ) : null}
          <Button kind="secondary" onClick={() => runActions.setMode('replay')}>
            {S.btn.recorded()}
          </Button>
          <Button kind="secondary" onClick={() => runActions.reset()}>
            {S.btn.reset()}
          </Button>
        </div>
      );
  }
}

/** The clock is written straight to the DOM from rAF: no React re-render at 60 Hz. */
function RunClock() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const loop = () => {
      const v = getRunView();
      const live = v.phase === 'running' || v.phase === 'failing' || v.phase === 'surviving';
      const ms = v.outcome?.wallMs ?? (live && v.startedAtMs !== null ? Date.now() - v.startedAtMs : v.elapsedMs);
      const text = fmtClock(Math.max(0, ms));
      if (text !== last && ref.current) {
        ref.current.textContent = text;
        last = text;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={ref} className={styles.timer} role="timer" aria-label={S.timerLabel()} />;
}

function BlockLine() {
  const block = useRunView((v) => v.blockNumber);
  return (
    <span className={styles.block}>
      {S.blockLabel()} {block !== null ? fmtBlock(block) : S.blockNone()}
    </span>
  );
}

function Chips() {
  const mode = useRunView((v) => v.mode);
  const replayName = useRunView((v) => v.replay?.name);
  return (
    <div className={styles.chips}>
      <ModeChip mode={mode} replayName={replayName} />
    </div>
  );
}

export function ErrorStrip() {
  const error = useRunView((v) => v.error);
  const [, navigate] = useLocation();
  if (!error) return null;
  const run = () => {
    if (!error.action) return;
    switch (error.action.run) {
      case 'retry':
        return runActions.retry();
      case 'reset':
        return runActions.reset();
      case 'replay':
        return runActions.setMode('replay');
      case 'ops':
        return navigate('/ops');
      case 'backup':
        return runActions.switchToBackupKey();
    }
  };
  return (
    <div role="alert" className={styles.error}>
      <div className={styles.errorText}>
        <strong>{error.title}</strong> <span>{error.detail}</span>
      </div>
      <div className={styles.errorActions}>
        {error.action ? (
          <Button kind="primary" onClick={run}>
            {error.action.label || S.errorAction(error.action.run)}
          </Button>
        ) : null}
        <Button kind="secondary" onClick={() => runActions.dismissError()}>
          {S.btn.dismiss()}
        </Button>
      </div>
    </div>
  );
}

export function TopBar() {
  return (
    <header className={styles.bar}>
      <div className={styles.rowTop}>
        <h1 className={styles.mark}>{S.wordmark()}</h1>
        <BankSelector />
        <div className={styles.meta}>
          <Chips />
          <div className={styles.clock}>
            <RunClock />
            <BlockLine />
          </div>
        </div>
      </div>
      <div className={styles.rowBottom}>
        <RumorChits />
        <PrimaryAction />
      </div>
    </header>
  );
}
