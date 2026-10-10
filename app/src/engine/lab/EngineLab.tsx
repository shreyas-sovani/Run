// Placeholder from F-00. Owner: B. Replace freely.
import { useMemo } from 'react';
import { createRun, defaultParams, loadModel, stepRun } from '@/engine';

export function EngineLab() {
  const summary = useMemo(() => {
    const model = loadModel();
    let run = createRun(model, defaultParams(model, 0, 1));
    const lines: string[] = [];
    while (run.frame.bank.status === 'running' && run.frame.tick < 60) {
      const s = stepRun(model, run);
      run = s.run;
      lines.push(`tick ${s.result.tick}: requested ${s.payload.requested.length}, status ${s.result.statusAfter}`);
    }
    return { nodes: model.graph.nodes.length, lines };
  }, []);
  return (
    <div style={{ padding: 24 }}>
      <h1>Engine lab (placeholder)</h1>
      <p>{summary.nodes} nodes. Fixture engine, Bhau&apos;s Bank x W:</p>
      <pre>{summary.lines.join('\n')}</pre>
    </div>
  );
}
