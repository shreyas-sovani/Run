// SealQueue (PRD §12.4, C-04). One transaction in flight; merges up to 8 pending ticks per `sealTicks`; recovers from
// timeouts, offline RPCs and already-landed batches (TickMismatch / WrongStatus) without losing or duplicating a tick.
import type { SealHealth, SealResult, TickPayload, UiError } from '@/types';
import { classify, translateError } from './errors';
import type { ChainAdapter, SealQueue, SealQueueOptions } from './types';

interface Pending {
  p: TickPayload;
  /** When the tick was pushed (drives the `delayed` health). */
  at: number;
}

export function createSealQueue(adapter: ChainAdapter, opts: SealQueueOptions = {}): SealQueue {
  const maxTicks = Math.max(1, opts.maxTicksPerTx ?? 8);
  const delayedAfterMs = opts.delayedAfterMs ?? 2500;
  const timeoutRetries = opts.timeoutRetries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 500;
  const offlineDelayMs = opts.retryDelayMs ?? 2000;

  let pending: Pending[] = [];
  let inflight = false;
  let sealedTick = 0;
  let highestPushed = 0;
  let health: SealHealth = 'idle';
  let stopped = false;
  let paused = false;
  let offline = false;
  let offlineSince: number | null = null;
  let offlineReported = false;
  const offlineReportAfterMs = 6000;
  let timeouts = 0;
  let lockedLen: number | null = null;
  let waker: (() => void) | null = null;
  const sealedCbs = new Set<(r: SealResult) => void>();
  const healthCbs = new Set<(h: SealHealth) => void>();
  const errorCbs = new Set<(e: UiError) => void>();
  const drainers = new Set<() => void>();

  const setHealth = (h: SealHealth) => {
    if (h === health) return;
    health = h;
    for (const cb of [...healthCbs]) safe(() => cb(h));
  };
  const emitError = (e: UiError) => {
    for (const cb of [...errorCbs]) safe(() => cb(e));
  };
  const settleDrainers = () => {
    if (stopped || (!inflight && pending.length === 0 && !paused)) {
      for (const d of [...drainers]) d();
      drainers.clear();
    }
  };

  /** `delayed` when the oldest unsealed tick has waited too long (never overrides paused / offline). */
  const watchdog = setInterval(() => {
    if (stopped || paused || offline || pending.length === 0) return;
    if (Date.now() - pending[0].at > delayedAfterMs) setHealth('delayed');
  }, Math.max(10, Math.min(250, delayedAfterMs / 2)));

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        waker = null;
        resolve();
      }
      waker = done; // stop() / retry() cut the wait short
    });

  function applySealed(res: SealResult, batch: Pending[]): void {
    const lastBatchTick = batch[batch.length - 1].p.tick;
    const last = res.ticks.length ? res.ticks[res.ticks.length - 1].tick : lastBatchTick;
    sealedTick = Math.max(sealedTick, last);
    // After the outcome nothing else will ever be accepted by the bank: drop the rest.
    pending = res.outcome ? [] : pending.filter((x) => x.p.tick > last);
    for (const cb of [...sealedCbs]) safe(() => cb(res));
  }

  /**
   * The send failed with TickMismatch / WrongStatus. If the chain is already at or past the batch's first tick, some
   * or all of it landed (a timed-out send that confirmed late). Rebuild those ticks from the logs and carry on.
   */
  async function recover(batch: Pending[]): Promise<boolean> {
    const first = batch[0].p.tick;
    const lastTick = batch[batch.length - 1].p.tick;
    let snap;
    try {
      snap = await adapter.readSnapshot();
    } catch {
      return false;
    }
    if (snap.tick < first) return false; // nothing landed: a real desync
    const landedTo = Math.min(snap.tick, lastTick);
    const res = await adapter.recoverTicks?.(first, landedTo).catch(() => null);
    if (!res) return false;
    applySealed(res, batch.filter((b) => b.p.tick <= landedTo));
    return true;
  }

  async function pump(): Promise<void> {
    while (!stopped && !paused && !inflight && pending.length > 0) {
      inflight = true;
      setHealth(offline ? 'offline' : Date.now() - pending[0].at > delayedAfterMs ? 'delayed' : 'sealing');
      // After a timeout resend exactly the same batch, so the adapter re-broadcasts the same signed tx.
      const batch = pending.slice(0, lockedLen ?? maxTicks);
      lockedLen = null;
      let retryAfter = 0;
      try {
        const res = await adapter.sealTicks(batch[0].p.tick, batch.map((b) => b.p.requested));
        if (stopped) return;
        timeouts = 0;
        offline = false;
        offlineSince = null;
        applySealed(res, batch);
      } catch (e) {
        if (stopped) return;
        const kind = classify(e);
        if (kind === 'mismatch' && (await recover(batch))) {
          timeouts = 0;
          offline = false;
          offlineSince = null;
        } else if (kind === 'timeout' && timeouts < timeoutRetries) {
          // Silent: health says "delayed"; an error here would pause the stage for a blip.
          timeouts += 1;
          lockedLen = batch.length;
          setHealth('delayed');
          retryAfter = retryDelayMs;
        } else if (kind === 'offline') {
          // Retries forever. Only a real outage (not a blip) pauses the stage with a message.
          offlineSince ??= Date.now();
          offline = true;
          setHealth('offline');
          if (!offlineReported && Date.now() - offlineSince > offlineReportAfterMs) {
            offlineReported = true;
            emitError(translateError(e));
          }
          retryAfter = offlineDelayMs;
        } else {
          paused = true;
          const ui = translateError(e);
          // A timeout that ran out of automatic retries still needs a way forward.
          emitError(kind === 'timeout' && !ui.action ? { ...ui, action: { label: 'Retry', run: 'retry' } } : ui);
          setHealth('paused');
        }
      } finally {
        inflight = false;
      }
      if (retryAfter > 0 && !stopped && !paused) await wait(retryAfter);
      if (!stopped && !paused) {
        if (pending.length === 0) setHealth('idle');
        else if (!offline) setHealth(Date.now() - pending[0].at > delayedAfterMs ? 'delayed' : 'sealing');
      }
      settleDrainers();
    }
    settleDrainers();
  }

  return {
    push(p) {
      if (stopped || p.tick <= highestPushed) return; // duplicates and replays of old ticks are dropped
      highestPushed = p.tick;
      pending.push({ p, at: Date.now() });
      void pump();
    },
    get sealedTick() { return sealedTick; },
    get pending() { return pending.length; },
    get health() { return health; },
    onSealed(cb) { sealedCbs.add(cb); return () => { sealedCbs.delete(cb); }; },
    onHealth(cb) { healthCbs.add(cb); return () => { healthCbs.delete(cb); }; },
    onError(cb) { errorCbs.add(cb); return () => { errorCbs.delete(cb); }; },
    drain() {
      if (stopped || (!inflight && pending.length === 0 && !paused)) return Promise.resolve();
      return new Promise<void>((resolve) => { drainers.add(resolve); });
    },
    retry() {
      if (stopped) return;
      paused = false;
      timeouts = 0;
      lockedLen = null;
      offlineReported = false;
      offlineSince = null;
      waker?.();
      void pump();
    },
    stop() {
      stopped = true;
      pending = [];
      clearInterval(watchdog);
      waker?.();
      setHealth('idle');
      settleDrainers();
    },
  };
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* a subscriber's bug must not stall sealing */
  }
}
