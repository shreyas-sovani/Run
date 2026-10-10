// The projector screen (PRD §5.2): top bar, network + vault, seal ticker, and the overlays that sit on the stage.
// The shell mounts ModeBanner, ProofPanel and PaperBackground around this; D owns the rest of what's on screen.
import { useCallback, useRef } from 'react';
import { useRunView } from '@/app/store';
import { HelpOverlay } from './HelpOverlay';
import { NetworkCanvas } from './NetworkCanvas';
import { NetworkLegend } from './NetworkLegend';
import { OutcomeLayer } from './OutcomeLayer';
import { Passbook } from './Passbook';
import { QueueStrip } from './QueueStrip';
import { SealTicker } from './SealTicker';
import { ErrorStrip, TopBar } from './TopBar';
import { VaultPanel } from './VaultPanel';
import { S } from './stageCopy';
import styles from './StageScreen.module.css';

// 180 ms, ±6 px (PRD §14.5). Web Animations API: no React state, no CSS class to clean up.
const SHAKE_FRAMES: Keyframe[] = [
  { transform: 'translate(0, 0)' },
  { transform: 'translate(-6px, 2px)', offset: 0.2 },
  { transform: 'translate(6px, -2px)', offset: 0.45 },
  { transform: 'translate(-4px, 1px)', offset: 0.7 },
  { transform: 'translate(0, 0)' },
];
const SHAKE_MS = 180;

export function StageScreen() {
  const stageRef = useRef<HTMLElement>(null);
  const vaultColRef = useRef<HTMLDivElement>(null);
  const mode = useRunView((v) => v.mode);
  const phase = useRunView((v) => v.phase);

  const shake = useCallback(() => {
    stageRef.current?.animate(SHAKE_FRAMES, { duration: SHAKE_MS, easing: 'linear' });
  }, []);

  return (
    <main ref={stageRef} className={styles.stage} aria-label={S.stageLabel()} data-mode={mode} data-phase={phase}>
      <div className={styles.head}>
        <TopBar />
        <ErrorStrip />
      </div>

      <div className={styles.main}>
        <section className={styles.network}>
          <NetworkCanvas targetRef={vaultColRef} />
          <NetworkLegend />
        </section>
        <div ref={vaultColRef} className={styles.vaultCol}>
          <VaultPanel />
          <QueueStrip />
        </div>
      </div>

      <SealTicker />

      <OutcomeLayer onShake={shake} />
      <Passbook />
      <HelpOverlay />
    </main>
  );
}
