// Operator keys (PRD §12.2). Testnet-only keys. sessionStorage only; never log, never put a key in an error.
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const PK_PRIMARY = 'run.operatorPk';
const PK_BACKUP = 'run.backupPk';
const PK_RE = /^0x[0-9a-fA-F]{64}$/;

/** Returns a normalised 0x-prefixed key, or null. Never throws and never echoes the input. */
export function normalizePk(s: string | null | undefined): Hex | null {
  if (!s) return null;
  const t = s.trim();
  const h = t.startsWith('0x') || t.startsWith('0X') ? `0x${t.slice(2)}` : `0x${t}`;
  return PK_RE.test(h) ? (h as Hex) : null;
}

function session(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null; // storage blocked
  }
}

function envVar(name: 'VITE_OPERATOR_PK' | 'VITE_BACKUP_PK'): string | undefined {
  // Node (tsx, vitest): process.env. Browser (Vite dev/preview): `process` doesn't exist, so use the inlined import.meta.env.
  if (typeof process !== 'undefined' && process.env) return process.env[name] || undefined;
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return viteEnv?.[name] || undefined;
}

export function loadOperatorKeys(): { primary: Hex | null; backup: Hex | null; source: 'session' | 'env' | null } {
  const ss = session();
  const sp = normalizePk(ss?.getItem(PK_PRIMARY));
  if (sp) return { primary: sp, backup: normalizePk(ss?.getItem(PK_BACKUP)), source: 'session' };
  const ep = normalizePk(envVar('VITE_OPERATOR_PK'));
  if (ep) return { primary: ep, backup: normalizePk(envVar('VITE_BACKUP_PK')), source: 'env' };
  return { primary: null, backup: null, source: null };
}

export function saveOperatorKeys(keys: { primary: Hex; backup?: Hex | null }): void {
  const primary = normalizePk(keys.primary);
  if (!primary) throw new Error('The operator key must be 32 bytes of hex (64 characters).');
  const backup = normalizePk(keys.backup ?? null);
  if (keys.backup && !backup) throw new Error('The backup key must be 32 bytes of hex (64 characters).');
  const ss = session();
  if (!ss) return; // no storage (tsx / blocked): keep nothing
  ss.setItem(PK_PRIMARY, primary);
  if (backup) ss.setItem(PK_BACKUP, backup);
  else ss.removeItem(PK_BACKUP);
}

export function clearOperatorKeys(): void {
  const ss = session();
  if (!ss) return;
  ss.removeItem(PK_PRIMARY);
  ss.removeItem(PK_BACKUP);
}

export function addressOfKey(pk: Hex): Address {
  const n = normalizePk(pk);
  if (!n) throw new Error('Not a valid private key (expected 32 bytes of hex).');
  return privateKeyToAccount(n).address;
}
