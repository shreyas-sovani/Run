// Placeholder from F-00. Owner: C. Replace freely.
import { useState } from 'react';
import { createMockAdapter } from '@/chain';
import { loadModel } from '@/engine';

export function ChainLab() {
  const [log, setLog] = useState<string[]>([]);
  const ping = async () => {
    const adapter = createMockAdapter(loadModel());
    const r = await adapter.ping();
    setLog((l) => [...l, `ping sealed in block ${String(r.record.blockNumber)} (simulated)`]);
  };
  return (
    <div style={{ padding: 24 }}>
      <h1>Chain lab (placeholder)</h1>
      <button type="button" onClick={ping}>Ping mock adapter</button>
      <pre>{log.join('\n')}</pre>
    </div>
  );
}
