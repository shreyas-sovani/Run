import { describe, expect, it } from 'vitest';
import type { CheckStatus, PreflightCheck, PreflightReport } from '@/types';
import { checkKey, checkKeys, checkRpc, checksForStep, deriveSteps } from '../opsModel';

const check = (id: string, status: CheckStatus, critical = true): PreflightCheck => ({ id, label: id, status, detail: '', critical });
const report = (checks: PreflightCheck[]): PreflightReport => ({
  checks,
  at: 1,
  ok: checks.every((c) => !c.critical || c.status === 'pass' || c.status === 'warn'),
});

const ALL = ['rpc', 'blocks', 'key', 'operatorMon', 'bank', 'status', 'ausd', 'ledger', 'ping'].map((id) => check(id, 'pass'));
const withStatus = (id: string, status: CheckStatus) => ALL.map((c) => (c.id === id ? { ...c, status } : c));

describe('deriveSteps', () => {
  it('starts at the key with nothing loaded', () => {
    const s = deriveSteps({ operatorAddress: null, preflight: null });
    expect(s.current).toBe('key');
    expect(s.canGo).toBe(false);
  });

  it('moves to the network once a key is loaded but nothing has been checked', () => {
    const s = deriveSteps({ operatorAddress: '0xabc', preflight: null });
    expect(s.done.key).toBe(true);
    expect(s.current).toBe('network');
  });

  it('stays on the network step while the RPC or block feed fails', () => {
    expect(deriveSteps({ operatorAddress: '0xabc', preflight: report(withStatus('rpc', 'fail')) }).current).toBe('network');
    expect(deriveSteps({ operatorAddress: '0xabc', preflight: report(withStatus('blocks', 'fail')) }).current).toBe('network');
  });

  it('accepts a slow RPC (warn) as reachable', () => {
    expect(deriveSteps({ operatorAddress: '0xabc', preflight: report(withStatus('rpc', 'warn')) }).done.network).toBe(true);
  });

  it('asks to fund the bank when AUSD is short or the bank is missing', () => {
    expect(deriveSteps({ operatorAddress: '0xabc', preflight: report(withStatus('ausd', 'fail')) }).current).toBe('fund');
    expect(deriveSteps({ operatorAddress: '0xabc', preflight: report(withStatus('bank', 'fail')) }).current).toBe('fund');
  });

  it('goes to the stage when every critical check passes', () => {
    const s = deriveSteps({ operatorAddress: '0xabc', preflight: report(ALL) });
    expect(s.current).toBe('stage');
    expect(s.canGo).toBe(true);
  });

  it('a failing ping does not move the user back to an earlier step', () => {
    const s = deriveSteps({ operatorAddress: '0xabc', preflight: report(withStatus('ping', 'fail')) });
    expect(s.current).toBe('stage');
    expect(s.canGo).toBe(false);
  });
});

describe('checksForStep', () => {
  it('groups rows by step', () => {
    const r = report([...ALL, check('rpc:QuickNode', 'pass', false)]);
    expect(checksForStep(r, 'network').map((c) => c.id)).toEqual(['rpc', 'blocks', 'rpc:QuickNode']);
    expect(checksForStep(r, 'fund').map((c) => c.id)).toEqual(['bank', 'status', 'ausd', 'ledger']);
    expect(checksForStep(null, 'key')).toEqual([]);
  });
});

describe('checkKey', () => {
  const hex = 'ab'.repeat(32);
  it('accepts 32-byte hex with or without 0x and normalises case', () => {
    expect(checkKey(hex)).toEqual({ ok: true, hex: `0x${hex}` });
    expect(checkKey(`  0x${hex.toUpperCase()} `)).toEqual({ ok: true, hex: `0x${hex}` });
  });
  it('rejects empty, short, non-hex, zero and address-shaped input', () => {
    expect(checkKey('')).toEqual({ ok: false, reason: 'empty' });
    expect(checkKey('0x1234')).toEqual({ ok: false, reason: 'invalid' });
    expect(checkKey('zz'.repeat(32))).toEqual({ ok: false, reason: 'invalid' });
    expect(checkKey('0'.repeat(64))).toEqual({ ok: false, reason: 'invalid' });
    expect(checkKey(`0x${'ab'.repeat(20)}`)).toEqual({ ok: false, reason: 'address' });
  });
});

describe('checkKeys', () => {
  const a = 'ab'.repeat(32);
  const b = 'cd'.repeat(32);
  it('backup is optional', () => {
    expect(checkKeys(a, '').ok).toBe(true);
    expect(checkKeys(a, '  ').backup).toBeNull();
  });
  it('flags a bad backup and a duplicated key', () => {
    expect(checkKeys(a, 'nope').ok).toBe(false);
    expect(checkKeys(a, `0x${a}`).sameKey).toBe(true);
    expect(checkKeys(a, `0x${a}`).ok).toBe(false);
    expect(checkKeys(a, b).ok).toBe(true);
  });
  it('needs a valid primary', () => {
    expect(checkKeys('', b).ok).toBe(false);
  });
});

describe('checkRpc', () => {
  it('empty is fine, http(s) only otherwise', () => {
    expect(checkRpc('')).toEqual({ ok: true, url: null });
    expect(checkRpc(' https://monad-testnet.g.alchemy.com/v2/abc ')).toEqual({ ok: true, url: 'https://monad-testnet.g.alchemy.com/v2/abc' });
    expect(checkRpc('ws://x')).toEqual({ ok: false });
    expect(checkRpc('not a url')).toEqual({ ok: false });
  });
});
