import { encodeAbiParameters, encodeEventTopics, toHex } from 'viem';
import type { Address, Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import type { OutcomeEvent, RumorEvent, TickSealedEvent } from '@/types';
import { runBankAbi } from './abi';
import type { ChainClient } from './clients';
import { decodeBankLogs } from './decode';
import { createSpectator } from './spectator';

const BANK: Address = '0x2cD82EE2b3C19E996Fa9da80052e912A2E90F41D';
const hash = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type EventName = 'RumorStarted' | 'TickSealed' | 'BankFailed' | 'BankSurvived' | 'BankReset';

/** A raw JSON-RPC log, built from the real ABI so the spectator's decoding is exercised for real. */
function rawLog(name: EventName, args: Record<string, unknown>, block: number, logIndex: number, address: Address = BANK) {
  const item = runBankAbi.find((i) => i.type === 'event' && i.name === name)!;
  const topics = encodeEventTopics({ abi: [item], eventName: name, args: args as never } as never);
  const data = encodeAbiParameters(
    (item.inputs as readonly { indexed: boolean; name: string; type: string; components?: never }[]).filter((i) => !i.indexed) as never,
    (item.inputs as readonly { indexed: boolean; name: string }[]).filter((i) => !i.indexed).map((i) => args[i.name]) as never,
  );
  return {
    address, topics, data, blockNumber: toHex(block), blockHash: hash(block), transactionHash: hash(block * 100 + logIndex),
    transactionIndex: '0x0', logIndex: toHex(logIndex), removed: false,
  };
}
const summary = { served: 1, skipped: 0, haircutBps: 200, queueLengthAfter: 0, paid: 5n, bondsSold: 0n, fireSaleLoss: 0n, cashAfter: 100n, bondsAfter: 200n, depositsOwedAfter: 50n };
const rumor = (runId: number, block: number) =>
  rawLog('RumorStarted', { runId, level: 0, card: 1, seedNode: 7, modelSeed: 99n, modelHash: hash(5), startBlock: BigInt(block) }, block, 0);
const tick = (runId: number, t: number, block: number, ids: number[] = [3]) =>
  rawLog('TickSealed', { runId, tick: t, requested: ids, summary }, block, t);
const failed = (runId: number, t: number, block: number) =>
  rawLog('BankFailed', { runId, tick: t, trappedCount: 4, trappedAmount: 70n, uninsuredTrapped: 60n }, block, 50);
const reset = (runId: number, block: number) => rawLog('BankReset', { runId }, block, 60);

/** A scripted chain behind a fake viem client. Asserts the ≤ 100-block getLogs rule on every call. */
function fakeChain(initialHead: number, logs: ReturnType<typeof rawLog>[]) {
  const state = { head: initialHead, logs: [...logs], calls: [] as [number, number][], failNext: 0, blockCalls: 0 };
  const client = {
    uid: `fake-${Math.random()}`,
    chain: { id: 10143 },
    async request({ method, params }: { method: string; params?: unknown[] }) {
      if (state.failNext > 0) {
        state.failNext -= 1;
        throw new Error('HTTP request failed. Status: 429');
      }
      if (method === 'eth_blockNumber') {
        state.blockCalls += 1;
        return toHex(state.head);
      }
      if (method === 'eth_getLogs') {
        const f = params![0] as { fromBlock: Hex; toBlock: Hex; address: Address };
        const from = Number(BigInt(f.fromBlock));
        const to = Number(BigInt(f.toBlock));
        state.calls.push([from, to]);
        if (to - from + 1 > 100) throw new Error('block range too large');
        return state.logs.filter((l) => Number(BigInt(l.blockNumber)) >= from && Number(BigInt(l.blockNumber)) <= to);
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  return { state, client: client as unknown as ChainClient };
}

function collect(s: ReturnType<typeof createSpectator>) {
  const out = { rumors: [] as RumorEvent[], ticks: [] as TickSealedEvent[][], outcomes: [] as OutcomeEvent[], resets: [] as number[] };
  s.onRumor((e) => out.rumors.push(e));
  s.onTicks((e) => out.ticks.push(e));
  s.onOutcome((e) => out.outcomes.push(e));
  s.onReset((e) => out.resets.push(e));
  return out;
}

describe('decodeBankLogs', () => {
  it('decodes every bank event and ignores other contracts', () => {
    const logs = [rumor(3, 10), tick(3, 1, 11), failed(3, 1, 11), reset(3, 12), tick(3, 9, 12, [1]) /* other address below */];
    const other = rawLog('TickSealed', { runId: 3, tick: 4, requested: [], summary }, 12, 9, '0x000000000000000000000000000000000000dEaD');
    const d = decodeBankLogs([...logs, other] as never, BANK);
    expect(d.rumor).toMatchObject({ runId: 3, level: 0, card: 1, seedNode: 7, modelSeed: 99n, startBlock: 10n });
    expect(d.ticks.map((t) => t.tick)).toEqual([1, 9]);
    expect(d.ticks[0]).toMatchObject({ served: 1, haircutBps: 200, paid: 5n, cashAfter: 100n, requested: [3] });
    expect(d.outcome).toMatchObject({ kind: 'failed', trappedCount: 4, trappedAmount: 70n, uninsuredTrapped: 60n });
    expect(d.reset).toBe(3);
  });
});

describe('spectator', () => {
  it('catches a viewer up on a run in progress (rumor, then its ticks), once', async () => {
    const { client } = fakeChain(2000, [rumor(2, 1900), tick(2, 1, 1901), tick(2, 2, 1902)]);
    const s = createSpectator({ client, runBank: BANK, deployBlock: 1000n, pollMs: 20 });
    const got = collect(s);
    s.start();
    await sleep(150);
    s.stop();
    expect(got.rumors.map((r) => r.runId)).toEqual([2]);
    expect(got.ticks.flat().map((t) => t.tick)).toEqual([1, 2]);
    expect(got.outcomes).toEqual([]);
  });

  it('catch-up ignores a finished-and-reset run and an older run', async () => {
    const { client } = fakeChain(2000, [rumor(1, 1800), tick(1, 1, 1801), failed(1, 1, 1801), reset(1, 1850)]);
    const s = createSpectator({ client, runBank: BANK, deployBlock: 0n, pollMs: 20 });
    const got = collect(s);
    s.start();
    await sleep(100);
    s.stop();
    expect(got.rumors).toEqual([]);
    expect(got.ticks).toEqual([]);
    expect(got.resets).toEqual([]);
  });

  it('catch-up shows a run that ended but was not reset, with its outcome', async () => {
    const { client } = fakeChain(2000, [rumor(4, 1950), tick(4, 1, 1951), failed(4, 1, 1951)]);
    const s = createSpectator({ client, runBank: BANK, deployBlock: 0n, pollMs: 20 });
    const got = collect(s);
    s.start();
    await sleep(100);
    s.stop();
    expect(got.rumors.map((r) => r.runId)).toEqual([4]);
    expect(got.outcomes.map((o) => o.kind)).toEqual(['failed']);
  });

  it('follows new blocks, never repeats an event, and chunks getLogs at ≤ 100 blocks', async () => {
    const chain = fakeChain(1000, []);
    const s = createSpectator({ client: chain.client, runBank: BANK, deployBlock: 0n, pollMs: 20, lookbackBlocks: 2000n });
    const got = collect(s);
    s.start();
    await sleep(80);
    // A burst after a long gap: 250 blocks pass with events at the start and end.
    chain.state.logs.push(rumor(5, 1010) as never, tick(5, 1, 1011) as never, tick(5, 2, 1012) as never, tick(5, 3, 1240) as never);
    chain.state.head = 1250;
    await sleep(250);
    s.stop();
    expect(got.rumors.map((r) => r.runId)).toEqual([5]);
    expect(got.ticks.flat().map((t) => t.tick)).toEqual([1, 2, 3]);
    expect(chain.state.calls.every(([a, b]) => b - a + 1 <= 100)).toBe(true);
    // contiguous, non-overlapping coverage of every block after the catch-up head
    const after = chain.state.calls.filter(([a]) => a > 1000).sort((x, y) => x[0] - y[0]);
    expect(after[0][0]).toBe(1001);
    for (let i = 1; i < after.length; i++) expect(after[i][0]).toBe(after[i - 1][1] + 1);
    expect(after[after.length - 1][1]).toBe(1250);
  });

  it('survives 429s with a backoff and keeps going', async () => {
    const chain = fakeChain(1000, []);
    const s = createSpectator({ client: chain.client, runBank: BANK, deployBlock: 0n, pollMs: 15 });
    const got = collect(s);
    s.start();
    await sleep(40);
    chain.state.failNext = 3;
    chain.state.logs.push(rumor(6, 1005) as never);
    chain.state.head = 1010;
    await sleep(500);
    s.stop();
    expect(got.rumors.map((r) => r.runId)).toEqual([6]);
  });

  it('start() twice does not double the polling, and stop() stops it', async () => {
    const chain = fakeChain(1000, []);
    const s = createSpectator({ client: chain.client, runBank: BANK, deployBlock: 0n, pollMs: 30 });
    s.start();
    s.start();
    await sleep(200);
    const calls = chain.state.blockCalls;
    s.stop();
    await sleep(120);
    expect(chain.state.blockCalls).toBe(calls);
    // one poller at 30 ms for 200 ms is ~7 calls; two would be ~14
    expect(calls).toBeLessThan(11);
  });

  it('is idle (and silent) before anything is deployed', async () => {
    const chain = fakeChain(1000, []);
    const s = createSpectator({ client: chain.client, runBank: null, pollMs: 20 });
    s.start();
    await sleep(80);
    s.stop();
    expect(chain.state.blockCalls).toBe(0);
  });
});
