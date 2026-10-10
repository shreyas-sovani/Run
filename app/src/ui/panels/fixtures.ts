// Fixtures for /lab/panels: fake but well-formed data in the shapes of PRD §16.1. Never imported by the app.
import { keccak256, toHex } from 'viem';
import type { Address, Hex } from 'viem';
import type { Outcome, PreflightCheck, PreflightReport, ReplayIndexEntry, RunView, SealRecord } from '@/types';
import type { ProofData } from './ProofPanel';

const hash = (n: number): Hex => keccak256(toHex(`fixture-${n}`));
export const FIX_BANK = '0x5a3f1c0b7d2e4a96b8c3f0e1d7a2b4c69e21d3f7' as Address;
export const FIX_STREET = '0x93e8d2a5c61f40b7a9d3e5f2c8b1a4d6e7f09c12' as Address;
export const FIX_AUSD = '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC' as Address;
export const FIX_OPERATOR = '0x71c4e9a2b8d3f05c6a1e7d4b9f2c8a3e5d6b0f14' as Address;
export const FIX_BACKUP = '0x2b9d6f1e8a4c7035d9e1b6a2f8c4d7e30a5b9c61' as Address;

const T0 = Date.UTC(2026, 9, 10, 8, 42, 7);

function rec(id: number, over: Partial<SealRecord>): SealRecord {
  return {
    id, kind: 'ticks', simulated: false, fromTick: null, toTick: null, requestedCount: null,
    txHash: hash(id), blockNumber: 21_483_200n + BigInt(id * 2), sentAtMs: T0 + id * 900, sealedAtMs: T0 + id * 900 + 710,
    gasLimit: 640_000n, gasUsed: 512_000n, status: 'sealed', finalized: false, mirrorMatch: true, rpc: 'QuickNode', ...over,
  };
}

const failed: Outcome = {
  kind: 'failed', tick: 12, wallMs: 5400, blocks: 14, rumorBlock: 21_483_202n, outcomeBlock: 21_483_216n,
  trappedCount: 41, trappedAmount: 1_870_000_000n, uninsuredTrapped: 1_870_000_000n, withdrawnAmount: 7_630_000_000n, sealed: true,
};

const survived: Outcome = {
  kind: 'survived', tick: 25, wallMs: 11_800, blocks: 31, rumorBlock: 21_483_202n, outcomeBlock: 21_483_233n,
  trappedCount: 0, trappedAmount: 0n, uninsuredTrapped: 0n, withdrawnAmount: 5_900_000_000n, sealed: true,
};

const deployed: RunView['deployment'] = { runBank: FIX_BANK, street: FIX_STREET, ausd: FIX_AUSD, deployed: true };
const undeployed: RunView['deployment'] = { runBank: null, street: null, ausd: FIX_AUSD, deployed: false };

export { deployed as fixDeployed, undeployed as fixUndeployed };

const liveSeals: SealRecord[] = [
  rec(1, { kind: 'rumor', blockNumber: 21_483_202n, finalized: true }),
  rec(2, { fromTick: 1, toTick: 4, requestedCount: 9, finalized: true }),
  rec(3, { fromTick: 5, toTick: 8, requestedCount: 63, blockNumber: 21_483_209n, gasUsed: 1_284_000n, sealedAtMs: T0 + 3 * 900 + 640, finalized: true }),
  rec(4, { fromTick: 9, toTick: 12, requestedCount: 41, blockNumber: 21_483_216n }),
];

export const liveProof: ProofData = {
  mode: 'live', phase: 'failed', seals: liveSeals, outcome: failed, finalizedBlock: 21_483_212n,
  onchain: {
    status: 'failed', level: 0, runId: 7, tick: 12, cash: 0n, bonds: 0n, depositsOwed: 1_870_000_000n, insuredOwed: 0n,
    deposits0: 9_500_000_000n, cumulativeLoss: 933_937_249n, lastHaircutBps: 2317, queueLength: 0, quietCount: 0, withdrawnCount: 459,
    startBlock: 21_483_202n, ausdHeld: 0n, streetHeld: 7_630_000_000n, ledgerHash: hash(900), configHash: hash(901), readAtBlock: 21_483_217n,
  },
  deployment: deployed, mirror: { matched: 12, total: 12, firstMismatchTick: null }, decisions: { matched: 12, total: 12 },
  replay: null, sealedTick: 12, practice: null,
};

export const liveMismatchProof: ProofData = {
  ...liveProof,
  phase: 'running', outcome: null,
  mirror: { matched: 5, total: 9, firstMismatchTick: 6 },
  decisions: { matched: 8, total: 9 },
  seals: liveSeals.slice(0, 3),
  onchain: null,
};

export const liveIdleProof: ProofData = {
  ...liveProof, phase: 'idle', seals: [], outcome: null, mirror: { matched: 0, total: 0, firstMismatchTick: null }, decisions: null, onchain: null, sealedTick: 0,
};

