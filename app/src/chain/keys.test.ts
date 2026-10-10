import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addressOfKey, clearOperatorKeys, loadOperatorKeys, normalizePk, saveOperatorKeys } from './keys';
import { translateError } from './errors';
import { createLiveAdapter } from './liveAdapter';

// Well-known throwaway keys (the first two Anvil accounts). They hold nothing anywhere.
const PK1 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const PK2 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDR1 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('operator keys', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    // A developer's real app/.env.local is loaded by vitest: blank it so tests never depend on (or print) real keys.
    vi.stubEnv('VITE_OPERATOR_PK', '');
    vi.stubEnv('VITE_BACKUP_PK', '');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('validates 32-byte hex and normalises the prefix', () => {
    expect(normalizePk(PK1)).toBe(PK1);
    expect(normalizePk(PK1.slice(2))).toBe(PK1);
    expect(normalizePk(` ${PK1}\n`)).toBe(PK1);
    expect(normalizePk('0x1234')).toBeNull();
    expect(normalizePk(PK1 + 'ab')).toBeNull();
    expect(normalizePk('0x' + 'z'.repeat(64))).toBeNull();
    expect(normalizePk('')).toBeNull();
    expect(normalizePk(undefined)).toBeNull();
  });

  it('derives the address', () => {
    expect(addressOfKey(PK1)).toBe(ADDR1);
    expect(() => addressOfKey('0x12' as never)).toThrow(/32 bytes/);
  });

  it('stores in sessionStorage only, and clears', () => {
    saveOperatorKeys({ primary: PK1, backup: PK2 });
    expect(loadOperatorKeys()).toEqual({ primary: PK1, backup: PK2, source: 'session' });
    clearOperatorKeys();
    expect(loadOperatorKeys()).toEqual({ primary: null, backup: null, source: null });
  });

  it('never touches localStorage', () => {
    const local = new MemoryStorage();
    const spy = vi.spyOn(local, 'setItem');
    vi.stubGlobal('localStorage', local);
    saveOperatorKeys({ primary: PK1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('session keys win over env keys; env keys are the fallback', () => {
    vi.stubEnv('VITE_OPERATOR_PK', PK2);
    expect(loadOperatorKeys()).toMatchObject({ primary: PK2, source: 'env' });
    saveOperatorKeys({ primary: PK1 });
    expect(loadOperatorKeys()).toMatchObject({ primary: PK1, source: 'session' });
  });

  it('rejects a malformed key without echoing it', () => {
    const bad = '0xnot-a-key-' + 'deadbeef'.repeat(4);
    try {
      saveOperatorKeys({ primary: bad as never });
      expect.unreachable();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('deadbeef');
    }
  });

  it('keeps working with no sessionStorage at all (tsx / blocked storage)', () => {
    vi.unstubAllGlobals(); // no sessionStorage; the env stubs from beforeEach stay in place
    expect(() => saveOperatorKeys({ primary: PK1 })).not.toThrow();
    expect(() => clearOperatorKeys()).not.toThrow();
    expect(loadOperatorKeys().primary).toBeNull();
  });
});

describe('a key never leaks through errors or logs', () => {
  it('serialising the adapter, its errors and console output never contains the key', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'debug', 'warn', 'error'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    }
    const adapter = createLiveAdapter({ primaryPk: PK1, backupPk: PK2 });
    const surface = JSON.stringify({ ...adapter, operator: adapter.operator }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(surface).not.toContain(PK1.slice(2));
    expect(surface).not.toContain(PK2.slice(2));
    // Every failure path of the adapter funnels through translateError; feed it a message that quotes the key.
    const ui = JSON.stringify(translateError(new Error(`signing failed for ${PK1}`)));
    expect(ui).not.toContain(PK1.slice(2));
    expect(logs.join('\n')).not.toContain(PK1.slice(2));
    vi.restoreAllMocks();
  });
});
