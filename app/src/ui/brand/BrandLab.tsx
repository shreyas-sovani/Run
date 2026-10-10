// /lab/brand: every brand part against fixtures. No store imports (store → brand would cycle).
import { useEffect, useState } from 'react';
import type { Address as Addr, Hex } from 'viem';
import type { RunMode, SealHealth } from '@/types';
import { copy } from '@/ui/copy';
import { fmtAusdWithUsd } from '@/ui/format';
import { Address, TxLink } from './Refs';
import { Button } from './Button';
import { HealthChip, ModeChip } from './Chips';
import { PaperBackground } from './PaperBackground';
import { Stamp } from './Stamp';
import { sfx } from './sfx';
import s from './BrandLab.module.css';

const FIXTURE_ADDR = '0x5a3f1c0b7d2e4a96b8c3f0e1d7a2b4c69e21d3f7' as Addr;
const FIXTURE_TX = '0xb4e1a07c93d5f2e86a1c4d9b0e7f3a52c8d6e1f4097b2a3c5d8e0f1a2b3c4d5e' as Hex;

const PALETTE: { name: string; token: string; hex: string; ratio: string; use: string }[] = [
  { name: 'Security Mint', token: '--paper', hex: '#E4ECE6', ratio: '—', use: 'page' },
  { name: 'Guilloche', token: '--guilloche', hex: '#C5D5CB', ratio: '1.3', use: 'linework only' },
  { name: 'Ledger Ink', token: '--ink', hex: '#172033', ratio: '13.5', use: 'text' },
  { name: 'Ink 2', token: '--ink-2', hex: '#3F4A5C', ratio: '7.4', use: 'secondary text' },
  { name: 'Ink 3', token: '--ink-3', hex: '#566170', ratio: '5.2', use: 'captions' },
  { name: 'Stamp Violet', token: '--seal', hex: '#5B3FD6', ratio: '5.6', use: 'stamp, primary, sealed' },
  { name: 'Rumor Amber', token: '--rumor', hex: '#B86E00', ratio: '3.3', use: 'graphics only' },
  { name: 'Amber text', token: '--rumor-text', hex: '#8A5200', ratio: '5.3', use: 'small text' },
  { name: 'Run Vermilion', token: '--run', hex: '#C8341C', ratio: '4.4', use: 'large text, graphics' },
  { name: 'Vermilion text', token: '--run-text', hex: '#B02B16', ratio: '5.4', use: 'small text' },
  { name: 'Slate', token: '--trapped', hex: '#7D8A90', ratio: '3.0', use: 'trapped, disabled' },
  { name: 'OK green', token: '--ok', hex: '#1B6B43', ratio: '5.4', use: 'preflight pass' },
];

const TYPE_ROWS: { token: string; font: string; weight: number; sample: string; px: string }[] = [
  { token: '--fs-stamp', font: 'display', weight: 900, sample: 'BANK FAILED', px: '200 px @1080' },
  { token: '--fs-timer', font: 'display', weight: 800, sample: 'T+5.4 s', px: '88 px' },
  { token: '--fs-vault', font: 'display', weight: 800, sample: '4,750 AUSD', px: '56 px' },
  { token: '--fs-card', font: 'body', weight: 700, sample: 'The CEO just bought a yacht.', px: '26 px' },
  { token: '--fs-body', font: 'body', weight: 400, sample: 'The vault is empty. 212 withdrew, 41 trapped.', px: '22 px' },
  { token: '--fs-ticker', font: 'data', weight: 500, sample: 'tick 12–14 · 31 withdrew · sealed 0.71 s ✓', px: '20 px' },
  { token: '--fs-dots', font: 'dots', weight: 700, sample: 'WaMu $19B · 16 days', px: '28 px min' },
];

const MODES: RunMode[] = ['live', 'practice', 'replay', 'spectate'];
const HEALTHS: SealHealth[] = ['idle', 'sealing', 'delayed', 'paused', 'offline'];

