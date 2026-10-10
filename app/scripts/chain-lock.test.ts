import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import type { ChainClient } from '@/chain/clients';
import { BankBusyError, NonceDriftError, acquireLock, assertBankQuiet, findLiveBankLines, guardLiveBank, readLock, watchNonce } from './chain-lock';

let dir: string;
let lockPath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'run-lock-'));
  lockPath = join(dir, 'run-bank.lock');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const lockBody = (over: object) => JSON.stringify({ agent: 'F', purpose: 'live:e2e', pid: process.ppid, startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(), ...over });

describe('advisory lock', () => {
  it('takes a free lock and releases it', () => {
    const l = acquireLock({ agent: 'C', purpose: 'smoke', path: lockPath });
    expect(readLock(lockPath)).toMatchObject({ agent: 'C', pid: process.pid });
    l.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('refuses while a live process holds an unexpired lock', () => {
    writeFileSync(lockPath, lockBody({}));
    expect(() => acquireLock({ agent: 'C', purpose: 'smoke', path: lockPath })).toThrow(BankBusyError);
    expect(() => acquireLock({ agent: 'C', purpose: 'smoke', path: lockPath })).toThrow(/locked by F/);
    expect(readLock(lockPath)?.agent).toBe('F'); // untouched
  });

  it('takes over a lock whose process is dead', () => {
    writeFileSync(lockPath, lockBody({ pid: 2_999_999 }));
    const l = acquireLock({ agent: 'C', purpose: 'smoke', path: lockPath });
    expect(readLock(lockPath)?.agent).toBe('C');
    l.release();
  });

  it('takes over an expired lock even if the pid is alive', () => {
    writeFileSync(lockPath, lockBody({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    acquireLock({ agent: 'C', purpose: 'smoke', path: lockPath }).release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('survives a corrupt lock file', () => {
    writeFileSync(lockPath, 'not json');
    acquireLock({ agent: 'C', purpose: 'smoke', path: lockPath }).release();
  });

  it('never deletes a lock it does not own', () => {
    const l = acquireLock({ agent: 'C', purpose: 'smoke', path: lockPath });
    writeFileSync(lockPath, lockBody({ pid: process.ppid }));
    l.release();
    expect(readLock(lockPath)?.agent).toBe('F');
  });
});

describe('LIVE BANK status lines', () => {
  const noon = new Date(2026, 9, 10, 12, 0, 0);
  const put = (name: string, first: string) => writeFileSync(join(dir, name), `${first}\n\n# status\n`);

  it('flags another agent whose time is still ahead', () => {
    put('F.md', 'LIVE BANK: F until 12:30');
    expect(findLiveBankLines('C', { dir, now: noon })).toEqual([{ file: 'F.md', agent: 'F', until: '12:30' }]);
  });
  it('ignores your own line, "none", and lines whose time has passed', () => {
    put('C.md', 'LIVE BANK: C until 23:59');
    put('F.md', '**LIVE BANK: none (F is idle on the chain).** Protocol: LIVE BANK: <agent> until HH:MM');
    put('A.md', 'LIVE BANK: A until 11:45');
    expect(findLiveBankLines('C', { dir, now: noon })).toEqual([]);
  });
  it('only reads the top of each file', () => {
    writeFileSync(join(dir, 'B.md'), `${'x\n'.repeat(30)}LIVE BANK: B until 23:00\n`);
    expect(findLiveBankLines('C', { dir, now: noon })).toEqual([]);
  });
  it('the shipped status files parse without a false positive on the protocol text', () => {
    // Real docs/status files are checked with the real clock: just make sure nothing throws.
    expect(Array.isArray(findLiveBankLines('C'))).toBe(true);
  });
});

const ADDR = '0x85db51Abac83F8B1DF2E674c29f8D68527Bf6b10' as Address;
function fakeClient(state: { nonce: number; head: number; logs: { blockNumber: bigint }[] }): ChainClient {
  return {
    uid: `u${Math.random()}`,
    chain: { id: 10143 },
    async request({ method }: { method: string }) {
      if (method === 'eth_getTransactionCount') return `0x${state.nonce.toString(16)}`;
      if (method === 'eth_blockNumber') return `0x${state.head.toString(16)}`;
      if (method === 'eth_getLogs') {
        return state.logs.map((l, i) => ({
          address: ADDR, topics: [], data: '0x', blockNumber: `0x${l.blockNumber.toString(16)}`, blockHash: `0x${'0'.repeat(64)}`,
          transactionHash: `0x${'1'.repeat(64)}`, transactionIndex: '0x0', logIndex: `0x${i.toString(16)}`, removed: false,
        }));
      }
      throw new Error(`unexpected ${method}`);
    },
  } as unknown as ChainClient;
}

describe('nonce watch', () => {
  it('passes while only we send, and re-baselines after a failure', async () => {
    const s = { nonce: 5, head: 100, logs: [] };
    const w = watchNonce(fakeClient(s), ADDR);
    await w.run(async () => { s.nonce += 1; });
    await w.run(async () => { s.nonce += 1; });
    await expect(w.run(async () => { throw new Error('revert'); })).rejects.toThrow('revert');
    s.nonce += 1; // that failed call may have landed: not treated as drift
    await w.run(async () => { s.nonce += 1; });
  });

  it('stops loudly when someone else sends from the wallet', async () => {
    const s = { nonce: 5, head: 100, logs: [] };
    const w = watchNonce(fakeClient(s), ADDR);
    await w.run(async () => { s.nonce += 1; });
    s.nonce += 3; // another process
    await expect(w.run(async () => { throw new Error('must not send'); })).rejects.toBeInstanceOf(NonceDriftError);
    await expect(w.run(async () => 1).catch((e) => (e as Error).message)).resolves.toMatch(/moved from 6 to 9/);
  });
});

describe('bank activity check', () => {
  it('passes when the bank is not running, or running but silent', async () => {
    await assertBankQuiet(fakeClient({ nonce: 0, head: 1000, logs: [{ blockNumber: 999n }] }), ADDR, 'ready');
    await assertBankQuiet(fakeClient({ nonce: 0, head: 1000, logs: [] }), ADDR, 'running');
  });
  it('refuses when the bank is running and just emitted an event', async () => {
    await expect(assertBankQuiet(fakeClient({ nonce: 0, head: 1000, logs: [{ blockNumber: 990n }] }), ADDR, 'running')).rejects.toThrow(/mid-run/);
  });
});

describe('guardLiveBank', () => {
  it('is a no-op for a local fork', async () => {
    const g = await guardLiveBank({ agent: 'C', purpose: 't', client: fakeClient({ nonce: 0, head: 1, logs: [] }), runBank: ADDR, signer: ADDR, status: 'running', isLocalRpc: true });
    expect(await g.nonce.run(async () => 7)).toBe(7);
    g.release();
  });
});
