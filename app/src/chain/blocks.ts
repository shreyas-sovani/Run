// Block feed (PRD §12.1, C-07): WebSocket newHeads, falling back to 400 ms polling; finalized height every 1 s.
// One underlying subscription is shared by every watcher, so calling `watch` twice never double-subscribes.
import { CHAIN_LIMITS } from '@/config/network';
import type { BlockInfo } from './types';
import type { ChainClient } from './clients';

export interface BlockFeed {
  /** Subscribe. Returns an unsubscribe. The underlying feed stops when the last watcher leaves. */
  watch(cb: (b: BlockInfo) => void): () => void;
  /** Latest block seen, or null before the first one. */
  latest(): BlockInfo | null;
}

export interface BlockFeedOptions {
  client: ChainClient;
  /** Lazily builds a WebSocket client; return null to force polling. */
  ws?: (() => ChainClient | null) | null;
  /** No block for this long on the socket → switch to polling. */
  wsStallMs?: number;
}

export function createBlockFeed(opts: BlockFeedOptions): BlockFeed {
  const watchers = new Set<(b: BlockInfo) => void>();
  let latest: BlockInfo | null = null;
  let finalized: bigint | null = null;
  let stop: (() => void) | null = null;

  const emit = (n: bigint) => {
    if (latest && n <= latest.number && latest.finalized === finalized) return;
    latest = { number: latest && n < latest.number ? latest.number : n, finalized };
    for (const cb of [...watchers]) {
      try {
        cb(latest);
      } catch {
        /* a watcher's bug must not stop the feed */
      }
    }
  };

  function start(): () => void {
    let closed = false;
    const timers: ReturnType<typeof setInterval>[] = [];
    let unwatchWs: (() => void) | null = null;
    let polling = false;
    let lastBlockAt = Date.now();
    let inPoll = false;

    const poll = async () => {
      if (inPoll || closed) return;
      inPoll = true;
      try {
        const n = await opts.client.getBlockNumber({ cacheTime: 0 });
        if (!closed) emit(n);
      } catch {
        /* the next tick retries; health is reported by the SealQueue, not here */
      } finally {
        inPoll = false;
      }
    };
    const startPolling = () => {
      if (polling || closed) return;
      polling = true;
      void poll();
      timers.push(setInterval(poll, CHAIN_LIMITS.blockTimeMs));
    };

    // Finalized height, 1 Hz.
    const pollFinal = async () => {
      try {
        const b = await opts.client.getBlock({ blockTag: 'finalized' });
        if (closed || b.number === null) return;
        finalized = b.number;
        if (latest) emit(latest.number);
      } catch {
        /* keep the previous finalized height */
      }
    };
    void pollFinal();
    timers.push(setInterval(pollFinal, 1000));

    const ws = opts.ws ? opts.ws() : null;
    if (ws) {
      try {
        // `poll: false` = eth_subscribe newHeads on the socket (typed away because ChainClient is transport-generic).
        unwatchWs = ws.watchBlockNumber({
          poll: false,
          onBlockNumber: (n: bigint) => {
            lastBlockAt = Date.now();
            emit(n);
          },
          onError: () => startPolling(),
        } as never);
      } catch {
        startPolling();
      }
      // A socket that connects but goes quiet is as bad as one that fails.
      const stall = opts.wsStallMs ?? 2000;
      timers.push(
        setInterval(() => {
          if (!polling && Date.now() - lastBlockAt > stall) startPolling();
        }, 500),
      );
    } else {
      startPolling();
    }

    return () => {
      closed = true;
      timers.forEach(clearInterval);
      try {
        unwatchWs?.();
      } catch {
        /* already closed */
      }
    };
  }

  return {
    watch(cb) {
      watchers.add(cb);
      if (latest) cb(latest);
      if (!stop) stop = start();
      return () => {
        watchers.delete(cb);
        if (watchers.size === 0 && stop) {
          stop();
          stop = null;
        }
      };
    },
    latest: () => latest,
  };
}
