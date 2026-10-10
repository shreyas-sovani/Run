// Placeholder from F-00. Owner: D. Replace freely.
import { startFakeRun } from '@/app/store';
import { StageScreen } from './StageScreen';

export function StageLab() {
  return (
    <div>
      <div style={{ padding: 8 }}>
        <button type="button" onClick={() => startFakeRun({ level: 0, outcome: 'failed' })}>Fake run: Bhau&apos;s fails</button>{' '}
        <button type="button" onClick={() => startFakeRun({ level: 1, outcome: 'survived' })}>Fake run: Monad Mutual survives</button>
      </div>
      <StageScreen />
    </div>
  );
}
