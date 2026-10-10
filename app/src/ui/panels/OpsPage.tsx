import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { loadOperatorKeys } from '@/chain';
import { runActions, useRunView } from '@/app/store';
import type { ReplayFile } from '@/types';
import { PaperBackground } from '@/ui/brand';
import { OpsView } from './OpsView';

/** Downloads a replay as JSON. F commits chosen files to `app/public/replays/`. */
function downloadReplay(file: ReplayFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${file.id || 'run-replay'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `/ops`: the operator page. Wires `OpsView` to the store; every button has its own pending flag. */
export function OpsPage() {
  const view = useRunView((v) => ({
    operator: v.operator,
    preflight: v.preflight,
    pending: v.pending,
    deployment: v.deployment,
    error: v.error,
  }));
  const [, navigate] = useLocation();
  // Where the key came from. Re-read when the operator changes; it never exposes the key itself.
  const keySource = useMemo(() => (view.operator.address ? loadOperatorKeys().source : null), [view.operator.address]);

  return (
    <>
      <PaperBackground />
      <OpsView
        {...view}
        keySource={keySource}
        buildId={typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}
        onLoadKeys={(keys) => runActions.connectOperator(keys)}
        onReconnectRpc={(rpcOverride) => {
          const keys = loadOperatorKeys();
          if (!keys.primary) return;
          return runActions.connectOperator({ primary: keys.primary, backup: keys.backup, rpcOverride });
        }}
        onForget={() => runActions.disconnectOperator()}
        onRecheck={async () => {
          await runActions.runPreflight();
        }}
        onFund={() => runActions.fundBank()}
        onPing={() => runActions.ping()}
        onReset={() => runActions.reset()}
        onSave={() => {
          const file = runActions.saveReplay();
          if (!file) return 'none';
          downloadReplay(file);
          return 'saved';
        }}
        onGoStage={() => navigate('/')}
        onDismissError={() => runActions.dismissError()}
      />
    </>
  );
}
