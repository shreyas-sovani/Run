import { describe, expect, it } from 'vitest';
import { getRunView, startFakeRun, subscribeRunView } from '@/app/store';

function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (pred()) { clearInterval(id); resolve(); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(id); reject(new Error('timeout')); }
    }, 50);
  });
}

describe('fake run driver', () => {
  it('fails Bhau\'s Bank once, with contiguous ticks, even when started twice (StrictMode shape)', async () => {
    const ticks: number[] = [];
    const unsub = subscribeRunView((v) => {
      const t = v.frame?.tick;
      if (t !== undefined && t !== ticks[ticks.length - 1]) ticks.push(t);
    });
    startFakeRun({ outcome: 'failed' });
    startFakeRun({ outcome: 'failed' }); // second call must cancel the first, not double the clock
    await waitFor(() => getRunView().phase === 'failed', 20_000);
    unsub();
    const v = getRunView();
    const run = ticks.filter((t) => t > 0);
    expect(run).toEqual(run.map((_, i) => i + 1)); // 1,2,3,… no repeats, no gaps
    expect(v.outcome?.kind).toBe('failed');
    expect(v.outcome?.sealed).toBe(false);
    expect(v.sealedTick).toBe(v.outcome?.tick);
    expect(v.mirror.matched).toBe(v.mirror.total);
    expect(v.seals.every((s) => s.simulated)).toBe(true);
  }, 30_000);
});
