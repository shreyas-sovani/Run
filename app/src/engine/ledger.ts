// Ledger packing and hashing (PRD §9.1). Pure; shared by runtime, generators and tests.
import { concat, keccak256, toHex } from 'viem';
import type { Hex } from 'viem';

export const N_DEPOSITORS = 500;
export const N_WORDS = 63; // ceil(500 / 8)
const UINT32_MAX = 0xffffffffn;

/** Word w holds ids 8w..8w+7; id i sits at bits 32·(i mod 8). */
export function packBalances(balances: readonly bigint[]): bigint[] {
  const words: bigint[] = Array.from({ length: Math.ceil(balances.length / 8) }, () => 0n);
  for (let i = 0; i < balances.length; i++) {
    const b = balances[i];
    if (b < 0n || b > UINT32_MAX) throw new Error(`balance of depositor ${i} does not fit uint32: ${b}`);
    words[i >> 3] |= b << BigInt(32 * (i & 7));
  }
  return words;
}

export function unpackBalances(words: readonly bigint[], count: number): bigint[] {
  const out: bigint[] = [];
  for (let i = 0; i < count; i++) out.push((words[i >> 3] >> BigInt(32 * (i & 7))) & UINT32_MAX);
  return out;
}

/** keccak256(abi.encodePacked(uint256[63])): the words as 32-byte big-endian, concatenated. */
export function hashLedgerWords(words: readonly bigint[]): Hex {
  return keccak256(concat(words.map((w) => toHex(w, { size: 32 }))));
}
