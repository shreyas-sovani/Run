// Live adapter against a scripted JSON-RPC node. Covers the send path end to end: estimate → sign → sync send, and every
// way it can go wrong (timeout, late receipt, dropped tx, nonce drift, unsupported sync method, reverts, low balance).
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { decodeFunctionData, encodeErrorResult, keccak256, parseTransaction, toHex } from 'viem';
import type { Address, Hex } from 'viem';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nonceManager } from 'viem/accounts';
import { runBankAbi } from './abi';
import { deployment } from './deployment';
import { createLiveAdapter } from './liveAdapter';
import { addressOfKey } from './keys';
import { TICK_SUMMARY, hashN, rawLog } from './testkit';
import type { RawRpcLog } from './testkit';
import { translateError } from './errors';
import { createSealQueue } from './sealQueue';

// Anvil's well-known throwaway keys.
const PK1 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const PK2 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
const A1 = addressOfKey(PK1);
const A2 = addressOfKey(PK2);
const BANK = deployment.runBank as Address; // from the JSON A shipped; the fake node answers for whatever address it is
const MON = 10n ** 18n;

type SyncMode = 'ok' | 'timeout' | 'unsupported' | 'nonce-low' | 'insufficient';

class FakeNode {
  server!: Server;
  url = '';
  head = 1000;
  chainNonce = new Map<string, number>();
  balances = new Map<string, bigint>();
  receipts = new Map<string, object>();
  /** Hashes the node has "seen" but not yet confirmed (for timeout scenarios). */
  mempool = new Map<string, Hex>();
  calls: { method: string; hash?: Hex }[] = [];
  syncMode: SyncMode = 'ok';
  /** Confirm a timed-out tx after this many getTransactionReceipt polls (null: never, until re-broadcast). */
  confirmAfterPolls: number | null = null;
  polls = 0;
  estimateRevert: { name: string; args: unknown[] } | null = null;
  /** Make eth_estimateGas fail with a transport-style error (not a revert). */
  estimateBroken = false;
  runId = 1;
  bankTick = 0;
  sealedRawHashes: Hex[] = [];

  reset() {
    this.syncMode = 'ok';
    this.confirmAfterPolls = null;
    this.polls = 0;
    this.estimateRevert = null;
    this.estimateBroken = false;
    this.calls = [];
    this.receipts.clear();
    this.mempool.clear();
    this.sealedRawHashes = [];
    this.chainNonce.clear();
    this.balances.set(A1.toLowerCase(), 40n * MON);
    this.balances.set(A2.toLowerCase(), 75n * MON);
    this.bankTick = 0;
    nonceManager.reset({ address: A1, chainId: 10143 });
    nonceManager.reset({ address: A2, chainId: 10143 });
  }

  async start() {
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const msg = JSON.parse(body) as { id: number; method: string; params: unknown[] };
        let out: object;
        try {
          out = { jsonrpc: '2.0', id: msg.id, result: this.handle(msg.method, msg.params ?? []) };
        } catch (e) {
          const err = e as { code?: number; message: string; data?: unknown };
          out = { jsonrpc: '2.0', id: msg.id, error: { code: err.code ?? -32000, message: err.message, data: err.data } };
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(out));
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    const addr = this.server.address();
    this.url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  }
  stop() { this.server.close(); }

  private rpcError(code: number, message: string, data?: unknown): never {
    throw Object.assign(new Error(message), { code, data });
  }

  /** Mine `raw`: build a receipt (with the TickSealed logs the real contract would emit for sealTicks). */
  private mine(raw: Hex): object {
    const tx = parseTransaction(raw);
    const hash = keccak256(raw);
    this.head += 1;
    const from = A1; // the fake node never recovers the sender; nonce bookkeeping is per call below
    const logs: RawRpcLog[] = [];
    const dec = decodeFunctionData({ abi: runBankAbi, data: tx.data as Hex });
    if (dec.functionName === 'sealTicks') {
      const [first, ticks] = dec.args as [number, number[][]];
      ticks.forEach((ids, i) => {
        logs.push(rawLog(BANK, 'TickSealed', { runId: this.runId, tick: first + i, requested: ids, summary: TICK_SUMMARY }, this.head, i, hash));
      });
      this.bankTick = first + ticks.length - 1;
    }
    if (dec.functionName === 'startRumor') {
      const [card, seed, modelSeed, modelHash] = dec.args as [number, number, bigint, Hex];
      logs.push(rawLog(BANK, 'RumorStarted', { runId: this.runId, level: 0, card, seedNode: seed, modelSeed, modelHash, startBlock: BigInt(this.head) }, this.head, 0, hash));
    }
    const receipt = {
      transactionHash: hash, transactionIndex: '0x0', blockHash: hashN(this.head), blockNumber: toHex(this.head), from, to: tx.to,
      cumulativeGasUsed: toHex(tx.gas ?? 0n), gasUsed: toHex(tx.gas ?? 0n), effectiveGasPrice: toHex(102_000_000_000n), status: '0x1',
      type: '0x2', contractAddress: null, logsBloom: `0x${'0'.repeat(512)}`, logs,
    };
    this.receipts.set(hash, receipt);
    this.mempool.delete(hash);
    this.sealedRawHashes.push(hash);
    return receipt;
  }

