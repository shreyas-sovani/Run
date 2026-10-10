// Chain clients and failover (PRD §12.1). Testnet only: chain 10143.
// Nothing here runs at import time: clients are built lazily so tests and SSR-free builds stay cheap.
import { createPublicClient, defineChain, fallback, http, shouldThrow as viemShouldThrow, webSocket } from 'viem';
import type { Chain, PublicClient, Transport } from 'viem';
import { monadTestnet } from 'viem/chains';
import { CHAIN_LIMITS, NETWORK, presenterRpcOrder, spectatorRpcOrder } from '@/config/network';
import { isAlreadyKnown, isInsufficientFunds, isNonceTooLow, isReserveBalance } from './errors';

/** viem's built-in explorer URL is stale; override with MonadVision (default) and Monadscan (PRD §8). */
export const monadChain: Chain = defineChain({
  ...monadTestnet,
  blockExplorers: {
    default: { name: 'MonadVision', url: NETWORK.explorers.monadvision },
    monadscan: { name: 'Monadscan', url: NETWORK.explorers.monadscan },
  },
});

export type ChainClient = PublicClient<Transport, Chain>;

export interface RpcEndpoint { name: string; http: string }

export interface ClientBundle {
  client: ChainClient;
  endpoints: RpcEndpoint[];
  /** Name of the RPC that most recently answered a request successfully (for the proof panel). */
  lastRpc(): string | null;
}

const isLocal = (url: string): boolean => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url);

/**
 * Errors that must reach the caller instead of hopping to another RPC: a different node would say the same
 * thing (revert, nonce, funds), or the follow-up needs to look at the tx (already known).
 */
export function shouldThrowOnFallback(error: Error): boolean {
  return (
    !!viemShouldThrow(error) ||
    isNonceTooLow(error) ||
    isAlreadyKnown(error) ||
    isInsufficientFunds(error) ||
    isReserveBalance(error)
  );
}

export function endpointsFor(order: 'presenter' | 'spectator', rpcOverride?: string | null): RpcEndpoint[] {
  if (order === 'spectator') return spectatorRpcOrder();
  // A local anvil fork replaces the public list entirely so tests never leak onto the real testnet.
  if (rpcOverride && isLocal(rpcOverride)) return [{ name: 'Local fork', http: rpcOverride }];
  return presenterRpcOrder(rpcOverride);
}

export function createClientBundle(opts: {
  order: 'presenter' | 'spectator';
  rpcOverride?: string | null;
  /** Per-request HTTP timeout. */
  timeoutMs?: number;
}): ClientBundle {
  const endpoints = endpointsFor(opts.order, opts.rpcOverride);
  const timeout = opts.timeoutMs ?? CHAIN_LIMITS.rpcTimeoutMs;
  // batch: false everywhere; the Monad Foundation RPC rejects batch requests.
  const transport = fallback(
    endpoints.map((e) => http(e.http, { timeout, retryCount: 0, batch: false, name: e.name, key: e.name })),
    { retryCount: 1, retryDelay: 150, shouldThrow: shouldThrowOnFallback },
  );
  const client = createPublicClient({ chain: monadChain, transport, pollingInterval: CHAIN_LIMITS.blockTimeMs }) as ChainClient;

  let last: string | null = null;
  const t = client.transport as unknown as { onResponse?: (fn: (a: { status: string; transport: { config?: { name?: string; key?: string } } }) => void) => void };
  t.onResponse?.((a) => {
    if (a.status === 'success') last = a.transport.config?.name ?? a.transport.config?.key ?? last;
  });
  return { client, endpoints, lastRpc: () => last };
}

const cache = new Map<string, ClientBundle>();
const cached = (key: string, make: () => ClientBundle): ClientBundle => {
  let b = cache.get(key);
  if (!b) {
    b = make();
    cache.set(key, b);
  }
  return b;
};

/** Presenter reads and writes: dedicated → QuickNode → Monad Foundation → Ankr. */
export function getPublicBundle(rpcOverride?: string | null): ClientBundle {
  return cached(`p:${rpcOverride ?? ''}`, () => createClientBundle({ order: 'presenter', rpcOverride }));
}

/** The send path gets a longer HTTP timeout than the 4 s sync-send timeout so the RPC answers first. */
export function getSendBundle(rpcOverride?: string | null): ClientBundle {
  return cached(`s:${rpcOverride ?? ''}`, () =>
    createClientBundle({ order: 'presenter', rpcOverride, timeoutMs: CHAIN_LIMITS.syncTimeoutMs + 2000 }),
  );
}

/** Spectator reads: Ankr → Monad Foundation → QuickNode (spreads venue-WiFi load away from the presenter). */
export function getSpectatorBundle(): ClientBundle {
  return cached('spectator', () => createClientBundle({ order: 'spectator' }));
}

export const getPublicClient = (rpcOverride?: string | null): ChainClient => getPublicBundle(rpcOverride).client;
export const getSpectatorClient = (): ChainClient => getSpectatorBundle().client;

/** WebSocket client for `newHeads`. QuickNode's WSS; null when an override points at a local fork. */
export function createWsClient(rpcOverride?: string | null): ChainClient | null {
  if (rpcOverride && isLocal(rpcOverride)) return null;
  const wss = NETWORK.rpcs.find((r) => r.wss)?.wss;
  if (!wss) return null;
  return createPublicClient({
    chain: monadChain,
    transport: webSocket(wss, { timeout: CHAIN_LIMITS.rpcTimeoutMs, retryCount: 0, reconnect: false, keepAlive: { interval: 10_000 } }),
  }) as ChainClient;
}
