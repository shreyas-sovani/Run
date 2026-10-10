// Single-writer guard for the shared testnet bank (agreed with A and F, 13:45).
//
// Several processes send transactions from the same wallets to the same RunBank (smoke tests, `live:e2e`, Foundry
// calibration runs). Interleaved resets and moving nonces ruin each other's runs. Anything that WRITES to the live bank
// should call `guardLiveBank()` first. It refuses to start when:
//   1. another live process holds the advisory lock `/tmp/run-bank.lock` (pid alive, not expired), or
//   2. another agent has a `LIVE BANK: <agent> until HH:MM` line (HH:MM still ahead) in the first lines of docs/status/*.md, or
//   3. the bank is `Running` and emitted an event within the last ~100 blocks (~40 s): someone is mid-run.
// While it holds the lock, `watchNonce()` fails loudly if the signing wallet's nonce moves without us: someone else is sending.
//
// Local forks (anvil) are isolated and exempt: pass `isLocalRpc: true` and nothing is checked.
//
//   import { guardLiveBank } from './chain-lock';
//   const guard = await guardLiveBank({ agent: 'F', purpose: 'live:e2e', client, runBank, signer });
//   try { ...send transactions, wrap each in guard.nonce.run(() => adapter.ping()) ... } finally { guard.release(); }
import { closeSync, existsSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Address } from 'viem';
import type { ChainClient } from '@/chain/clients';
import { getBlockNumber, getLogs, getTransactionCount } from 'viem/actions';

// A fixed path, so every agent and every shell agrees on it (os.tmpdir() differs per process on macOS).
export const LOCK_PATH = process.platform === 'win32' ? join(tmpdir(), 'run-bank.lock') : '/tmp/run-bank.lock';
const STATUS_DIR = fileURLToPath(new URL('../../docs/status/', import.meta.url));

export class BankBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankBusyError';
  }
}

export class NonceDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonceDriftError';
  }
}

export interface LockFile {
  agent: string;
  purpose: string;
  pid: number;
  startedAt: string;
  expiresAt: string;
}

const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // exists, owned by someone else
  }
};

export function readLock(path = LOCK_PATH): LockFile | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as LockFile;
  } catch {
    return null;
  }
}

const describe = (l: LockFile) => `${l.agent} (${l.purpose}, pid ${l.pid}) since ${l.startedAt}, expires ${l.expiresAt}`;

/** Take the advisory lock, or throw `BankBusyError`. A stale lock (dead pid or expired) is taken over. */
export function acquireLock(opts: { agent: string; purpose: string; maxMinutes?: number; path?: string; now?: () => number }): { release(): void } {
  const path = opts.path ?? LOCK_PATH;
  const now = opts.now ?? Date.now;
  const body: LockFile = {
    agent: opts.agent,
    purpose: opts.purpose,
    pid: process.pid,
    startedAt: new Date(now()).toISOString(),
    expiresAt: new Date(now() + (opts.maxMinutes ?? 20) * 60_000).toISOString(),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(path, 'wx'); // atomic: fails if it exists
      writeFileSync(fd, JSON.stringify(body));
      closeSync(fd);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const held = readLock(path);
      const stale = !held || !pidAlive(held.pid) || Date.parse(held.expiresAt) <= now();
      if (!stale && held && held.pid !== process.pid) {
        throw new BankBusyError(`The live bank is locked by ${describe(held)}. Wait for it, or pick pnpm chain:fork.`);
      }
      try {
        unlinkSync(path);
      } catch {
        /* someone else cleaned it up first; loop and try again */
      }
      if (attempt === 2) throw new BankBusyError('Could not take the bank lock (contended). Try again.');
    }
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const held = readLock(path);
    if (held && held.pid === process.pid) {
      try {
        unlinkSync(path);
      } catch {
        /* already gone */
      }
    }
  };
  process.once('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      release();
      process.exit(sig === 'SIGINT' ? 130 : 143);
    });
  }
  return { release };
}

