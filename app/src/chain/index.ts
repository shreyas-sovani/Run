// Chain barrel (PRD §16.3). Owner: C (`abi/` and `gasModel.ts` are A's). Frozen: additive changes only.
// Nothing in here imports React.
export { NETWORK, CHAIN_LIMITS, explorerAddress, explorerTx } from '@/config/network';
export { deployment } from './deployment';

export type {
  BlockInfo,
  ChainAdapter,
  GasLogEntry,
  GasMode,
  LiveAdapter,
  Recorder,
  SealQueue,
  SealQueueOptions,
  Spectator,
} from './types';

export { createLiveAdapter } from './liveAdapter';
export { createMockAdapter } from './mockAdapter';
export type { MockAdapter, MockAdapterOptions } from './mockAdapter';
export { createSealQueue } from './sealQueue';
export { createSpectator } from './spectator';
export type { SpectatorOptions } from './spectator';
export { createRecorder, listReplays, loadReplay } from './recorder';

export { translateError, ChainTimeoutError, RunBankRevert, LowBalanceError, AllRpcsDownError, ReserveBalanceError } from './errors';
export { loadOperatorKeys, saveOperatorKeys, clearOperatorKeys, addressOfKey, normalizePk } from './keys';

// Additive: clients, for the Ops page and labs.
export { monadChain, getPublicClient, getSpectatorClient, createClientBundle, endpointsFor } from './clients';
export type { ChainClient, ClientBundle, RpcEndpoint } from './clients';
export { createBlockFeed } from './blocks';
export type { BlockFeed } from './blocks';
export { runPreflight } from './preflight';