  private handle(method: string, params: unknown[]): unknown {
    const hash = typeof params[0] === 'string' && method.startsWith('eth_sendRaw') ? keccak256(params[0] as Hex) : undefined;
    this.calls.push({ method, hash });
    switch (method) {
      case 'eth_chainId': return '0x279f';
      case 'eth_blockNumber': return toHex(this.head);
      case 'eth_getBalance': return toHex(this.balances.get(String(params[0]).toLowerCase()) ?? 0n);
      case 'eth_getTransactionCount': return toHex(this.chainNonce.get(String(params[0]).toLowerCase()) ?? 0);
      case 'eth_getBlockByNumber': return { number: toHex(this.head), hash: hashN(this.head), baseFeePerGas: toHex(100_000_000_000n), timestamp: '0x1', transactions: [], gasLimit: toHex(200_000_000n), gasUsed: '0x0' };
      case 'eth_maxPriorityFeePerGas': return toHex(2_000_000_000n);
      case 'eth_gasPrice': return toHex(102_000_000_000n);
      case 'eth_estimateGas': {
        if (this.estimateBroken) this.rpcError(-32000, 'upstream request timeout');
        if (this.estimateRevert) {
          const data = encodeErrorResult({ abi: runBankAbi, errorName: this.estimateRevert.name, args: this.estimateRevert.args } as never);
          this.rpcError(3, 'execution reverted', data);
        }
        return toHex(100_000n);
      }
      case 'eth_sendRawTransactionSync': {
        const raw = params[0] as Hex;
        if (this.syncMode === 'unsupported') this.rpcError(-32601, 'the method eth_sendRawTransactionSync does not exist/is not available');
        if (this.syncMode === 'nonce-low') this.rpcError(-32000, 'nonce too low: next nonce 9, tx nonce 3');
        if (this.syncMode === 'insufficient') this.rpcError(-32000, 'insufficient funds for gas * price + value');
        if (this.syncMode === 'timeout') {
          this.mempool.set(keccak256(raw), raw);
          this.rpcError(4, 'Transaction was added to mempool but wasn\'t processed within the designated timeout');
        }
        this.bump(raw);
        return this.mine(raw);
      }
      case 'eth_sendRawTransaction': {
        const raw = params[0] as Hex;
        const h = keccak256(raw);
        if (this.receipts.has(h) || this.mempool.has(h)) {
          if (this.mempool.has(h)) this.mine(raw); // a re-broadcast gets it included
          this.rpcError(-32000, 'already known');
        }
        this.bump(raw);
        this.mine(raw);
        return h;
      }
      case 'eth_getTransactionReceipt': {
        const h = String(params[0]);
        this.polls += 1;
        if (!this.receipts.has(h) && this.mempool.has(h) && this.confirmAfterPolls !== null && this.polls >= this.confirmAfterPolls) {
          this.mine(this.mempool.get(h)!);
        }
        return this.receipts.get(h) ?? null;
      }
      case 'eth_call': {
        this.rpcError(-32000, 'eth_call not scripted');
      }
      default:
        return this.rpcError(-32601, `unscripted ${method}`);
    }
  }

  private bump(raw: Hex) {
    const tx = parseTransaction(raw);
    // The fake node trusts the nonce the client chose; track the highest to answer getTransactionCount.
    const key = A1.toLowerCase();
    this.chainNonce.set(key, Math.max(this.chainNonce.get(key) ?? 0, (tx.nonce ?? 0) + 1));
  }
}

const node = new FakeNode();
beforeAll(async () => { await node.start(); });
afterAll(() => { node.stop(); });
beforeEach(() => { node.reset(); });

const make = (extra: { backup?: boolean; syncSend?: boolean } = {}) =>
  createLiveAdapter({ primaryPk: PK1, backupPk: extra.backup ? PK2 : null, rpcOverride: node.url, syncSend: extra.syncSend });
const sends = () => node.calls.filter((c) => c.method === 'eth_sendRawTransactionSync' || c.method === 'eth_sendRawTransaction');

