import { describe, expect, it } from 'vitest';
import { selectorEqual } from '@/app/store';

describe('selectorEqual (keeps useRunView selectors from looping)', () => {
  it('treats equal primitives, arrays and flat objects as equal', () => {
    expect(selectorEqual(1, 1)).toBe(true);
    expect(selectorEqual('a', 'b')).toBe(false);
    expect(selectorEqual([1, 2], [1, 2])).toBe(true);
    expect(selectorEqual([1, 2], [1, 3])).toBe(false);
    expect(selectorEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    expect(selectorEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('looks one level into nested plain objects (a fresh `{ tick, loss }` each call is still equal)', () => {
    const seals: unknown[] = [];
    expect(selectorEqual({ seals, practice: { tick: 3, loss: 5n } }, { seals, practice: { tick: 3, loss: 5n } })).toBe(true);
    expect(selectorEqual({ seals, practice: { tick: 3, loss: 5n } }, { seals, practice: { tick: 4, loss: 5n } })).toBe(false);
    expect(selectorEqual({ practice: null }, { practice: { tick: 1 } })).toBe(false);
  });

  it('does not walk typed arrays or deeper structures', () => {
    expect(selectorEqual({ a: new Uint8Array(2) }, { a: new Uint8Array(2) })).toBe(false);
    expect(selectorEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } })).toBe(false);
  });
});