/** `LIVE BANK: F until 14:30` in the first lines of any status file, from an agent other than `me`, still in the future. */
export function findLiveBankLines(me: string, opts: { dir?: string; now?: Date } = {}): { file: string; agent: string; until: string }[] {
  const dir = opts.dir ?? STATUS_DIR;
  const now = opts.now ?? new Date();
  if (!existsSync(dir)) return [];
  const hits: { file: string; agent: string; until: string }[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const head = readFileSync(join(dir, f), 'utf8').split(/\r?\n/).slice(0, 12);
    for (const line of head) {
      const m = /LIVE BANK:\s*\**\s*([A-Za-z]+)\s+until\s+(\d{1,2}):(\d{2})/i.exec(line);
      if (!m) continue; // "LIVE BANK: none" and similar never match
      const until = new Date(now);
      until.setHours(Number(m[2]), Number(m[3]), 0, 0);
      if (m[1].toUpperCase() !== me.toUpperCase() && until.getTime() > now.getTime()) hits.push({ file: f, agent: m[1], until: `${m[2]}:${m[3]}` });
    }
  }
  return hits;
}

/** Refuse when the bank is mid-run: status `Running` and any bank event in the last 100 blocks (~40 s). */
export async function assertBankQuiet(client: ChainClient, runBank: Address, status: string): Promise<void> {
  if (status !== 'running') return;
  const head = await getBlockNumber(client, { cacheTime: 0 });
  const logs = await getLogs(client, { address: runBank, fromBlock: head > 99n ? head - 99n : 0n, toBlock: head });
  if (logs.length > 0) {
    const last = logs[logs.length - 1].blockNumber;
    throw new BankBusyError(`The bank is Running and emitted an event at block ${last} (head ${head}, about ${Number(head - (last ?? head)) * 0.4} s ago): someone is mid-run.`);
  }
}

/**
 * Fails loudly when the wallet's nonce moves without us. Wrap every send in `run()`.
 * Not for the app (which resyncs silently on purpose): for scripts that should stop when another sender appears.
 */
export function watchNonce(client: ChainClient, signer: Address) {
  let expected: number | null = null;
  const pending = () => getTransactionCount(client, { address: signer, blockTag: 'pending' });
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const now = await pending();
      if (expected !== null && now !== expected) {
        throw new NonceDriftError(
          `The nonce of ${signer.slice(0, 6)}…${signer.slice(-4)} moved from ${expected} to ${now} without us: another process is sending from this wallet. Stopping instead of retrying.`,
        );
      }
      try {
        const out = await fn();
        expected = now + 1; // one send = one nonce (every adapter call is a single transaction)
        return out;
      } catch (e) {
        expected = null; // unknown after a failure (it may or may not have landed): re-baseline on the next call
        throw e;
      }
    },
  };
}

export interface GuardOptions {
  /** Who is asking: C, F, A … (matches the `LIVE BANK: <agent>` convention). */
  agent: string;
  purpose: string;
  client: ChainClient;
  runBank: Address;
  signer: Address;
  /** Current bank status (`readSnapshot().status`). */
  status: string;
  /** Skip every check: a local anvil fork is isolated. */
  isLocalRpc?: boolean;
  /** Bypass the `LIVE BANK:` status-file check (never the lock). */
  force?: boolean;
  maxMinutes?: number;
  log?: (s: string) => void;
}

export interface Guard {
  release(): void;
  nonce: ReturnType<typeof watchNonce>;
}

export async function guardLiveBank(o: GuardOptions): Promise<Guard> {
  const log = o.log ?? ((s: string) => console.log(s));
  if (o.isLocalRpc) return { release() {}, nonce: { run: (fn) => fn() } };

  const lines = o.force ? [] : findLiveBankLines(o.agent);
  if (lines.length) {
    const who = lines.map((l) => `${l.agent} until ${l.until} (status/${l.file})`).join(', ');
    throw new BankBusyError(`LIVE BANK is in use by ${who}. Wait, use pnpm chain:fork, or pass --force if you are sure.`);
  }
  const lock = acquireLock({ agent: o.agent, purpose: o.purpose, maxMinutes: o.maxMinutes });
  try {
    await assertBankQuiet(o.client, o.runBank, o.status);
  } catch (e) {
    lock.release();
    throw e;
  }
  log(`  🔒 bank lock taken by ${o.agent} (${o.purpose}); released on exit`);
  return { release: lock.release, nonce: watchNonce(o.client, o.signer) };
}
