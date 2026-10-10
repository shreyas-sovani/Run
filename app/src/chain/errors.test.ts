import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  NonceTooLowError,
  TimeoutError,
  encodeErrorResult,
  type Hex,
} from 'viem';
import { describe, expect, it } from 'vitest';
import { runBankAbi } from './abi';
import {
  AllRpcsDownError,
  ChainTimeoutError,
  LowBalanceError,
  ReserveBalanceError,
  RunBankRevert,
  classify,
  extractRevert,
  translateError,
} from './errors';

/** A viem contract revert exactly as `estimateContractGas` / `simulateContract` produce it. */
function viemRevert(errorName: string, args: readonly unknown[] = []): Error {
  const data = encodeErrorResult({ abi: runBankAbi, errorName, args } as never) as Hex;
  const reverted = new ContractFunctionRevertedError({ abi: runBankAbi, data, functionName: 'sealTicks' });
  return new ContractFunctionExecutionError(reverted, { abi: runBankAbi, functionName: 'sealTicks', args: [] });
}

const PK = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';

describe('translateError (PRD §12.6)', () => {
  it('NotOperator → load the operator key', () => {
    const u = translateError(viemRevert('NotOperator'));
    expect(u.code).toBe('NotOperator');
    expect(u.detail).toBe("This key can't run the bank. Load the operator key on the Ops page.");
    expect(u.action?.run).toBe('ops');
  });

  it.each([
    [0, 'ready'],
    [1, 'running'],
    [2, 'failed'],
    [3, 'survived'],
  ])('WrongStatus(…, %i) names the actual state: %s', (actual, name) => {
    const u = translateError(viemRevert('WrongStatus', [1, actual]));
    expect(u.detail).toBe(`The bank is ${name}. Reset the bank first.`);
    expect(u.action?.run).toBe('reset');
  });

  it('TickMismatch that reaches the UI → press Reset', () => {
    const u = translateError(viemRevert('TickMismatch', [5, 9]));
    expect(u.detail).toBe('Screen and chain disagree on the tick. Press Reset to start clean.');
    expect(u.action?.run).toBe('reset');
  });

  it.each(['BadDepositor', 'NotAscending'])('%s → the engine sent a bad batch', (name) => {
    const u = translateError(new RunBankRevert(name, [7], 12));
    expect(u.detail).toBe('The engine sent a bad batch (tick 12). Press Reset.');
    expect(translateError(viemRevert(name, [7])).detail).toBe('The engine sent a bad batch. Press Reset.');
  });

  it('Underfunded formats both amounts in AUSD', () => {
    const u = translateError(viemRevert('Underfunded', [10_000_000_000n, 9_222_660_000n]));
    expect(u.detail).toBe('The bank holds 9,222.66 AUSD but needs 10,000 AUSD. Fund it on the Ops page.');
    expect(u.action?.run).toBe('ops');
  });

  it('LedgerNotLoaded', () => {
    expect(translateError(viemRevert('LedgerNotLoaded')).detail).toBe("The depositor ledger isn't loaded onchain yet.");
  });

  it('insufficient funds → switch to the backup key', () => {
    const e = new InsufficientFundsError({ cause: new BaseError('x') });
    const u = translateError(e);
    expect(u.code).toBe('insufficient_funds');
    expect(u.action?.run).toBe('backup');
    expect(u.detail).toMatch(/low on MON/);
    const low = translateError(new LowBalanceError(9_500_000_000_000_000_000n));
    expect(low.detail).toBe('The operator wallet is low on MON (9.50 MON). Switch to the backup key.');
  });

  it('reserve-balance rejection', () => {
    const u = translateError(new Error('transaction rejected: reserve balance violated'));
    expect(u.detail).toBe("Monad's 10 MON reserve rule blocked this send. Top up the operator above 15 MON.");
    expect(translateError(new ReserveBalanceError()).code).toBe('reserve_balance');
  });

  it('nonce too low is not scary', () => {
    const u = translateError(new NonceTooLowError({ nonce: 4 }));
    expect(u.code).toBe('nonce');
    expect(u.action).toBeNull();
  });

  it('timeout is amber and says retrying', () => {
    const u = translateError(new ChainTimeoutError(7));
    expect(u.detail).toBe("Monad hasn't sealed tick 7 yet. Retrying…");
    expect(u.action).toBeNull();
    expect(translateError(new ChainTimeoutError(null)).detail).toBe("Monad hasn't sealed this tick yet. Retrying…");
    expect(translateError(new TimeoutError({ body: {}, url: 'https://rpc.example' })).code).toBe('timeout');
  });

  it('all RPCs down points at the replay', () => {
    const u = translateError(new AllRpcsDownError());
    expect(u.detail).toBe("Can't reach Monad testnet. Retrying every 2 s. Press Shift+R for the recorded run.");
    expect(u.action?.run).toBe('replay');
    expect(translateError(new HttpRequestError({ url: 'https://rpc.example', body: {}, status: 429 })).code).toBe('offline');
  });

  it('anything else: short reason, no hex blobs', () => {
    const noisy = new Error(`execution failed with data ${'0xab'.repeat(80)} at ${PK}`);
    const u = translateError(noisy);
    expect(u.code).toBe('unknown');
    expect(u.detail.startsWith('Sealing failed: ')).toBe(true);
    expect(u.detail).toContain('Press Retry, or Shift+R for the recorded run.');
    expect(u.detail).not.toMatch(/0x[0-9a-f]{40,}/i);
    expect(u.detail).not.toContain(PK.slice(2));
    expect(u.detail.length).toBeLessThan(220);
  });

  it('never leaks a key, with or without the 0x prefix, in any field', () => {
    for (const e of [new Error(`bad key ${PK}`), new Error(`bad key ${PK.slice(2)}`), new RunBankRevert(PK, [PK])]) {
      const u = translateError(e);
      expect(JSON.stringify(u)).not.toContain(PK.slice(2));
    }
  });

  it('a non-Error throw still translates', () => {
    expect(translateError('boom').code).toBe('unknown');
    expect(translateError(undefined).code).toBe('unknown');
  });
});

describe('classify / extractRevert', () => {
  it('reads the revert out of viem and our own errors', () => {
    expect(extractRevert(viemRevert('TickMismatch', [1, 2]))).toMatchObject({ name: 'TickMismatch' });
    expect(extractRevert(new RunBankRevert('NotOperator'))?.name).toBe('NotOperator');
    expect(extractRevert(new Error('nope'))).toBeNull();
  });
  it('routes failures to the SealQueue strategy', () => {
    expect(classify(viemRevert('TickMismatch', [1, 2]))).toBe('mismatch');
    expect(classify(viemRevert('WrongStatus', [1, 2]))).toBe('mismatch');
    expect(classify(viemRevert('NotOperator'))).toBe('revert');
    expect(classify(new ChainTimeoutError(1))).toBe('timeout');
    expect(classify(new AllRpcsDownError())).toBe('offline');
    expect(classify(new InsufficientFundsError({ cause: new BaseError('x') }))).toBe('other');
    expect(classify(new Error('weird'))).toBe('other');
  });
});
