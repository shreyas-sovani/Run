import { BaseError, InsufficientFundsError, NonceTooLowError } from 'viem';
import { describe, expect, it } from 'vitest';
import { NETWORK, explorerAddress, explorerTx, presenterRpcOrder, spectatorRpcOrder } from '@/config/network';
import { createClientBundle, endpointsFor, monadChain, shouldThrowOnFallback } from './clients';
import { deployment } from './deployment';

describe('network config (PRD §8)', () => {
  it('is Monad testnet only', () => {
    expect(NETWORK.chainId).toBe(10143);
    expect(monadChain.id).toBe(10143);
    const all = JSON.stringify(NETWORK);
    expect(all).not.toMatch(/mainnet/i);
    expect(deployment.ausd).toBe('0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC');
  });

  it('overrides the stale explorer with MonadVision (default) and Monadscan', () => {
    expect(monadChain.blockExplorers?.default.url).toBe('https://testnet.monadvision.com');
    expect(monadChain.blockExplorers?.monadscan.url).toBe('https://testnet.monadscan.com');
    expect(JSON.stringify(monadChain.blockExplorers)).not.toContain('monadexplorer');
    expect(explorerTx('0xabc')).toBe('https://testnet.monadvision.com/tx/0xabc');
    expect(explorerTx('0xabc', 'monadscan')).toBe('https://testnet.monadscan.com/tx/0xabc');
    expect(explorerAddress('0x0000000000000000000000000000000000000001')).toBe(
      'https://testnet.monadvision.com/address/0x0000000000000000000000000000000000000001',
    );
  });

  it('presenter order: dedicated → QuickNode → Monad Foundation → Ankr', () => {
    expect(presenterRpcOrder().map((r) => r.name)).toEqual(['QuickNode', 'Monad Foundation', 'Ankr']);
    expect(presenterRpcOrder('https://dedicated.example/rpc').map((r) => r.name)).toEqual(['Dedicated', 'QuickNode', 'Monad Foundation', 'Ankr']);
  });

  it('spectator order spreads load away from the presenter: Ankr first', () => {
    expect(spectatorRpcOrder().map((r) => r.name)).toEqual(['Ankr', 'Monad Foundation', 'QuickNode']);
    expect(endpointsFor('spectator', 'http://127.0.0.1:8545').map((r) => r.name)).toEqual(['Ankr', 'Monad Foundation', 'QuickNode']);
  });

  it('a localhost override replaces the public list entirely (a fork can never leak onto the real testnet)', () => {
    expect(endpointsFor('presenter', 'http://127.0.0.1:8545')).toEqual([{ name: 'Local fork', http: 'http://127.0.0.1:8545' }]);
    expect(endpointsFor('presenter', 'http://localhost:8545').map((r) => r.name)).toEqual(['Local fork']);
  });
});

describe('fallback policy', () => {
  it('rethrows errors another RPC would repeat (revert, nonce, funds, already known)', () => {
    expect(shouldThrowOnFallback(new NonceTooLowError({ nonce: 1 }))).toBe(true);
    expect(shouldThrowOnFallback(new InsufficientFundsError({ cause: new BaseError('x') }))).toBe(true);
    expect(shouldThrowOnFallback(new Error('already known'))).toBe(true);
    expect(shouldThrowOnFallback(Object.assign(new Error('execution reverted'), { code: 3 }))).toBe(true);
    expect(shouldThrowOnFallback(new Error('reserve balance violated'))).toBe(true);
  });
  it('hops to the next RPC on transport trouble', () => {
    expect(shouldThrowOnFallback(new Error('HTTP request failed. Status: 429'))).toBe(false);
    expect(shouldThrowOnFallback(new Error('The request took too long to respond.'))).toBe(false);
    expect(shouldThrowOnFallback(new Error('fetch failed'))).toBe(false);
  });
});

// Network-tagged: `CHAIN_NETWORK_TESTS=1 pnpm vitest run src/chain/clients.test.ts` reads a block through every transport.
describe.skipIf(process.env.CHAIN_NETWORK_TESTS !== '1')('every RPC answers (network)', () => {
  for (const order of ['presenter', 'spectator'] as const) {
    for (const e of endpointsFor(order)) {
      it(`${order}: ${e.name} serves getBlockNumber on chain 10143`, async () => {
        const res = await fetch(e.http, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }]).slice(1, -1),
        });
        const j = (await res.json()) as { result: string };
        expect(parseInt(j.result, 16)).toBe(10143);
        const bn = await fetch(e.http, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] }),
        });
        expect(BigInt(((await bn.json()) as { result: string }).result)).toBeGreaterThan(0n);
      }, 10_000);
    }
  }

  it('the failover client reads a block', async () => {
    expect(await createClientBundle({ order: 'presenter' }).client.getBlockNumber({ cacheTime: 0 })).toBeGreaterThan(0n);
    expect(await createClientBundle({ order: 'spectator' }).client.getBlockNumber({ cacheTime: 0 })).toBeGreaterThan(0n);
  }, 15_000);
});