export function BrandLab() {
  const [failedPlay, setFailedPlay] = useState(false);
  const [survivedPlay, setSurvivedPlay] = useState(false);
  const [impacts, setImpacts] = useState(0);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [alarm, setAlarm] = useState(false);
  const [crowd, setCrowd] = useState(0);
  const [muted, setMuted] = useState(sfx.isMuted());
  const [unlocked, setUnlocked] = useState(sfx.isUnlocked());

  // `?slam=1` slams both stamps on load (handy for screenshots and for checking the first-paint state).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('slam') !== '1') return;
    const t = window.setTimeout(() => {
      setFailedPlay(true);
      setSurvivedPlay(true);
    }, 400);
    return () => window.clearTimeout(t);
  }, []);

  const fakeAction = (key: string) => {
    setPending((p) => ({ ...p, [key]: true }));
    window.setTimeout(() => setPending((p) => ({ ...p, [key]: false })), 1600);
  };
  const slam = (kind: 'failed' | 'survived') => {
    const set = kind === 'failed' ? setFailedPlay : setSurvivedPlay;
    set(false);
    window.setTimeout(() => set(true), 60);
  };

  return (
    <div className={s.page}>
      <PaperBackground />
      <header className={s.head}>
        <h1 className={s.wordmark}>{copy.brand.name}</h1>
        <p className={s.lead}>{copy.labs.brand}. {copy.brand.tagline}.</p>
      </header>

      <section className={s.section} aria-labelledby="lab-palette">
        <h2 id="lab-palette">Palette and contrast on paper</h2>
        <ul className={s.swatches}>
          {PALETTE.map((p) => (
            <li key={p.token} className={s.swatch}>
              <span className={s.chipColor} style={{ background: `var(${p.token})` }} />
              <span className={s.swName}>{p.name}</span>
              <code>{p.token}</code>
              <span className={s.swMeta}>
                {p.hex} · {p.ratio}:1 · {p.use}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="lab-type">
        <h2 id="lab-type">Type scale (1080p targets; clamp against vmin)</h2>
        <div className={s.typeList}>
          {TYPE_ROWS.map((t) => (
            <div key={t.token} className={s.typeRow}>
              <code className={s.typeTag}>
                {t.token} · {t.px}
              </code>
              <div
                className={s.typeSample}
                style={{ fontFamily: `var(--font-${t.font})`, fontWeight: t.weight, fontSize: `var(${t.token === '--fs-stamp' ? '--fs-timer' : t.token})` }}
              >
                {t.sample}
              </div>
            </div>
          ))}
          <p className={s.note}>The stamp row is shown at the timer size here; the stamp itself is below.</p>
          <p className={s.mar} lang="mr">
            बँक बुडाली
          </p>
        </div>
      </section>

      <section className={s.section} aria-labelledby="lab-buttons">
        <h2 id="lab-buttons">Buttons</h2>
        <div className={s.row}>
          <Button onClick={() => {}}>Start the run</Button>
          <Button onClick={() => {}} hotkey="Enter">
            Start the run
          </Button>
          <Button kind="secondary" onClick={() => {}}>
            Switch to backup key
          </Button>
          <Button disabled onClick={() => {}}>
            Pick a rumor to start the run
          </Button>
          <Button kind="secondary" disabled onClick={() => {}}>
            Disabled
          </Button>
        </div>
        <div className={s.row}>
          <Button pending pendingLabel={copy.buttons.starting} onClick={() => {}}>
            {copy.buttons.start}
          </Button>
          <Button kind="secondary" pending pendingLabel={copy.buttons.resetting} onClick={() => {}}>
            {copy.buttons.reset}
          </Button>
          <Button
            pending={pending.start}
            pendingLabel={copy.buttons.starting}
            onClick={() => fakeAction('start')}
            hotkey="Enter"
          >
            {copy.buttons.start}
          </Button>
          <Button
            kind="secondary"
            pending={pending.reset}
            pendingLabel={copy.buttons.resetting}
            onClick={() => fakeAction('reset')}
            hotkey="X"
          >
            {copy.buttons.reset}
          </Button>
        </div>
        <div className={s.row}>
          <Button size="lg" onClick={() => {}} hotkey="Enter">
            {copy.buttons.start}
          </Button>
          <Button size="lg" pending pendingLabel={copy.phases.failing} onClick={() => {}}>
            {copy.phases.failing}
          </Button>
        </div>
        <p className={s.note}>Each demo button above has its own pending flag; the two live ones release after 1.6 s.</p>
      </section>

      <section className={s.section} aria-labelledby="lab-chips">
        <h2 id="lab-chips">Chips</h2>
        <div className={s.col}>
          {MODES.map((m) => (
            <ModeChip key={m} mode={m} replayName="Bhau's Bank · whales run" recordedAt={m === 'replay' ? '2026-10-10T14:12:00+05:30' : undefined} />
          ))}
        </div>
        <div className={s.row}>
          {HEALTHS.map((h) => (
            <HealthChip key={h} health={h} sealedTick={h === 'idle' ? 0 : 14} blockNumber={h === 'offline' ? null : 21_483_214n} />
          ))}
        </div>
      </section>

      <section className={s.section} aria-labelledby="lab-refs">
        <h2 id="lab-refs">Address and TxLink</h2>
        <div className={s.row}>
          <Address address={FIXTURE_ADDR} />
          <Address address={FIXTURE_ADDR} label="RunBank" />
          <TxLink hash={FIXTURE_TX} />
          <TxLink hash={FIXTURE_TX} label="Rumor" />
        </div>
        <p className={s.note}>Value context: {fmtAusdWithUsd(1_500_000_000n)} at {copy.scale.note}</p>
      </section>

      <section className={s.section} aria-labelledby="lab-stamps">
        <h2 id="lab-stamps">Stamps</h2>
        <div className={s.row}>
          <Button onClick={() => slam('failed')}>Slam “failed”</Button>
          <Button onClick={() => slam('survived')}>Slam “survived”</Button>
          <Button
            kind="secondary"
            onClick={() => {
              setFailedPlay(false);
              setSurvivedPlay(false);
            }}
          >
            Lift both
          </Button>
          <span className={s.note} aria-live="polite">
            Impacts fired: {impacts}
          </span>
        </div>
        <div className={s.stampStage}>
          <Stamp
            kind="failed"
            size="clamp(96px, 11vw, 190px)"
            headline={copy.stamp.failed.headline}
            marathi={copy.stamp.failed.marathi}
            subline={copy.stamp.failedSub(5400, 14)}
            play={failedPlay}
            onImpact={() => {
              setImpacts((n) => n + 1);
              sfx.thud();
            }}
          />
          <Stamp
            kind="survived"
            size="clamp(96px, 11vw, 190px)"
            headline={copy.stamp.survived.headline}
            subline={copy.stamp.survivedSub(11800, 31)}
            play={survivedPlay}
            shake={false}
            onImpact={() => {
              setImpacts((n) => n + 1);
              sfx.thud();
            }}
          />
        </div>
      </section>

      <section className={s.section} aria-labelledby="lab-sfx">
        <h2 id="lab-sfx">Sound</h2>
        <div className={s.row}>
          <Button
            onClick={async () => {
              await sfx.unlock();
              setUnlocked(sfx.isUnlocked());
            }}
          >
            Unlock audio
          </Button>
          <span className={s.note}>{unlocked ? 'Audio running' : 'Audio locked until a click or key press'}</span>
        </div>
        <div className={s.row}>
          <Button
            kind="secondary"
            onClick={() => {
              const on = !alarm;
              setAlarm(on);
              sfx.alarm(on);
            }}
          >
            {alarm ? 'Alarm off' : 'Alarm on'}
          </Button>
          <Button kind="secondary" onClick={() => sfx.thud()}>
            Thud
          </Button>
          <Button kind="secondary" onClick={() => sfx.seal()}>
            Seal tick
          </Button>
          <label className={s.slider}>
            Crowd murmur {Math.round(crowd * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={crowd}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCrowd(v);
                sfx.murmur(v);
              }}
            />
          </label>
          <Button
            kind="secondary"
            onClick={() => {
              const m = !muted;
              setMuted(m);
              sfx.setMuted(m);
            }}
          >
            {muted ? copy.buttons.unmute : copy.buttons.mute}
          </Button>
          <Button
            kind="secondary"
            onClick={() => {
              setAlarm(false);
              setCrowd(0);
              sfx.stopAll();
            }}
          >
            Stop all
          </Button>
        </div>
      </section>
    </div>
  );
}
