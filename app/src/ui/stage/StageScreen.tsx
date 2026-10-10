// Placeholder from F-00. Owner: D. Replace freely.
import { useRunView } from '@/app/store';

export function StageScreen() {
  const mode = useRunView((v) => v.mode);
  const phase = useRunView((v) => v.phase);
  const tick = useRunView((v) => v.frame?.tick ?? 0);
  const sealed = useRunView((v) => v.sealedTick);
  const outcome = useRunView((v) => v.outcome?.kind ?? null);
  return (
    <main style={{ padding: 24, color: 'var(--ink)' }}>
      <h1>RUN!</h1>
      <p>mode: {mode} · phase: {phase} · tick: {tick} · sealed: {sealed} · outcome: {outcome ?? 'none'}</p>
      <p>Stage placeholder. Owner: D.</p>
    </main>
  );
}
