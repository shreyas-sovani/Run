// Pure logic for the Ops page (PRD §13.3 rule 2): one primary action at a time, in order
// Load operator key → Fix network → Fund the bank → Go to stage. No React, no store: unit-tested.
import type { Hex } from 'viem';
import type { PreflightCheck, PreflightReport } from '@/types';

export type StepId = 'key' | 'network' | 'fund' | 'stage';
export const STEP_ORDER: readonly StepId[] = ['key', 'network', 'fund', 'stage'];

/** Which preflight rows belong to which step. Ids come from C's preflight (`chain/preflight.ts`). */
const STEP_IDS: Record<Exclude<StepId, 'stage'>, readonly RegExp[]> = {
  key: [/^key$/, /^operatorMon$/, /^backupMon$/],
  network: [/^rpc$/, /^blocks$/, /^rpc:/],
  fund: [/^bank$/, /^status$/, /^ausd$/, /^ledger$/, /^config$/],
};

export function checksForStep(report: PreflightReport | null, step: Exclude<StepId, 'stage'>): PreflightCheck[] {
  if (!report) return [];
  return report.checks.filter((c) => STEP_IDS[step].some((re) => re.test(c.id)));
}

function find(report: PreflightReport | null, id: string): PreflightCheck | undefined {
  return report?.checks.find((c) => c.id === id);
}

export interface OpsSteps {
  done: Record<StepId, boolean>;
  current: StepId;
  /** Critical checks all pass: "Go to stage" is the primary action. */
  canGo: boolean;
}

/** A step is done when its own checks have passed, regardless of unrelated failures later in the list. */
export function deriveSteps(input: { operatorAddress: string | null; preflight: PreflightReport | null }): OpsSteps {
  const { operatorAddress, preflight } = input;
  const keyDone = operatorAddress !== null && find(preflight, 'key')?.status !== 'fail';
  // `warn` on the RPC row means "reachable but slow", which is good enough to continue.
  const reach = (id: string) => {
    const c = find(preflight, id);
    return c !== undefined && (c.status === 'pass' || c.status === 'warn');
  };
  const networkDone = keyDone && reach('rpc') && reach('blocks');
  const bank = find(preflight, 'bank');
  const ausd = find(preflight, 'ausd');
  const fundDone = networkDone && bank?.status === 'pass' && ausd?.status === 'pass';
  const canGo = preflight?.ok === true;
  const done: Record<StepId, boolean> = { key: keyDone, network: networkDone, fund: fundDone, stage: false };
  const current: StepId = !keyDone ? 'key' : !networkDone ? 'network' : !fundDone ? 'fund' : 'stage';
  return { done, current, canGo };
}

export type KeyCheck = { ok: true; hex: Hex } | { ok: false; reason: 'empty' | 'invalid' | 'address' };

/** Accepts `0x…` or bare hex; exactly 32 bytes. Never echoes the input. */
export function checkKey(raw: string): KeyCheck {
  const t = raw.trim().replace(/^0x/i, '');
  if (t.length === 0) return { ok: false, reason: 'empty' };
  if (/^[0-9a-fA-F]{40}$/.test(t)) return { ok: false, reason: 'address' };
  if (!/^[0-9a-fA-F]{64}$/.test(t)) return { ok: false, reason: 'invalid' };
  if (/^0{64}$/.test(t)) return { ok: false, reason: 'invalid' };
  return { ok: true, hex: `0x${t.toLowerCase()}` as Hex };
}

export interface KeysCheck {
  primary: KeyCheck;
  /** `null` when the backup field is empty (it is optional). */
  backup: KeyCheck | null;
  sameKey: boolean;
  ok: boolean;
}

export function checkKeys(primary: string, backup: string): KeysCheck {
  const p = checkKey(primary);
  const b = backup.trim() === '' ? null : checkKey(backup);
  const sameKey = p.ok && b !== null && b.ok && p.hex === b.hex;
  return { primary: p, backup: b, sameKey, ok: p.ok && (b === null || b.ok) && !sameKey };
}

/** Optional RPC override: empty is fine, otherwise it must be an http(s) URL. Returns the cleaned URL. */
export function checkRpc(raw: string): { ok: true; url: string | null } | { ok: false } {
  const t = raw.trim();
  if (t === '') return { ok: true, url: null };
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:' ? { ok: true, url: t } : { ok: false };
  } catch {
    return { ok: false };
  }
}
