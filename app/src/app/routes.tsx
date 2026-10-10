// Routes and shell (PRD §13.1). Mode resolution:
//   /watch → spectate · /replay/:id → replay · / → live if keys are loaded AND the last preflight passed, else practice.
import { Suspense, lazy, useEffect } from 'react';
import { Link, Route, Switch } from 'wouter';
import { runActions, uiActions, useRunView, useUi } from '@/app/store';
import { BrandLab, PaperBackground } from '@/ui/brand';
import { ModeBanner, OpsPage, PanelsLab, ProofPanel, ReplayPicker } from '@/ui/panels';
import { StageLab, StageScreen } from '@/ui/stage';
import type { RunMode } from '@/types';

// Chain and engine labs are not in their barrels, so they load lazily and stay out of the stage bundle.
const ChainLab = lazy(() => import('@/chain/ChainLab').then((m) => ({ default: m.ChainLab })));
const EngineLab = lazy(() => import('@/engine/lab/EngineLab').then((m) => ({ default: m.EngineLab })));

function StageShell({ mode, replayId }: { mode: RunMode; replayId?: string }) {
  // setMode is idempotent, so StrictMode's double effect is harmless.
  useEffect(() => {
    // `auto`: a route-driven switch (e.g. preflight turned green) never tears down a run in progress.
    runActions.setMode(mode, { ...(replayId ? { replayId } : {}), auto: true });
  }, [mode, replayId]);
  const proofOpen = useUi((u) => u.proofOpen);
  return (
    <>
      <PaperBackground />
      <ModeBanner />
      <StageScreen />
      <ProofPanel open={proofOpen} onClose={() => uiActions.toggleProof(false)} />
    </>
  );
}

function HomeRoute() {
  const live = useRunView((v) => v.operator.address !== null && v.preflight?.ok === true);
  return <StageShell mode={live ? 'live' : 'practice'} />;
}

function NotFound() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Page not found</h1>
      <Link href="/">Back to the stage</Link>
    </main>
  );
}

export function Routes() {
  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/watch">{() => <StageShell mode="spectate" />}</Route>
        <Route path="/replay" component={ReplayPicker} />
        <Route path="/replay/:id">{(p) => <StageShell mode="replay" replayId={p.id} />}</Route>
        <Route path="/ops" component={OpsPage} />
        <Route path="/lab/stage" component={StageLab} />
        <Route path="/lab/brand" component={BrandLab} />
        <Route path="/lab/panels" component={PanelsLab} />
        <Route path="/lab/chain" component={ChainLab} />
        <Route path="/lab/engine" component={EngineLab} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
