// Spectator (PRD §12.7, C-10). Polls the bank's logs every ~1.2 s, so a phone on venue WiFi can follow a live run
// without a key. Spreads RPC load away from the presenter (Ankr first), chunks getLogs at ≤ 100 blocks, backs off on
// 429s, dedupes by block and log index, and catches up a viewer who joins mid-run.
import type { Address } from 'viem';
import { getBlockNumber, getLogs, readContract } from 'viem/actions';
import { CHAIN_LIMITS } from '@/config/network';
import type { BankSnapshotView, OutcomeEvent, RumorEvent, TickSealedEvent } from '@/types';
import { runBankAbi } from './abi';
import { getSpectatorClient } from './clients';
import type { ChainClient } from './clients';
import { decodeBankLogs, decodeSnapshot } from './decode';
import type { DecodedEvent, RawSnapshot } from './decode';
import { deployment } from './deployment';
import type { Spectator } from './types';

export interface SpectatorOptions {
  pollMs?: number;
  /** How far back to look on first start for a run still in progress. Default 2,000 blocks (~13 min). */
  lookbackBlocks?: bigint;
  snapshotMs?: number;
  /** Test hooks. */
  client?: ChainClient;
  runBank?: Address | null;
  deployBlock?: bigint | null;
}

const key = (e: DecodedEvent): string => `${e.blockNumber}:${e.logIndex}`;
const order = (a: DecodedEvent, b: DecodedEvent): number =>
  a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1;

export function createSpectator(opts: SpectatorOptions = {}): Spectator {
  const pollMs = opts.pollMs ?? 1200;
  const snapshotMs = opts.snapshotMs ?? 2000;
  const lookback = opts.lookbackBlocks ?? 2000n;

  const rumorCbs = new Set<(e: RumorEvent) => void>();
  const tickCbs = new Set<(e: TickSealedEvent[]) => void>();
  const outcomeCbs = new Set<(e: OutcomeEvent) => void>();
  const resetCbs = new Set<(runId: number) => void>();
  const snapCbs = new Set<(s: BankSnapshotView) => void>();

  let running = false;
  let lastBlock: bigint | null = null;
  let backoff = 1;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let snapTimer: ReturnType<typeof setTimeout> | null = null;
  const seen = new Set<string>();

  const bank = (): Address | null => (opts.runBank !== undefined ? opts.runBank : deployment.runBank);
  const client = (): ChainClient => opts.client ?? getSpectatorClient();
  const fire = <T>(cbs: Set<(v: T) => void>, v: T) => {
    for (const cb of [...cbs]) {
      try {
        cb(v);
      } catch {
        /* a listener's bug must not stop the spectator */
      }
    }
  };

  /** getLogs in ≤ 100-block chunks, three in parallel. */
  async function fetchRange(address: Address, from: bigint, to: bigint) {
    const ranges: [bigint, bigint][] = [];
    for (let s = from; s <= to; s += CHAIN_LIMITS.getLogsRange) {
      const e = s + CHAIN_LIMITS.getLogsRange - 1n;
      ranges.push([s, e > to ? to : e]);
    }
    const logs = [];
    for (let i = 0; i < ranges.length; i += 3) {
      const part = await Promise.all(ranges.slice(i, i + 3).map(([a, b]) => getLogs(client(), { address, fromBlock: a, toBlock: b })));
      for (const p of part) logs.push(...p);
    }
    return decodeBankLogs(logs, address).ordered.sort(order);
  }

  function dispatch(events: DecodedEvent[]): void {
    let batch: TickSealedEvent[] = [];
    const flush = () => {
      if (batch.length) fire(tickCbs, batch);
      batch = [];
    };
    for (const ev of events) {
      const k = key(ev);
      if (seen.has(k)) continue;
      seen.add(k);
      if (ev.type === 'tick') {
        batch.push(ev.event);
        continue;
      }
      flush();
      if (ev.type === 'rumor') fire(rumorCbs, ev.event);
      else if (ev.type === 'outcome') fire(outcomeCbs, ev.event);
      else fire(resetCbs, ev.runId);
    }
    flush();
  }

  /** On first start: find the newest rumor with no later reset and replay it, so a late joiner sees the run. */
  async function catchUp(address: Address): Promise<void> {
    const latest = await getBlockNumber(client(), { cacheTime: 0 });
    const floor = opts.deployBlock !== undefined ? opts.deployBlock : deployment.deployBlock;
    const from = latest - lookback > (floor ?? 0n) ? latest - lookback : (floor ?? 0n);
    const events = await fetchRange(address, from, latest);
    let idx = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'rumor') { idx = i; break; }
    }
    lastBlock = latest;
    if (idx < 0) return;
    const tail = events.slice(idx);
    if (tail.some((e) => e.type === 'reset')) return; // that run is over and cleared
    dispatch(tail);
  }

  async function pollOnce(): Promise<void> {
    const address = bank();
    if (!address) return; // nothing deployed yet
    if (lastBlock === null) {
      await catchUp(address);
      return;
    }
    const latest = await getBlockNumber(client(), { cacheTime: 0 });
    if (latest <= lastBlock) return;
    // A tab that slept for a long time must not issue thousands of getLogs calls.
    const from = latest - lastBlock > lookback ? latest - lookback : lastBlock + 1n;
    dispatch(await fetchRange(address, from, latest));
    lastBlock = latest;
  }

  const schedulePoll = () => {
    if (!running) return;
    pollTimer = setTimeout(async () => {
      try {
        await pollOnce();
        backoff = 1;
      } catch {
        backoff = Math.min(backoff * 2, 8); // 429 or a flaky RPC: ease off, up to ~10 s
      }
      schedulePoll();
    }, pollMs * backoff);
  };

  const scheduleSnapshot = () => {
    if (!running) return;
    snapTimer = setTimeout(async () => {
      const address = bank();
      if (address && snapCbs.size) {
        try {
          const [s, n] = await Promise.all([
            readContract(client(), { address, abi: runBankAbi, functionName: 'snapshot' }),
            getBlockNumber(client(), { cacheTime: 0 }).catch(() => null),
          ]);
          fire(snapCbs, decodeSnapshot(s as unknown as RawSnapshot, n));
        } catch {
          /* the log poll reports trouble through its own backoff */
        }
      }
      scheduleSnapshot();
    }, snapshotMs);
  };

  return {
    start() {
      if (running) return; // start() twice must not double the polling
      running = true;
      void (async () => {
        try {
          await pollOnce(); // catch-up immediately instead of waiting a full interval
        } catch {
          backoff = 2;
        }
        schedulePoll();
      })();
      scheduleSnapshot();
    },
    stop() {
      running = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (snapTimer) clearTimeout(snapTimer);
      pollTimer = snapTimer = null;
      lastBlock = null;
      seen.clear();
    },
    onRumor(cb) { rumorCbs.add(cb); return () => { rumorCbs.delete(cb); }; },
    onTicks(cb) { tickCbs.add(cb); return () => { tickCbs.delete(cb); }; },
    onOutcome(cb) { outcomeCbs.add(cb); return () => { outcomeCbs.delete(cb); }; },
    onReset(cb) { resetCbs.add(cb); return () => { resetCbs.delete(cb); }; },
    onSnapshot(cb) { snapCbs.add(cb); return () => { snapCbs.delete(cb); }; },
  };
}