describe('live adapter send path', () => {
  it('estimate + 10%, sync send, decodes the receipt into SealResult events', async () => {
    const a = make();
    const r = await a.sealTicks(1, [[3, 9], [], [20]]);
    expect(r.record).toMatchObject({ kind: 'ticks', simulated: false, status: 'sealed', fromTick: 1, toTick: 3, requestedCount: 3, gasLimit: 110_000n });
    expect(r.record.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.ticks.map((t) => [t.tick, t.requested])).toEqual([[1, [3, 9]], [2, []], [3, [20]]]);
    expect(r.ticks[0]).toMatchObject({ runId: 1, served: 1, haircutBps: 200, paid: 5n });
    expect(r.outcome).toBeNull();
    expect(sends().map((c) => c.method)).toEqual(['eth_sendRawTransactionSync']);
    expect(a.gasLog).toHaveLength(1);
    expect(a.gasLog[0]).toMatchObject({ ticks: 3, ids: 3, estimate: 100_000n, gasLimit: 110_000n, mode: 'estimate' });
  });

  it('startRumor returns the RumorStarted event', async () => {
    const r = await make().startRumor({ level: 0, card: 2, seedNode: 17, modelSeed: 123n }, hashN(7));
    expect(r.rumor).toMatchObject({ runId: 1, card: 2, seedNode: 17, modelSeed: 123n, modelHash: hashN(7) });
  });

  it('refuses to start a run below 10.5 MON, with the backup-key message', async () => {
    node.balances.set(A1.toLowerCase(), 10n * MON);
    const err = await make({ backup: true }).startRumor({ level: 0, card: 0, seedNode: 1, modelSeed: 1n }, hashN(1)).catch((e) => e);
    const ui = translateError(err);
    expect(ui.detail).toBe('The operator wallet is low on MON (10.00 MON). Switch to the backup key.');
    expect(ui.action?.run).toBe('backup');
    expect(sends()).toHaveLength(0);
  });

  it('a revert at estimate time surfaces as the RunBank error, and nothing is sent or charged', async () => {
    node.estimateRevert = { name: 'WrongStatus', args: [1, 2] };
    const err = await make().sealTicks(1, [[1]]).catch((e) => e);
    expect(translateError(err).detail).toBe('The bank is failed. Reset the bank first.');
    expect(sends()).toHaveLength(0);
  });

  it('a failing estimateGas (transport trouble, not a revert) does not block the send: A\'s fixed limits take over', async () => {
    node.estimateBroken = true;
    const a = make();
    const ping = await a.ping();
    expect(ping.record).toMatchObject({ status: 'sealed', gasLimit: 80_000n });
    const sealed = await a.sealTicks(1, [[1]]);
    expect(sealed.record.status).toBe('sealed');
    expect(sealed.record.gasLimit).toBeGreaterThan(100_000n);
    expect(a.gasLog[0].estimate).toBeNull();
    expect(a.gasLog[0].mode).toBe('formula');
  }, 20_000);

  it('consecutive sends use consecutive nonces', async () => {
    const a = make();
    await a.ping();
    await a.ping();
    await a.ping();
    const nonces = node.calls.filter((c) => c.method === 'eth_sendRawTransactionSync').length;
    expect(nonces).toBe(3);
    expect(node.chainNonce.get(A1.toLowerCase())).toBe(3);
  });

  it('serialises writes: a ping fired during sealTicks queues behind it (no nonce race)', async () => {
    const a = make();
    const [x, y, z] = await Promise.all([a.sealTicks(1, [[1]]), a.ping(), a.sealTicks(2, [[2]])]);
    expect([x.record.kind, y.record.kind, z.record.kind]).toEqual(['ticks', 'ping', 'ticks']);
    expect(node.chainNonce.get(A1.toLowerCase())).toBe(3);
  });

  it('switchToBackup changes who signs; false without a backup key', async () => {
    expect(make().switchToBackup()).toBe(false);
    const a = make({ backup: true });
    expect(a.operator).toBe(A1);
    expect(a.switchToBackup()).toBe(true);
    expect(a.operator).toBe(A2);
    expect(a.usingBackup).toBe(true);
  });
});