export const recordedProof: ProofData = {
  ...liveProof,
  mode: 'replay', phase: 'survived', outcome: survived,
  seals: liveSeals.map((r, i) => ({ ...r, finalized: true, txHash: hash(100 + i) })),
  replay: { id: 'monad-mutual-survives', name: 'Monad Mutual survives', recordedAt: '2026-10-10T14:12:00+05:30' },
  onchain: null, decisions: null, sealedTick: 25,
  mirror: { matched: 25, total: 25, firstMismatchTick: null },
};

export const practiceProof: ProofData = {
  ...liveProof,
  mode: 'practice', phase: 'failed',
  seals: liveSeals.map((r) => ({ ...r, simulated: true })),
  onchain: null, decisions: null, replay: null,
  practice: { tick: 12, withdrawn: 459, loss: 933_937_249n },
};

export const practiceIdleProof: ProofData = { ...practiceProof, phase: 'idle', seals: [], outcome: null, practice: null, sealedTick: 0 };

// ── Preflight reports (PRD §12.5 ids and labels) ─────────────────────────
const c = (id: string, label: string, status: PreflightCheck['status'], detail: string, critical = true): PreflightCheck => ({ id, label, status, detail, critical });

const PASS: PreflightCheck[] = [
  c('rpc', 'Monad RPC reachable', 'pass', 'QuickNode · 212 ms · chain 10143'),
  c('blocks', 'Block feed live', 'pass', 'Block #21,483,214 and counting'),
  c('key', 'Operator key loaded', 'pass', '0x71c4…0f14'),
  c('operatorMon', 'Operator MON', 'pass', '34.82 MON'),
  c('backupMon', 'Backup MON', 'pass', '0x2b9d…9c61 · 24.90 MON', false),
  c('bank', 'RunBank contract', 'pass', '0x5a3f…d3f7 · operator allowed'),
  c('status', 'Bank status', 'pass', 'Ready'),
  c('ausd', 'AUSD held by the bank', 'pass', '9,500 AUSD held'),
  c('ledger', 'Ledger matches the engine', 'pass', 'Ledger hash matches'),
  c('config', 'Bank config matches the engine', 'pass', 'Level 0 config matches', false),
  c('ping', 'Test transaction', 'pass', 'Sealed in 0.71 s · block #21,483,214'),
  // PRD §12.5 environment rows (F's `environmentChecks()`): always non-critical.
  c('fonts', 'Fonts loaded', 'pass', 'Big Shoulders, Atkinson and Atkinson Mono are ready', false),
  c('audio', 'Audio unlocked', 'pass', 'Sound is on', false),
  c('window', 'Window size', 'pass', '1920 × 1080', false),
];

export const preflightAllPass: PreflightReport = { checks: PASS, ok: true, at: T0 };

export const preflightMixed: PreflightReport = {
  at: T0,
  ok: false,
  checks: PASS.map((x) => {
    if (x.id === 'rpc') return { ...x, status: 'warn' as const, detail: 'QuickNode · 1,140 ms · chain 10143' };
    if (x.id === 'ausd') return { ...x, status: 'fail' as const, detail: 'The bank holds 0 AUSD but needs 9,500 AUSD. Fund it on the Ops page.' };
    if (x.id === 'backupMon') return { ...x, status: 'warn' as const, detail: 'No backup key loaded.' };
    if (x.id === 'ping') return { ...x, status: 'pending' as const, detail: 'Waiting for the bank to be funded' };
    if (x.id === 'audio') return { ...x, status: 'warn' as const, detail: 'Press any key to unlock sound, then run the checks again.' };
    if (x.id === 'window') return { ...x, status: 'fail' as const, detail: 'The window is 1024 × 640. The stage needs at least 1280 × 720.' };
    return x;
  }),
};

export const preflightAllFail: PreflightReport = {
  at: T0,
  ok: false,
  checks: [
    c('rpc', 'Monad RPC reachable', 'fail', "Can't reach Monad testnet on any RPC."),
    c('blocks', 'Block feed live', 'fail', 'No new block in 2 s'),
    c('key', 'Operator key loaded', 'fail', 'No operator key loaded. Paste it on the Ops page.'),
    c('operatorMon', 'Operator MON', 'fail', 'No operator key, so no balance to check.'),
    c('backupMon', 'Backup MON', 'warn', 'No backup key loaded.', false),
    c('bank', 'RunBank contract', 'fail', 'No contract deployed yet.'),
    c('ping', 'Test transaction', 'fail', 'No operator key, so no transaction can be sent.'),
  ],
};

export const replayEntries: ReplayIndexEntry[] = [
  { id: 'bhaus-bank-fails', name: "Bhau's Bank fails in 5.4 s", recordedAt: '2026-10-10T13:40:00+05:30', kind: 'failed', level: 0 },
  { id: 'monad-mutual-survives', name: 'Monad Mutual survives', recordedAt: '2026-10-10T14:12:00+05:30', kind: 'survived', level: 1 },
  { id: 'bhaus-bank-whales', name: "Bhau's Bank: the whales run first", recordedAt: '2026-10-09T22:05:00+05:30', kind: 'failed', level: 0 },
];

export const fixOperator = { address: FIX_OPERATOR, balanceWei: 34_820_000_000_000_000_000n, backupAddress: FIX_BACKUP, usingBackup: false } as const;
