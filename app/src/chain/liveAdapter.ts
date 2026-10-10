// Live adapter (PRD §12, C-03). Signs locally, sends with `eth_sendRawTransactionSync`, and keeps the signed tx so a
// timeout can be settled by receipt lookup and an identical re-broadcast. Monad charges the gas LIMIT, so every send
// is tightly sized (PRD §12.3). Keys never appear in errors, logs or return values.
import { encodeFunctionData, keccak256 } from 'viem';
import type { Abi, Address, Hex, TransactionReceipt } from 'viem';
import { nonceManager, privateKeyToAccount } from 'viem/accounts';
import {
  estimateContractGas,
  estimateFeesPerGas,
  getBalance,
  getBlockNumber,
  getLogs,
  getTransactionReceipt,
  prepareTransactionRequest,
  readContract,
  sendRawTransaction,
  sendRawTransactionSync,
  call,
} from 'viem/actions';
import { CHAIN_LIMITS } from '@/config/network';
import type {
  BankConfig,
  BankLevel,
  BankSnapshotView,
  Model,
  PreflightReport,
  RunParams,
  SealRecord,
  SealResult,
  TxKind,
} from '@/types';
import { callGas, gasLimitFor } from './gasModel';
import { erc20Abi, runBankAbi } from './abi';
import { createBlockFeed } from './blocks';
import type { BlockFeed } from './blocks';
import { createWsClient, getPublicBundle, getSendBundle, monadChain } from './clients';
import type { ChainClient } from './clients';
import { decodeBankLogs, decodeSnapshot } from './decode';
import type { RawSnapshot } from './decode';
import { deployment } from './deployment';
import {
  ChainTimeoutError,
  LowBalanceError,
  RunBankRevert,
  extractRevert,
  isAlreadyKnown,
  isInsufficientFunds,
  isNonceTooLow,
  isReserveBalance,
  isTimeout,
} from './errors';
import { runPreflight } from './preflight';
import type { BlockInfo, GasLogEntry, GasMode, LiveAdapter } from './types';

const noDeployment = () =>
  new Error('No contract deployed yet. Agent A writes the address to deployment.testnet.json.');

const isUnsupportedMethod = (e: unknown): boolean => {
  const code = (e as { code?: number } | null)?.code;
  const msg = e instanceof Error ? `${e.message} ${(e as { details?: string }).details ?? ''}` : String(e);
  // -32602: anvil knows the method but rejects the `timeout` parameter. Either way, use send + receipt polling.
  return code === -32601 || code === -32602 || /method not found|does not exist|not supported|unsupported|unknown method|not available/i.test(msg);
};

/** EIP-7966: error code 4 = added to the mempool but not processed in time. */
const isSyncTimeout = (e: unknown): boolean => (e as { code?: number } | null)?.code === 4 || isTimeout(e);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pct = (v: bigint, p: bigint) => (v * p) / 100n;
const distinctSlots = (ticks: number[][]) => new Set(ticks.flat().map((id) => id >> 3)).size;

