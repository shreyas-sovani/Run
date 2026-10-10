// Routes and shell (PRD §13.1). `/` is the landing page and links to every route below. Mode resolution:
//   /watch → spectate · /replay/:id → replay · /app → live if keys are loaded AND the last preflight passed, else practice.
import { Suspense, lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, Route, Switch } from 'wouter';
import { PATHS } from '@/app/paths';
import { runActions, uiActions, useRunView, useUi } from '@/app/store';
import { BrandLab, PaperBackground } from '@/ui/brand';
import { ClosingCardHost, OpsPage, PanelsLab, ProofPanel, ReplayPicker } from '@/ui/panels';
import { LandingPage, SiteNav } from '@/ui/site';
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
  // The mode chip in the stage's top bar says what each mode is (PRD §4); the nav replaces the old mode banner.
  return (
    <>
      <PaperBackground />
      <SiteNav />
      <StageScreen />
      <ProofPanel open={proofOpen} onClose={() => uiActions.toggleProof(false)} />
      <ClosingCardHost />
    </>
  );
}

function AppRoute() {
  const live = useRunView((v) => v.operator.address !== null && v.preflight?.ok === true);
  return <StageShell mode={live ? 'live' : 'practice'} />;
}

function WithNav({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      {children}
    </>
  );
}

function NotFound() {
  return (
    <WithNav>
      <main style={{ padding: 24 }}>
        <h1>Page not found</h1>
        <Link href={PATHS.home}>Back to the home page</Link>
      </main>
    </WithNav>
  );
}

export function Routes() {
  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path={PATHS.home} component={LandingPage} />
        <Route path={PATHS.app} component={AppRoute} />
        <Route path={PATHS.watch}>{() => <StageShell mode="spectate" />}</Route>
        <Route path={PATHS.replays}>{() => <WithNav><ReplayPicker /></WithNav>}</Route>
        <Route path="/replay/:id">{(p) => <StageShell mode="replay" replayId={p.id} />}</Route>
        <Route path={PATHS.ops}>{() => <WithNav><OpsPage /></WithNav>}</Route>
        <Route path={PATHS.labs.stage} component={StageLab} />
        <Route path={PATHS.labs.brand} component={BrandLab} />
        <Route path={PATHS.labs.panels} component={PanelsLab} />
        <Route path={PATHS.labs.chain} component={ChainLab} />
        <Route path={PATHS.labs.engine} component={EngineLab} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
