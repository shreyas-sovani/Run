// Test support for the chain layer (not imported by app code): raw RunBank logs built from the real ABI.
import { encodeAbiParameters, encodeEventTopics, toHex } from 'viem';
import type { Address, Hex } from 'viem';
import { runBankAbi } from './abi';

export const hashN = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;

export type BankEventName = 'RumorStarted' | 'TickSealed' | 'BankFailed' | 'BankSurvived' | 'BankReset' | 'Ping';

export interface RawRpcLog {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: Hex;
  logIndex: Hex;
  removed: boolean;
}

/** A JSON-RPC shaped log for `name`, encoded with the real RunBank ABI so decoding is exercised for real. */
export function rawLog(
  bank: Address, name: BankEventName, args: Record<string, unknown>, block: number, logIndex: number, txHash?: Hex,
): RawRpcLog {
  const item = runBankAbi.find((i) => i.type === 'event' && i.name === name)!;
  const inputs = item.inputs as readonly { indexed: boolean; name: string; type: string }[];
  const topics = encodeEventTopics({ abi: [item], eventName: name, args: args as never } as never) as Hex[];
  const data = encodeAbiParameters(
    inputs.filter((i) => !i.indexed) as never,
    inputs.filter((i) => !i.indexed).map((i) => args[i.name]) as never,
  );
  return {
    address: bank, topics, data, blockNumber: toHex(block), blockHash: hashN(block),
    transactionHash: txHash ?? hashN(block * 100 + logIndex), transactionIndex: '0x0', logIndex: toHex(logIndex), removed: false,
  };
}

export const TICK_SUMMARY = {
  served: 1, skipped: 0, haircutBps: 200, queueLengthAfter: 0, paid: 5n, bondsSold: 0n, fireSaleLoss: 0n,
  cashAfter: 100n, bondsAfter: 200n, depositsOwedAfter: 50n,
};
