// Placeholder from F-00. Owner: C. Replace freely.
// PRD §8 verified chain facts. The only file that may contain RPC URLs.
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

export function explorerTx(hash: Hex, which: 'monadvision' | 'monadscan' = 'monadvision'): string {
  return `${NETWORK.explorers[which]}/tx/${hash}`;
}

export function explorerAddress(addr: Address, which: 'monadvision' | 'monadscan' = 'monadvision'): string {
  return `${NETWORK.explorers[which]}/address/${addr}`;
}
