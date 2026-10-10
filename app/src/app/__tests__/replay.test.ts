import { afterEach, describe, expect, it, vi } from 'vitest';
import { controller } from '@/app/controller';
import { getRunView, runActions, subscribeRunView } from '@/app/store';
import type { ReplayFile } from '@/types';

function waitFor(pred: () => boolean, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (pred()) { clearInterval(id); resolve(); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(id); reject(new Error(`timeout waiting for ${label}`)); }
    }, 50);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('replay mode', () => {
  it('shows a clear error when no recorded run exists', async () => {
    vi.stubGlobal('fetch', async () => new Response('[]', { status: 200 }));
    controller.init();
    runActions.setMode('replay');
    await waitFor(() => getRunView().error?.code === 'replay-unavailable', 5_000, 'replay-unavailable error');
    expect(getRunView().phase).toBe('idle');
  });

  it('plays a recorded run at its recorded pace and ends with the recorded outcome (Shift+R path)', async () => {
    // Record a run with the practice session first.
    runActions.setMode('practice');
    runActions.selectLevel(0);
    runActions.selectCard(1);
    void runActions.start();
    await waitFor(() => getRunView().phase === 'failed', 30_000, 'practice run to fail');
    const file: ReplayFile | null = runActions.saveReplay();
    expect(file).not.toBeNull();
    const recorded = JSON.parse(JSON.stringify(file)) as ReplayFile;

    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/replays/index.json'))
        return new Response(JSON.stringify([{ id: recorded.id, name: recorded.name, recordedAt: recorded.recordedAt, kind: recorded.outcome.kind, level: recorded.params.level }]));
      if (url.endsWith(`/replays/${recorded.id}.json`)) return new Response(JSON.stringify(recorded));
      return new Response('nope', { status: 404 });
    });

    const ticks: number[] = [];
    const unsub = subscribeRunView((v) => {
      const t = v.mode === 'replay' ? v.frame?.tick : undefined;
      if (t !== undefined && t !== 0 && t !== ticks[ticks.length - 1]) ticks.push(t);
    });
    runActions.setMode('replay'); // newest recorded run, like Shift+R
    await waitFor(() => getRunView().mode === 'replay' && getRunView().phase === 'failed', 20_000, 'replay to finish');
    unsub();

    const v = getRunView();
    expect(v.replay?.id).toBe(recorded.id);
    expect(v.outcome?.kind).toBe('failed');
    expect(v.outcome?.tick).toBe(recorded.outcome.tick);
    expect(v.outcome?.sealed).toBe(true);
    expect(ticks).toEqual(ticks.map((_, i) => i + 1));
    expect(ticks.length).toBe(recorded.ticks.length);
    expect(v.sealedTick).toBe(recorded.outcome.tick);
    expect(v.seals[0].kind).toBe('rumor');
    expect(v.seals.filter((s) => s.kind === 'ticks').length).toBe(recorded.seals.length);
  }, 60_000);
});
