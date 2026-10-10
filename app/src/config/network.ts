// PRD §8 verified chain facts (checked 10 Oct 2026). The only file that may contain RPC URLs.
// Testnet only: chain 10143. Never add a mainnet RPC, address or chain id here.
import type { Address, Hex } from 'viem';

export const NETWORK = {
  chainId: 10143 as const,
  name: 'Monad Testnet' as const,
  rpcs: [
    { name: 'QuickNode', http: 'https://testnet-rpc.monad.xyz', wss: 'wss://testnet-rpc.monad.xyz' },
    { name: 'Monad Foundation', http: 'https://rpc-testnet.monadinfra.com', wss: 'wss://rpc-testnet.monadinfra.com' },
    { name: 'Ankr', http: 'https://rpc.ankr.com/monad_testnet', wss: null },
  ] as { name: string; http: string; wss: string | null }[],
  explorers: {
    monadvision: 'https://testnet.monadvision.com',
    monadscan: 'https://testnet.monadscan.com',
  },
  ausd: '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC' as Address,
  ausdFaucet: '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C' as Address,
  ausdDecimals: 6 as const,
};

/** Additive chain constants (PRD §8, §12). */
export const CHAIN_LIMITS = {
  blockTimeMs: 400,
  finalityMs: 800,
  /** eth_getLogs range per call on the public RPCs; chunk at or below this. */
  getLogsRange: 100n,
  /** Per-request HTTP timeout; every network call has one. */
  rpcTimeoutMs: 4000,
  /** `eth_sendRawTransactionSync` timeout parameter. */
  syncTimeoutMs: 4000,
  /** Operator balance thresholds (MON, in wei) from PRD §12.4 / §12.5. */
  warnMonWei: 15n * 10n ** 18n,
  refuseMonWei: 10_500_000_000_000_000_000n,
  /** Monad's reserve balance floor. */
  reserveMonWei: 10n * 10n ** 18n,
} as const;

/** Presenter order: optional dedicated URL → QuickNode → Monad Foundation → Ankr. */
export function presenterRpcOrder(override?: string | null): { name: string; http: string }[] {
  const base = ['QuickNode', 'Monad Foundation', 'Ankr']
    .map((n) => NETWORK.rpcs.find((r) => r.name === n))
    .filter((r): r is (typeof NETWORK.rpcs)[number] => !!r)
    .map((r) => ({ name: r.name, http: r.http }));
  return override ? [{ name: 'Dedicated', http: override }, ...base] : base;
}

/** Spectator order spreads venue-WiFi load away from the presenter: Ankr → Monad Foundation → QuickNode. */
export function spectatorRpcOrder(): { name: string; http: string }[] {
  return ['Ankr', 'Monad Foundation', 'QuickNode']
    .map((n) => NETWORK.rpcs.find((r) => r.name === n))
    .filter((r): r is (typeof NETWORK.rpcs)[number] => !!r)
    .map((r) => ({ name: r.name, http: r.http }));
}

export function explorerTx(hash: Hex, which: 'monadvision' | 'monadscan' = 'monadvision'): string {
  return `${NETWORK.explorers[which]}/tx/${hash}`;
}

export function explorerAddress(addr: Address, which: 'monadvision' | 'monadscan' = 'monadvision'): string {
  return `${NETWORK.explorers[which]}/address/${addr}`;
}
