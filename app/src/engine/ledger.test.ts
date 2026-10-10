import { describe, expect, it } from 'vitest';
import { keccak256, concat, toHex } from 'viem';
import { hashLedgerWords, packBalances, unpackBalances, N_DEPOSITORS, N_WORDS } from './ledger';

describe('ledger packing (PRD §9.1)', () => {
  it('packs 500 ids into 63 words, 8 × uint32 per word, id i at bits 32·(i mod 8)', () => {
    const balances = Array.from({ length: 500 }, (_, i) => BigInt(i + 1));
    const words = packBalances(balances);
    expect(words).toHaveLength(N_WORDS);
    expect(N_WORDS).toBe(63);
    // word 0 holds ids 0..7 with id 0 in the low 32 bits
    expect(words[0] & 0xffffffffn).toBe(1n);
    expect((words[0] >> 32n) & 0xffffffffn).toBe(2n);
    expect((words[0] >> 224n) & 0xffffffffn).toBe(8n);
    // word 62 holds ids 496..499; upper bits zero
    expect(words[62] >> 128n).toBe(0n);
    expect(words[62] & 0xffffffffn).toBe(497n);
  });

  it('round-trips', () => {
    const balances = Array.from({ length: N_DEPOSITORS }, (_, i) => BigInt((i * 7919) % 4_000_000_000));
    expect(unpackBalances(packBalances(balances), N_DEPOSITORS)).toEqual(balances);
  });

  it('rejects balances that do not fit uint32', () => {
    const balances = Array.from({ length: 500 }, () => 1n);
    balances[3] = 1n << 32n;
    expect(() => packBalances(balances)).toThrow();
  });

  it('ledgerHash = keccak256 of the 63 words as 32-byte big-endian = keccak256(abi.encodePacked(uint256[63]))', () => {
    const words = packBalances(Array.from({ length: 500 }, () => 19_000_000n));
    const manual = keccak256(concat(words.map((w) => toHex(w, { size: 32 }))));
    expect(hashLedgerWords(words)).toBe(manual);
  });
});
