// The ONE place the stage touches `@/ui/copy` (owner: D; strings: E).
//
// Lookup order for every string: `copy.stage.<key>` (E's override) → the existing top-level group in E's deck
// (`banks`, `cards`, `buttons`, `phases`, `chips`) → the default below.
// The defaults exist only so the stage reads correctly while E's deck is still being written. They are
// transitional: once a key exists in `copy`, the default is never reached. Component files must not contain
// string literals; they import `S` from here.
import { copy } from '@/ui/copy';
import type { BankLevel, RumorCard, RunMode, RunPhase, SealRecord } from '@/types';

type Tree = Record<string, unknown>;
const deck = copy as unknown as Tree;

function dig(root: unknown, path: readonly (string | number)[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Tree)[key as string];
  }
  return cur;
}

function str(path: readonly (string | number)[], fallback: string): string {
  const v = dig(deck, path);
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function strList(path: readonly (string | number)[], fallback: readonly string[]): readonly string[] {
  const v = dig(deck, path);
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fallback;
}

/** `fill('{n} withdrew', { n: 41 })` → `'41 withdrew'`. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const st = (key: string, fallback: string) => str(['stage', key], fallback);
const cap = (t: string) => (t.length > 0 ? t[0].toUpperCase() + t.slice(1) : t);

const BANK_DEFAULT = ["Bhau's Bank", 'Monad Mutual'] as const;
const BANK_TAG_DEFAULT = ['No defences', 'Speed bump · insured'] as const;
const CARD_DEFAULT = [
  'The CEO just bought a yacht.',
  'The audit is *delayed*.',
  'Heard the founder flew to Dubai.',
  'Screenshot: the vault is empty.',
] as const;
const CARD_KEYS = ['Q', 'W', 'E', 'R'] as const;

export interface PassbookRowCopy {
  name: string;
  amount: string;
  duration: string;
  note: string | null;
}

// PRD §8.1 durations are data (seconds); the labels come from E's `copy.passbook.rows`.
export const PASSBOOK_SECONDS = [16 * 86_400, 8 * 86_400, 86_400] as const;

const PASSBOOK_DEFAULT: readonly PassbookRowCopy[] = [
  { name: 'Washington Mutual, 2008', amount: '$19B', duration: '16 days', note: 'outflows' },
  { name: 'Wachovia, 2008', amount: '~$10B', duration: '8 days', note: 'outflows' },
  { name: 'Silicon Valley Bank, 2023', amount: '$42B', duration: '1 day', note: 'in one day, about 25% of deposits' },
];

function passbookRows(): readonly PassbookRowCopy[] {
  const v = dig(deck, ['passbook', 'rows']);
  if (!Array.isArray(v) || v.length < PASSBOOK_SECONDS.length) return PASSBOOK_DEFAULT;
  return v.slice(0, PASSBOOK_SECONDS.length).map((r, i) => {
    const row = (r ?? {}) as Tree;
    const d = PASSBOOK_DEFAULT[i];
    const pick = (k: string, alt: string) => (typeof row[k] === 'string' ? (row[k] as string) : alt);
    return {
      name: pick('bank', d.name),
      amount: pick('amount', d.amount),
      duration: pick('span', d.duration),
      note: typeof row.note === 'string' ? row.note : d.note,
    };
  });
}

const SEAL_KIND_DEFAULT: Record<SealRecord['kind'], string> = {
  setLevel: 'bank switched',
  rumor: 'rumor started',
  ticks: 'ticks',
  reset: 'bank reset',
  ping: 'test transaction',
  fund: 'bank funded',
  loadLedger: 'ledger loaded',
};

/** Key names printed on badges. These are keyboard labels, not prose. */
const KEY = { start: 'Enter', reset: 'X', proof: 'P', passbook: 'C', help: 'H' } as const;

export const S = {
  key: KEY,
  wordmark: () => st('wordmark', 'RUN!'),

  // ── Top bar ────────────────────────────────────────────────────────
  bankGroup: () => st('bankGroup', 'Bank'),
  rumorGroup: () => st('rumorGroup', 'Rumor'),
  bankName: (l: BankLevel) => str(['banks', l, 'name'], BANK_DEFAULT[l]),
  bankTag: (l: BankLevel) => str(['stage', 'bankTags', l], cap(str(['banks', l, 'tagline'], BANK_TAG_DEFAULT[l]))),
  bankSwitchTag: (l: BankLevel) => fill(st('bankSwitchTag', 'Reset and switch'), { bank: S.bankName(l) }),
  cardText: (c: RumorCard) => str(['cards', c, 'text'], CARD_DEFAULT[c]),
  cardKey: (c: RumorCard) => str(['cards', c, 'hotkey'], CARD_KEYS[c]),
  timerPrefix: () => st('timerPrefix', 'T+'),
  blockLabel: () => st('blockLabel', 'block'),

  // Primary action label per phase (PRD §13.2)
  btn: {
    start: () => str(['buttons', 'start'], 'Start the run'),
    starting: () => str(['buttons', 'starting'], 'Starting the run…'),
    reset: () => str(['buttons', 'reset'], 'Reset the bank'),
    resetting: () => str(['buttons', 'resetting'], 'Resetting the bank…'),
    switching: () => str(['buttons', 'switching'], 'Switching bank…'),
    retry: () => str(['buttons', 'retry'], 'Retry sealing'),
    pickRumor: () => str(['buttons', 'pickRumor'], 'Pick a rumor to start the run'),
    verdict: () => str(['phases', 'failing'], 'Sealing the verdict…'),
    backup: () => str(['buttons', 'switchToBackup'], 'Switch to backup key'),
    recorded: () => str(['buttons', 'recordedRun'], 'Play the recorded run'),
    ops: () => str(['errorActions', 'ops'], 'Open the Ops page'),
    dismiss: () => str(['buttons', 'dismiss'], 'Dismiss'),
  },
  phase: (p: RunPhase) => str(['phases', p], p),
  chipFallback: (m: RunMode) => str(['chips', m], m),

  errorAction: (run: 'retry' | 'reset' | 'replay' | 'ops' | 'backup') => str(['errorActions', run], run),
  stageLabel: () => st('stageLabel', 'Bank run stage'),
  blockNone: () => st('blockNone', '—'),
  timerLabel: () => st('timerLabel', 'Run clock'),

  // ── Network canvas ─────────────────────────────────────────────────
  legendTitle: () => st('legendTitle', 'Depositors'),
  legend: {
    calm: () => st('legendCalm', "Hasn't heard"),
    heard: () => st('legendHeard', 'Heard the rumor'),
    panicking: () => st('legendPanicking', 'Panicking'),
    queued: () => st('legendQueued', 'In the queue'),
    withdrawn: () => st('legendWithdrawn', 'Withdrew'),
    trapped: () => st('legendTrapped', 'Trapped'),
    insured: () => st('legendInsured', 'Fully insured'),
    size: () => st('legendSize', 'Bigger dot = bigger balance'),
  },
  canvasAriaIdle: (total: number) => fill(st('canvasAriaIdle', '{total} depositors. The bank is open.'), { total }),
  canvasAriaRun: (heard: number, total: number) =>
    fill(st('canvasAriaRun', '{heard} of {total} depositors have heard the rumor.'), { heard, total }),
  canvasAriaOutcome: (withdrew: number, total: number, trapped: number) =>
    fill(st('canvasAriaOutcome', '{withdrew} of {total} depositors withdrew; {trapped} trapped.'), { withdrew, total, trapped }),

  // ── Vault ──────────────────────────────────────────────────────────
  vaultTitleOnchain: () => st('vaultTitleOnchain', 'Vault · real AUSD on Monad'),
  vaultTitleSim: () => st('vaultTitleSim', 'Vault · simulated'),
  cash: () => st('cash', 'cash'),
  bonds: () => st('bonds', 'bonds'),
  paidOut: () => st('paidOut', 'paid to depositors'),
  loss: () => st('loss', 'fire-sale loss'),
  haircut: () => st('haircut', 'haircut'),
  outTheDoor: () => st('outTheDoor', 'out the door'),
  street: () => st('street', 'Street'),
  scaleNote: () => str(['scale', 'note'], '1 AUSD = $1M'),
  heldOnchain: (amount: string) => fill(st('heldOnchain', '{amount} held by the contract · live from Monad'), { amount }),
  heldSim: () => st('heldSim', 'Practice: simulated balance'),
  vaultBarLabel: (cash: string, bonds: string, loss: string) =>
    fill(st('vaultBarLabel', 'Vault: {cash} cash, {bonds} bonds, {loss} lost in fire sales'), { cash, bonds, loss }),

  // ── Queue (Monad Mutual) ───────────────────────────────────────────
  queueTitle: () => st('queueTitle', 'Outside the teller window'),
  queueEmpty: () => st('queueEmpty', 'Nobody waiting'),
  queueMore: (n: number) => fill(st('queueMore', '+{n}'), { n }),
  queueCap: (pct: string) => fill(st('queueCap', 'Pays at most {pct} of deposits per block'), { pct }),
  queueAria: (n: number) => fill(st('queueAria', '{n} depositors waiting'), { n }),

  // ── Seal ticker ────────────────────────────────────────────────────
  tickerLabel: () => st('tickerLabel', 'Seals'),
  tickerEmpty: () => str(['buttons', 'pickRumor'], 'Pick a rumor to start the run'),
  tickRange: (a: number, b: number) =>
    a === b ? fill(st('tickOne', 'tick {a}'), { a }) : fill(st('tickMany', 'tick {a}–{b}'), { a, b }),
  withdrew: (n: number) => fill(st('withdrew', '{n} withdrew'), { n }),
  sealedIn: (t: string) => fill(st('sealedIn', 'sealed {t}'), { t }),
  finalized: () => st('finalized', '✓ finalized'),
  finalizing: () => st('finalizing', 'finalizing…'),
  simulatedSeal: () => st('simulatedSeal', 'simulated · not onchain'),
  sealingTick: (n: number) => fill(st('sealingTick', 'sealing tick {n}…'), { n }),
  sealingDelayed: () => st('sealingDelayed', 'Sealing delayed'),
  sealKind: (k: SealRecord['kind']) => str(['stage', 'sealKinds', k], SEAL_KIND_DEFAULT[k]),

  // ── Outcome ────────────────────────────────────────────────────────
  headlineFailed: () => str(['stamp', 'failed', 'headline'], 'BANK FAILED'),
  headlineSurvived: () => str(['stamp', 'survived', 'headline'], 'SURVIVED'),
  marathiFailed: () => str(['stamp', 'failed', 'marathi'], 'बँक बुडाली'),
  sublineSealed: (s: string, blocks: number) =>
    fill(st('sublineSealed', 'in {s} · {blocks} Monad blocks'), { s, blocks }),
  sublineSealedNoBlocks: (s: string) => fill(st('sublineSealedNoBlocks', 'in {s}'), { s }),
  stampSub: (kind: 'failed' | 'survived', wallMs: number | null, blocks: number | null): string => {
    const fn = dig(deck, ['stamp', kind === 'failed' ? 'failedSub' : 'survivedSub']);
    return typeof fn === 'function' ? String((fn as (a: number | null, b: number | null) => string)(wallMs, blocks)) : '';
  },
  sublineSim: (ticks: number) => fill(st('sublineSim', 'simulated · {ticks} ticks'), { ticks }),
  verdict: () => str(['stamp', 'verdict'], 'Sealing the verdict…'),
  verdictWaiting: (n: number) => fill(st('verdictWaiting', 'Waiting for Monad to seal tick {n}'), { n }),
  verdictWaitingSim: () => st('verdictWaitingSim', 'Settling the books'),
  outcomeAnnounceFailed: (s: string) => fill(st('outcomeAnnounceFailed', 'Bank failed after {s}.'), { s }),
  outcomeAnnounceSurvived: (s: string) => fill(st('outcomeAnnounceSurvived', 'Bank survived after {s}.'), { s }),

  // ── Passbook ───────────────────────────────────────────────────────
  passbookTitle: () => str(['passbook', 'title'], 'How long did they last?'),
  passbookSub: () => st('passbookSub', 'How long the biggest bank runs took'),
  passbookRows,
  thisBank: () => st('thisBank', 'This bank'),
  today: () => st('today', 'Today'),
  logScale: () => st('logScale', 'log scale'),
  failedAfter: () => st('failedAfter', 'failed'),
  survivedAfter: () => st('survivedAfter', 'survived'),
  withdrawnAmount: (usd: string) => fill(st('withdrawnAmount', '{usd} withdrawn'), { usd }),
  blocksNote: (n: number) => fill(st('blocksNote', '{n} Monad blocks'), { n }),
  simulatedNote: () => st('simulatedNote', 'simulated'),
  axisTicks: () => strList(['stage', 'axisTicks'], ['1 s', '1 min', '1 h', '1 day', '1 week']),
  close: () => str(['buttons', 'close'], 'Close'),
  noRunYet: () => st('noRunYet', 'Run the bank to add its row'),
  passbookSource: () => str(['passbook', 'source'], ''),

  // ── Help ───────────────────────────────────────────────────────────
  helpTitle: () => st('helpTitle', 'Keyboard shortcuts'),
  helpHint: () => st('helpHint', 'Press Esc to close'),
};

/** Renders `*word*` as emphasis markers: returns text segments, `em: true` for the emphasised ones. */
export function splitEmphasis(text: string): { text: string; em: boolean }[] {
  const out: { text: string; em: boolean }[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), em: false });
    out.push({ text: m[1], em: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), em: false });
  return out;
}