interface Call {
  to: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

interface SendMeta {
  kind: TxKind;
  fromTick?: number | null;
  toTick?: number | null;
  requestedCount?: number | null;
  /** If set (and `gasMode === 'formula'`), use this instead of estimating. */
  formulaGas?: bigint;
  /** Used when `estimateGas` itself fails for a transport reason (not a revert): never block a send on a flaky estimate. */
  fallbackGas?: bigint;
  ticks?: number[][];
}

interface Held {
  raw: Hex;
  hash: Hex;
  at: number;
  gas: bigint;
}

export function createLiveAdapter(opts: {
  primaryPk: Hex;
  backupPk?: Hex | null;
  rpcOverride?: string | null;
  /** Additive: false forces the `sendRawTransaction` + receipt polling path (tests the anvil-style fallback). Default true. */
  syncSend?: boolean;
}): LiveAdapter {
  const reads = getPublicBundle(opts.rpcOverride);
  const sends = getSendBundle(opts.rpcOverride);
  const client: ChainClient = reads.client;
  const sendClient: ChainClient = sends.client;

  const primary = privateKeyToAccount(opts.primaryPk, { nonceManager });
  const backup = opts.backupPk ? privateKeyToAccount(opts.backupPk, { nonceManager }) : null;
  let account = primary;
  // Gas for `sealTicks` (PRD §12.3). Default 'formula': A's calibrated envelope with the speed-bump queue length we saw in
  // the last TickSealed event, so a send needs no `eth_estimateGas` round trip (100–250 ms of a ~1 s batch). The
  // envelope sits above every measured sample, including the batch that contains the failing tick (the tight level-0 fit
  // does not). If a batch still runs out of gas, it is retried once with double the limit and the rest of the run falls
  // back to 'estimate' (estimateGas + 10%). Fixed-cost calls (setLevel, startRumor, reset, ping) always estimate: they are
  // off the hot path, and estimating surfaces a revert before anything is charged.
  let gasMode: GasMode = 'formula';
  /** Speed-bump queue length after the last sealed tick: A's formula needs it (the queue drains on later ticks). */
  let lastQueueAfter = 0;
  let syncSupported = opts.syncSend !== false;
  let nextId = 1;
  const gasLog: GasLogEntry[] = [];
  let feeCache: { at: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | null = null;
  /** Signed-but-unconfirmed txs by calldata, so a retry re-broadcasts the same tx instead of signing a new one. */
  const held = new Map<string, Held>();

  let feed: BlockFeed | null = null;
  const blockFeed = (): BlockFeed => (feed ??= createBlockFeed({ client, ws: () => createWsClient(opts.rpcOverride) }));

  // One write at a time: a ping from the UI must never race a sealTicks for the nonce.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  const bank = (): Address => {
    if (!deployment.runBank) throw noDeployment();
    return deployment.runBank;
  };

  const resetNonce = () => nonceManager.reset({ address: account.address, chainId: monadChain.id });

  async function fees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    if (feeCache && Date.now() - feeCache.at < 10_000) return feeCache;
    const f = await estimateFeesPerGas(client, { chain: monadChain });
    feeCache = { at: Date.now(), maxFeePerGas: f.maxFeePerGas ?? 0n, maxPriorityFeePerGas: f.maxPriorityFeePerGas ?? 0n };
    return feeCache;
  }

  async function findReceipt(hash: Hex, withinMs: number): Promise<TransactionReceipt | null> {
    const until = Date.now() + withinMs;
    for (;;) {
      try {
        return await getTransactionReceipt(client, { hash });
      } catch {
        /* not found yet (or an RPC blip): keep polling until the deadline */
      }
      if (Date.now() >= until) return null;
      await sleep(200);
    }
  }

  async function broadcast(raw: Hex, hash: Hex, tick: number | null): Promise<TransactionReceipt> {
    if (syncSupported) {
      try {
        return await sendRawTransactionSync(sendClient, { serializedTransaction: raw, timeout: CHAIN_LIMITS.syncTimeoutMs });
      } catch (e) {
        if (isUnsupportedMethod(e)) {
          syncSupported = false; // e.g. a local anvil fork: use send + receipt polling from now on
        } else if (isAlreadyKnown(e) || isNonceTooLow(e)) {
          const r = await findReceipt(hash, 1200);
          if (r) return r;
          throw e;
        } else if (isSyncTimeout(e)) {
          return settle(raw, hash, tick);
        } else {
          throw e;
        }
      }
    }
    try {
      await sendRawTransaction(sendClient, { serializedTransaction: raw });
    } catch (e) {
      if (isAlreadyKnown(e) || isNonceTooLow(e)) {
        const r = await findReceipt(hash, 1200);
        if (r) return r;
      }
      throw e;
    }
    const r = await findReceipt(hash, 12_000);
    if (r) return r;
    throw new ChainTimeoutError(tick);
  }

  /** Timed out: look the receipt up, and if it still isn't there after ~2 blocks re-broadcast the same signed tx. */
  async function settle(raw: Hex, hash: Hex, tick: number | null): Promise<TransactionReceipt> {
    const early = await findReceipt(hash, CHAIN_LIMITS.blockTimeMs * 2 + 200);
    if (early) return early;
    try {
      await sendRawTransaction(sendClient, { serializedTransaction: raw });
    } catch (e) {
      if (!isAlreadyKnown(e) && !isNonceTooLow(e)) throw e;
    }
    const late = await findReceipt(hash, 8000);
    if (late) return late;
    throw new ChainTimeoutError(tick);
  }

