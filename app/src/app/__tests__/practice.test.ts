import { describe, expect, it } from 'vitest';
import { controller } from '@/app/controller';
import { getRunView, runActions, subscribeRunView } from '@/app/store';

function waitFor(pred: () => boolean, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (pred()) { clearInterval(id); resolve(); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(id); reject(new Error(`timeout waiting for ${label}`)); }
    }, 50);
  });
}

describe('practice mode on the engine + mock adapter', () => {
  it('fails Bhau\'s Bank, then Monad Mutual survives; one runner even with doubled init/start', async () => {
    const ticks: number[] = [];
    const unsub = subscribeRunView((v) => {
      const t = v.frame?.tick;
      if (t !== undefined && t !== 0 && t !== ticks[ticks.length - 1]) ticks.push(t);
    });

    // StrictMode shape: init twice, setMode twice, start twice.
    controller.init();
    controller.init();
    runActions.setMode('practice');
    runActions.setMode('practice');
    runActions.selectLevel(0);
    runActions.selectCard(1);
    void runActions.start();
    void runActions.start();
    await waitFor(() => getRunView().phase === 'failed', 30_000, 'bank to fail');

    let v = getRunView();
    expect(v.outcome?.kind).toBe('failed');
    expect(v.outcome?.sealed).toBe(false);
    expect(v.mirror.total).toBeGreaterThan(0);
    expect(v.mirror.matched).toBe(v.mirror.total);
    expect(v.seals.every((s) => s.simulated)).toBe(true);
    expect(ticks).toEqual(ticks.map((_, i) => i + 1));
    expect(v.outcome?.tick).toBe(ticks[ticks.length - 1]);

    // Reset, switch bank, same rumor, survives.
    runActions.selectLevel(1); // from 'failed' this resets first, then switches
    await waitFor(() => getRunView().phase === 'idle' && getRunView().level === 1, 10_000, 'reset + switch');
    ticks.length = 0; // frame is null again after the reset; forget the old run's ticks
    runActions.selectCard(1);
    void runActions.start();
    await waitFor(() => getRunView().phase === 'survived', 45_000, 'bank to survive');
    v = getRunView();
    expect(v.outcome?.kind).toBe('survived');
    expect(v.outcome?.trappedCount).toBe(0);
    expect(v.mirror.matched).toBe(v.mirror.total);
    expect(ticks).toEqual(ticks.map((_, i) => i + 1));
    expect(v.seals.some((s) => s.kind === 'setLevel')).toBe(true);
    unsub();
  }, 90_000);
});