describe('live adapter timeouts', () => {
  it('sync timeout, then the tx confirms: found by receipt lookup, NOT sent twice', async () => {
    node.syncMode = 'timeout';
    node.confirmAfterPolls = 3;
    const r = await make().sealTicks(1, [[5]]);
    expect(r.record.status).toBe('sealed');
    expect(r.ticks).toHaveLength(1);
    expect(sends().map((c) => c.method)).toEqual(['eth_sendRawTransactionSync']);
  });

  it('sync timeout and the tx vanished: re-broadcasts the SAME signed tx (same hash) and succeeds', async () => {
    node.syncMode = 'timeout';
    node.confirmAfterPolls = null; // only a re-broadcast gets it mined
    const r = await make().sealTicks(1, [[5]]);
    const s = sends();
    expect(s.map((c) => c.method)).toEqual(['eth_sendRawTransactionSync', 'eth_sendRawTransaction']);
    expect(s[1].hash).toBe(s[0].hash);
    expect(r.record.txHash).toBe(s[0].hash);
  }, 20_000);

  it('a retry after ChainTimeoutError re-broadcasts the held tx instead of signing a new one', async () => {
    const a = make();
    node.syncMode = 'timeout';
    // Never confirms, and the re-broadcast is also swallowed: the call gives up with a timeout.
    const origHandle = (node as unknown as { handle: (m: string, p: unknown[]) => unknown }).handle.bind(node);
    (node as unknown as { handle: (m: string, p: unknown[]) => unknown }).handle = (m, p) => {
      if (m === 'eth_sendRawTransaction') { node.calls.push({ method: m, hash: keccak256(p[0] as Hex) }); throw Object.assign(new Error('already known'), { code: -32000 }); }
      return origHandle(m, p);
    };
    const err = await a.sealTicks(1, [[5]]).catch((e) => e);
    expect(translateError(err).code).toBe('timeout');
    const firstHash = sends()[0].hash;
    // Restore a healthy node: the retry must reuse the same signed tx and find / re-send it.
    (node as unknown as { handle: unknown }).handle = origHandle;
    node.syncMode = 'ok';
    node.confirmAfterPolls = 1;
    const r = await a.sealTicks(1, [[5]]);
    expect(r.record.txHash).toBe(firstHash);
    expect(new Set(node.sealedRawHashes).size).toBe(1);
  }, 30_000);

  it('through the SealQueue a timeout is invisible to the screen: same batch, one landing, no error', async () => {
    node.syncMode = 'timeout';
    node.confirmAfterPolls = 2;
    const q = createSealQueue(make(), { retryDelayMs: 5 });
    const errors: string[] = [];
    const ticks: number[] = [];
    q.onError((e) => errors.push(e.code));
    q.onSealed((r) => ticks.push(...r.ticks.map((t) => t.tick)));
    q.push({ tick: 1, requested: [4] });
    q.push({ tick: 2, requested: [6] });
    await q.drain();
    q.stop();
    expect(errors).toEqual([]);
    expect(ticks).toEqual([1, 2]);
  }, 20_000);
});

describe('live adapter fallbacks and resync', () => {
  it('falls back to sendRawTransaction + receipt polling when the sync method is unsupported, and remembers', async () => {
    node.syncMode = 'unsupported';
    const a = make();
    await a.ping();
    await a.ping();
    const m = sends().map((c) => c.method);
    expect(m).toEqual(['eth_sendRawTransactionSync', 'eth_sendRawTransaction', 'eth_sendRawTransaction']);
  });

  it('syncSend: false never tries the sync method', async () => {
    await make({ syncSend: false }).ping();
    expect(sends().map((c) => c.method)).toEqual(['eth_sendRawTransaction']);
  });

  it('nonce too low is resynced silently and the send succeeds on the second try', async () => {
    node.syncMode = 'nonce-low';
    const a = make();
    // Flip to healthy after the first rejection.
    const origHandle = (node as unknown as { handle: (m: string, p: unknown[]) => unknown }).handle.bind(node);
    (node as unknown as { handle: (m: string, p: unknown[]) => unknown }).handle = (m, p) => {
      try { return origHandle(m, p); } finally { if (m === 'eth_sendRawTransactionSync') node.syncMode = 'ok'; }
    };
    node.chainNonce.set(A1.toLowerCase(), 9);
    const r = await a.ping();
    (node as unknown as { handle: unknown }).handle = origHandle;
    expect(r.record.status).toBe('sealed');
    expect(sends().filter((c) => c.method === 'eth_sendRawTransactionSync')).toHaveLength(2);
  });

  it('insufficient funds reaches the UI as "switch to backup", and the nonce is released', async () => {
    node.syncMode = 'insufficient';
    const a = make({ backup: true });
    const err = await a.ping().catch((e) => e);
    expect(translateError(err).action?.run).toBe('backup');
    node.syncMode = 'ok';
    expect(a.switchToBackup()).toBe(true);
    await expect(a.ping()).resolves.toMatchObject({ record: { status: 'sealed' } });
  });
});