  /**
   * Replay a reverted tx at the previous block to learn why. A RunBank error means a real revert. If the replay (with no gas
   * cap) SUCCEEDS, the transaction ran out of gas: Monad receipts always say gasUsed == gasLimit, so that is the only tell.
   */
  async function revertReason(receipt: TransactionReceipt, c: Call, data: Hex): Promise<{ error: Error; outOfGas: boolean }> {
    try {
      await call(client, { account: account.address, to: c.to, data, blockNumber: receipt.blockNumber - 1n });
      return { error: new Error('Transaction ran out of gas onchain'), outOfGas: true };
    } catch (e) {
      const rv = extractRevert(e);
      if (rv) return { error: new RunBankRevert(rv.name, rv.args, null, { cause: e }), outOfGas: false };
    }
    return { error: new Error('Transaction reverted onchain'), outOfGas: false };
  }

  async function send(c: Call, meta: SendMeta): Promise<{ record: SealRecord; receipt: TransactionReceipt }> {
    const data = encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args as never });
    const heldKey = `${c.to}:${data}`;
    const sentAtMs = Date.now();
    const tick = meta.fromTick ?? null;

    /** 100 = as computed; 200 after an out-of-gas revert (one retry with double the limit). */
    let boost = 100n;
    /** After an out-of-gas retry the new limit is never below the one that just failed. */
    let floorGas = 0n;
    for (let attempt = 0; attempt < 2; attempt++) {
      let estimate: bigint | null = null;
      let gas: bigint;
      let raw: Hex;
      let hash: Hex;

      const reuse = held.get(heldKey);
      if (reuse && Date.now() - reuse.at < 60_000) {
        // A previous attempt timed out: it may have landed in the meantime.
        const r = await findReceipt(reuse.hash, 600);
        if (r) {
          held.delete(heldKey);
          return finish(r, reuse.gas, estimate, meta, sentAtMs);
        }
        ({ raw, hash, gas } = reuse);
      } else {
        if (reuse) {
          held.delete(heldKey);
          resetNonce();
        }
        if (gasMode === 'formula' && meta.formulaGas !== undefined) {
          gas = meta.formulaGas;
        } else {
          // Also surfaces reverts (WrongStatus, TickMismatch, …) before anything is sent or charged.
          try {
            estimate = await estimateContractGas(client, {
              address: c.to, abi: c.abi, functionName: c.functionName, args: c.args as never, account: account.address,
            } as never);
            gas = pct(estimate, 110n);
          } catch (e) {
            // A revert or an empty wallet must surface; a slow or failing estimate must not stop the send.
            const fallback = meta.fallbackGas ?? meta.formulaGas;
            if (fallback === undefined || extractRevert(e) || isInsufficientFunds(e) || isReserveBalance(e)) throw e;
            estimate = null;
            gas = fallback;
          }
        }
        if (floorGas > gas) gas = floorGas;
        if (boost > 100n) gas = (gas * boost) / 100n > 30_000_000n ? 30_000_000n : (gas * boost) / 100n;
        const f = await fees();
        const req = await prepareTransactionRequest(client, {
          account, chain: monadChain, to: c.to, data, gas, type: 'eip1559',
          maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: f.maxPriorityFeePerGas,
          parameters: ['nonce', 'chainId', 'type'],
        } as never);
        raw = await account.signTransaction(req as never);
        hash = keccak256(raw);
        held.set(heldKey, { raw, hash, at: Date.now(), gas });
      }

      let receipt: TransactionReceipt;
      try {
        receipt = await broadcast(raw, hash, tick);
      } catch (e) {
        if (e instanceof ChainTimeoutError) throw e; // keep `held`: the retry re-broadcasts the same tx
        held.delete(heldKey);
        resetNonce(); // the tx was not accepted, so don't leave a nonce gap
        if (isNonceTooLow(e) && attempt === 0) continue; // resynced: sign again once, silently
        throw e;
      }
      held.delete(heldKey);

      if (receipt.status === 'reverted') {
        const why = await revertReason(receipt, c, data);
        if (why.outOfGas && attempt === 0) {
          gasMode = 'estimate'; // a formula that was too tight: use estimates for the rest of the run
          boost = 200n; // and this send gets double the limit, so one bad estimate cannot stall a run
          floorGas = gas;
          continue;
        }
        throw why.error;
      }
      return finish(receipt, gas, estimate, meta, sentAtMs);
    }
    throw new Error('Sending failed after a resync');
  }

  function finish(
    receipt: TransactionReceipt, gas: bigint, estimate: bigint | null, meta: SendMeta, sentAtMs: number,
  ): { record: SealRecord; receipt: TransactionReceipt } {
    const record: SealRecord = {
      id: nextId++, kind: meta.kind, simulated: false,
      fromTick: meta.fromTick ?? null, toTick: meta.toTick ?? null, requestedCount: meta.requestedCount ?? null,
      txHash: receipt.transactionHash, blockNumber: receipt.blockNumber, sentAtMs, sealedAtMs: Date.now(),
      gasLimit: gas, gasUsed: receipt.gasUsed, status: 'sealed', finalized: false, mirrorMatch: null, rpc: sends.lastRpc(),
    };
    if (meta.kind === 'ticks' && meta.ticks) {
      const entry: GasLogEntry = {
        at: Date.now(), ticks: meta.ticks.length, ids: meta.ticks.reduce((n, t) => n + t.length, 0),
        distinctSlots: distinctSlots(meta.ticks), estimate, formula: meta.formulaGas ?? gasLimitFor(meta.ticks), gasLimit: gas,
        gasUsed: receipt.gasUsed, mode: estimate === null ? 'formula' : 'estimate', txHash: receipt.transactionHash,
      };
      gasLog.push(entry);
      if (gasLog.length > 200) gasLog.shift();
      console.debug('[gas]', JSON.stringify(entry, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    }
    return { record, receipt };
  }

  const bankCall = (functionName: string, args: readonly unknown[]): Call => ({ to: bank(), abi: runBankAbi as Abi, functionName, args });

  const FALLBACK_GAS: Record<TxKind, bigint> = {
    setLevel: callGas.setLevel, rumor: callGas.startRumor, reset: callGas.reset, ping: 80_000n, fund: 120_000n,
    loadLedger: callGas.loadLedger, ticks: 0n,
  };

  async function plain(kind: TxKind, c: Call): Promise<SealResult> {
    return serial(async () => {
      const { record, receipt } = await send(c, { kind, fallbackGas: FALLBACK_GAS[kind] });
      const d = decodeBankLogs(receipt.logs, deployment.runBank ?? bank());
      return { record, rumor: d.rumor, ticks: d.ticks, outcome: d.outcome };
    });
  }

  async function readSnapshot(): Promise<BankSnapshotView> {
    const address = bank();
    const [s, n] = await Promise.all([
      readContract(client, { address, abi: runBankAbi, functionName: 'snapshot' }),
      getBlockNumber(client, { cacheTime: 0 }).catch(() => null),
    ]);
    const view = decodeSnapshot(s as unknown as RawSnapshot, n);
    lastQueueAfter = view.status === 'running' ? view.queueLength : 0;
    return view;
  }

  const adapter: LiveAdapter = {
    kind: 'live',
    get operator() { return account.address; },
    get gasLog() { return gasLog; },
    get usingBackup() { return account === backup; },
    primaryAddress: primary.address,
    backupAddress: backup?.address ?? null,
    get gasMode() { return gasMode; },
    set gasMode(m: GasMode) { gasMode = m; },
    lastRpc: () => sends.lastRpc() ?? reads.lastRpc(),

    preflight(model: Model): Promise<PreflightReport> {
      return runPreflight({
        model,
        client,
        endpoints: reads.endpoints,
        blockFeed: blockFeed(),
        primary: primary.address,
        backup: backup?.address ?? null,
        active: account.address,
        readSnapshot,
        ping: () => adapter.ping(),
      });
    },

    readSnapshot,

    async setLevel(level: BankLevel, cfg: BankConfig) {
      const r = await plain('setLevel', bankCall('setLevel', [level, cfg]));
      lastQueueAfter = 0;
      return r;
    },

    async startRumor(params: RunParams, modelHash: Hex) {
      // Below 10.5 MON Monad's reserve rule throttles sends to one per 3 blocks: refuse before a run, not during it.
      const bal = await getBalance(client, { address: account.address });
      if (bal < CHAIN_LIMITS.refuseMonWei) throw new LowBalanceError(bal, 'refuse');
      lastQueueAfter = 0;
      return plain('rumor', bankCall('startRumor', [params.card, params.seedNode, params.modelSeed, modelHash]));
    },

    sealTicks(firstTick: number, ticks: number[][]) {
      // No `speedBump` option: the safe envelope. Only `queued` is passed.
      const formulaGas = gasLimitFor(ticks, { queued: lastQueueAfter });
      const requestedCount = ticks.reduce((n, t) => n + t.length, 0);
      return serial(async () => {
        const { record, receipt } = await send(bankCall('sealTicks', [firstTick, ticks]), {
          kind: 'ticks', fromTick: firstTick, toTick: firstTick + ticks.length - 1, requestedCount, formulaGas, ticks,
          // If estimating fails, use the generous envelope: the tight level-0 fit can sit below a batch that contains the failing tick.
          fallbackGas: gasLimitFor(ticks),
        });
        const d = decodeBankLogs(receipt.logs, bank());
        const last = d.ticks.length ? d.ticks[d.ticks.length - 1].tick : record.toTick;
        lastQueueAfter = d.outcome ? 0 : d.ticks.length ? d.ticks[d.ticks.length - 1].queueLengthAfter : lastQueueAfter;
        return { record: { ...record, toTick: last }, rumor: null, ticks: d.ticks, outcome: d.outcome };
      });
    },

    async reset() {
      const r = await plain('reset', bankCall('reset', []));
      lastQueueAfter = 0;
      return r;
    },
    ping: () => plain('ping', bankCall('ping', [])),

    fundBank(amount: bigint) {
      return plain('fund', { to: deployment.ausd, abi: erc20Abi as Abi, functionName: 'transfer', args: [bank(), amount] });
    },

    async balances() {
      const [p, b] = await Promise.all([
        getBalance(client, { address: primary.address }),
        backup ? getBalance(client, { address: backup.address }) : Promise.resolve(null),
      ]);
      return { primary: p, backup: b };
    },

    switchToBackup() {
      if (!backup) return false;
      account = backup;
      feeCache = null;
      held.clear();
      return true;
    },

    watchBlocks(cb: (b: BlockInfo) => void) {
      return blockFeed().watch(cb);
    },

    async recoverTicks(fromTick: number, toTick: number): Promise<SealResult | null> {
      const address = bank();
      const snap = await readSnapshot();
      const latest = snap.readAtBlock ?? (await getBlockNumber(client, { cacheTime: 0 }));
      // The run started at `startBlock`; its ticks are within the last few dozen blocks, so chunk ≤ 100 backwards.
      let to = latest;
      const floor = snap.startBlock > 0n ? snap.startBlock : latest > 300n ? latest - 300n : 0n;
      const found = new Map<number, ReturnType<typeof decodeBankLogs>['ticks'][number]>();
      let outcome: SealResult['outcome'] = null;
      while (to >= floor && [...Array(toTick - fromTick + 1).keys()].some((i) => !found.has(fromTick + i))) {
        const from = to - CHAIN_LIMITS.getLogsRange + 1n > floor ? to - CHAIN_LIMITS.getLogsRange + 1n : floor;
        const logs = await getLogs(client, { address, fromBlock: from, toBlock: to });
        const d = decodeBankLogs(logs, address);
        for (const t of d.ticks) if (t.runId === snap.runId && t.tick >= fromTick && t.tick <= toTick) found.set(t.tick, t);
        if (d.outcome && d.outcome.runId === snap.runId && d.outcome.tick <= toTick) outcome = d.outcome;
        if (from === floor) break;
        to = from - 1n;
      }
      const ticks = [...found.values()].sort((a, b) => a.tick - b.tick);
      if (ticks.length !== toTick - fromTick + 1) return null;
      const last = ticks[ticks.length - 1];
      const receipt = await getTransactionReceipt(client, { hash: last.txHash });
      const record: SealRecord = {
        id: nextId++, kind: 'ticks', simulated: false, fromTick, toTick,
        requestedCount: ticks.reduce((n, t) => n + t.requested.length, 0), txHash: last.txHash, blockNumber: last.blockNumber,
        sentAtMs: Date.now(), sealedAtMs: Date.now(), gasLimit: null, gasUsed: receipt.gasUsed, status: 'sealed',
        finalized: false, mirrorMatch: null, rpc: reads.lastRpc(),
      };
      return { record, rumor: null, ticks, outcome };
    },

    dispose() {
      feed = null;
    },
  };
  return adapter;
}
