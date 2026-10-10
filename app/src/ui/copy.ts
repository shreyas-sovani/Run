// The copy deck (PRD §14.8). Owner: E. Every user-facing string lives here; D and E read from it and nobody
// hardcodes copy in components. Voice: plain verbs, sentence case (stamps are the only all-caps), no filler,
// no apologies. An action keeps its name: "Start the run" → "Starting the run…" → "Run started".
// Keys that existed in the F-00 placeholder (banks, cards, buttons, phases, chips) keep their shape.
import { DISPLAY_SCALE_NOTE, fmtBlock, fmtCount, fmtRecorded, fmtSeconds } from '@/ui/format';

export const copy = {
  brand: {
    name: 'RUN!',
    title: 'RUN! — start a bank run on Monad',
    tagline: 'Start a bank run on Monad',
    description:
      'Start one rumor and watch 500 depositors run an onchain bank dry in seconds. Real AUSD, sealed block by block on Monad testnet.',
    ogLine: 'RUN! · start a bank run on Monad',
    ogStamp: 'BANK FAILED',
    ogStampSub: 'in 5.4 s',
    ogFootnote: 'Real AUSD · sealed on Monad testnet · all banks fictional',
  },

  scale: {
    note: DISPLAY_SCALE_NOTE,
    label: '1 AUSD = $1M, display scale',
    short: 'display scale',
    testnet: 'testnet',
  },

  banks: [
    { name: "Bhau's Bank", tagline: 'no defences' },
    { name: 'Monad Mutual', tagline: 'speed bump + insured' },
  ],

  cards: [
    { hotkey: 'Q', text: 'The CEO just bought a yacht.' },
    { hotkey: 'W', text: 'The audit is delayed.' },
    { hotkey: 'E', text: 'Heard the founder flew to Dubai.' },
    { hotkey: 'R', text: 'Screenshot: the vault is empty.' },
  ],

  buttons: {
    start: 'Start the run',
    starting: 'Starting the run…',
    started: 'Run started',
    reset: 'Reset the bank',
    resetting: 'Resetting the bank…',
    resetDone: 'Bank reset',
    switching: 'Switching bank…',
    retry: 'Retry sealing',
    retrying: 'Retrying…',
    pickRumor: 'Pick a rumor to start the run',
    switchToBackup: 'Switch to backup key',
    recordedRun: 'Play the recorded run',
    proof: 'Proof',
    passbook: 'Comparison',
    close: 'Close',
    dismiss: 'Dismiss',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    openExplorer: 'Open in MonadVision',
    openExplorerAlt: 'Open in Monadscan',
    play: 'Play',
    mute: 'Mute',
    unmute: 'Unmute',
  },

  phases: {
    idle: 'Bank open',
    switching: 'Switching bank…',
    starting: 'Starting the run…',
    running: 'Run in progress',
    failing: 'Sealing the verdict…',
    surviving: 'Sealing the verdict…',
    failed: 'Bank failed',
    survived: 'Bank survived',
    resetting: 'Resetting the bank…',
    paused: 'Sealing paused',
  },

  // PRD §4: a chip is always visible. Static strings here; the replay chip carries the recording time.
  chips: {
    live: 'LIVE · sealed on Monad testnet',
    practice: 'PRACTICE · simulated in your browser, not onchain',
    replay: 'REPLAY · every tick links to a real transaction',
    spectate: 'WATCHING LIVE · rebuilt from Monad testnet',
  },
  replayChip(opts?: { recordedAt?: string; name?: string }): string {
    const when = opts?.recordedAt ? fmtRecorded(opts.recordedAt) : '';
    if (when) return `REPLAY · recorded ${when} · every tick links to a real transaction`;
    if (opts?.name) return `REPLAY · ${opts.name} · every tick links to a real transaction`;
    return 'REPLAY · every tick links to a real transaction';
  },
  chipHints: {
    live: 'This run is sealed in real transactions on Monad testnet.',
    practice: 'This run is simulated in your browser. Nothing here is onchain.',
    replay: 'This is a recorded run. Each tick links to the real transaction that sealed it.',
    spectate: 'You are watching the live bank, rebuilt from chain data alone.',
  },

  // HealthChip
  health: {
    idle: 'Ready',
    sealing: 'Sealing',
    delayed: 'Sealing delayed',
    paused: 'Sealing paused',
    offline: 'Offline',
  },
  healthChip(h: 'idle' | 'sealing' | 'delayed' | 'paused' | 'offline', sealedTick: number, block: bigint | null): string {
    const base = copy.health[h];
    const parts: string[] = [base];
    if (sealedTick > 0) parts.push(`sealed to tick ${sealedTick}`);
    if (block !== null) parts.push(`block ${fmtBlock(block)}`);
    return parts.join(' · ');
  },
  healthDetail: {
    idle: 'Nothing is waiting to be sealed.',
    sealing: 'A batch is on its way to Monad.',
    delayed: 'Monad is taking longer than usual to seal the latest tick.',
    paused: 'Sealing stopped after an error. Retry, or play the recorded run.',
    offline: 'No Monad testnet RPC is answering.',
  },

  // Errors: titles and plain-language bodies (PRD §12.6). C's translateError returns UiError objects;
  // these are the canonical strings for any panel that needs to explain one.
  errors: {
    NotOperator: { title: 'Wrong key', body: "This key can't run the bank. Load the operator key on the Ops page." },
    WrongStatus: { title: 'Bank not ready', body: (actual: string) => `The bank is ${actual}. Reset the bank first.` },
    TickMismatch: { title: 'Screen and chain disagree', body: 'Screen and chain disagree on the tick. Press Reset to start clean.' },
    BadBatch: { title: 'Bad batch', body: (tick: number) => `The engine sent a bad batch (tick ${tick}). Press Reset.` },
    Underfunded: {
      title: 'Bank underfunded',
      body: (have: string, need: string) => `The bank holds ${have} but needs ${need}. Fund it on the Ops page.`,
    },
    LedgerNotLoaded: { title: 'Ledger missing', body: "The depositor ledger isn't loaded onchain yet." },
    LowGas: { title: 'Operator wallet low', body: (balance: string) => `The operator wallet is low on MON (${balance}). Switch to the backup key.` },
    Reserve: { title: 'Reserve rule', body: "Monad's 10 MON reserve rule blocked this send. Top up the operator above 15 MON." },
    Timeout: { title: 'Still sealing', body: (tick: number) => `Monad hasn't sealed tick ${tick} yet. Retrying…` },
    AllRpcsDown: { title: 'Monad unreachable', body: "Can't reach Monad testnet. Retrying every 2 s. Press Shift+R for the recorded run." },
    Other: { title: 'Sealing failed', body: (reason: string) => `Sealing failed: ${reason}. Press Retry, or Shift+R for the recorded run.` },
  },
  errorActions: {
    retry: 'Retry sealing',
    reset: 'Reset the bank',
    replay: 'Play the recorded run',
    ops: 'Open the Ops page',
    backup: 'Switch to backup key',
  },

  // Stamps (the only all-caps copy in the app)
  stamp: {
    failed: { headline: 'BANK FAILED', marathi: 'बँक बुडाली' },
    survived: { headline: 'SURVIVED', ring: 'PAID IN FULL' },
    failedSub(wallMs: number | null, blocks: number | null): string {
      const parts: string[] = [];
      if (wallMs !== null) parts.push(`in ${fmtSeconds(wallMs)}`);
      if (blocks !== null) parts.push(fmtCount(blocks, 'Monad block'));
      return parts.join(' · ');
    },
    survivedSub(wallMs: number | null, blocks: number | null): string {
      return copy.stamp.failedSub(wallMs, blocks);
    },
    verdict: 'Sealing the verdict…',
    aria: {
      failed: 'Stamp: bank failed',
      survived: 'Seal: bank survived, paid in full',
    },
  },

  // Passbook rows: PRD §8.1, verbatim figures. D renders them; the dot-matrix face is Doto.
  passbook: {
    title: 'How long did they last?',
    rows: [
      { id: 'wamu', bank: 'Washington Mutual, 2008', amount: '$19B', span: '16 days', note: 'outflows' },
      { id: 'wachovia', bank: 'Wachovia, 2008', amount: '~$10B', span: '8 days', note: 'outflows' },
      { id: 'svb', bank: 'Silicon Valley Bank, 2023', amount: '$42B', span: '1 day', note: 'in one day, about 25% of deposits' },
    ],
    source: 'Federal Reserve, Review of the Federal Reserve’s Supervision and Regulation of SVB (Apr 2023)',
    youLabel: (bank: string) => bank,
    pmc: {
      title: 'PMC Bank, 2019',
      body: 'In September 2019 the RBI capped withdrawals at ₹1,000 per account, later raised in steps to ₹50,000. Real people lost access to their savings. A withdrawal speed bump is the real-world version of this.',
    },
    fictional: 'All banks in the game are fictional.',
  },

  // Banners (E-07)
  banners: {
    practice: {
      text: 'Practice mode: the bank and its 500 depositors run in your browser. Nothing here is onchain.',
      watch: 'Watch a sealed run',
      follow: 'Follow the live bank',
    },
    replay: {
      text: 'Replay: a recorded run on Monad testnet. Every tick links to a real transaction.',
      textNamed: (name: string, when: string) => `Replay: “${name}”, recorded ${when}. Every tick links to a real transaction.`,
      all: 'All recorded runs',
      practice: 'Try it yourself',
    },
    spectate: {
      text: 'Watching the live bank. This screen is rebuilt from Monad testnet data alone.',
      idle: 'The bank is open. Nobody has started a run yet.',
      lastOutcome: (kind: 'failed' | 'survived', block: string) =>
        kind === 'failed' ? `Last run: the bank failed, sealed at block ${block}.` : `Last run: the bank survived, sealed at block ${block}.`,
      practice: 'Try it yourself',
      replay: 'Watch a sealed run',
    },
    dismiss: 'Dismiss banner',
  },

  // Proof panel (E-05)
  proof: {
    title: 'Proof',
    subtitle: 'Every step of the run, sealed on Monad testnet.',
    close: 'Close proof panel',
    contracts: 'Contracts',
    bank: 'RunBank',
    street: 'Street',
    street_hint: 'Where withdrawn AUSD and fire-sale losses go',
    ausd: 'AUSD token',
    verifiedSource: 'Verified source',
    rumor: 'Rumor transaction',
    rumorBlock: 'Block',
    rumorSealed: 'Sealed',
    biggest: 'Biggest batch',
    biggestHint: 'The most depositors that withdrew in one transaction',
    biggestCount: (n: number) => `${fmtCount(n, 'depositor')} withdrew in one block`,
    gasUsed: 'Gas used',
    sealTime: 'Seal time',
    ticks: 'Ticks',
    verdict: 'Verdict',
    verdictFailed: 'BankFailed',
    verdictSurvived: 'BankSurvived',
    trapped: 'Trapped',
    uninsured: 'Uninsured',
    trappedLine: (count: number, amount: string) => `${fmtCount(count, 'depositor')} trapped with ${amount}`,
    finalized: 'finalized',
    notFinalized: 'not yet final',
    sealedOnly: 'sealed',
    agree: (matched: number, total: number) => `${matched} / ${total} ticks: screen and chain agree`,
    agreeTitle: 'Screen and chain',
    agreeMismatch: (tick: number) => `First mismatch at tick ${tick}`,
    agreeNone: 'No ticks sealed yet',
    decisions: (matched: number, total: number) => `${matched} of ${total} decisions match`,
    decisionsTitle: 'Decision check',
    decisionsHint: 'The public depositor model re-run from chain data alone',
    street_out: 'AUSD that left the bank',
    street_out_hint: 'Live from Monad',
    waiting: 'Waiting for the transaction…',
    simulated: 'simulated',
    recorded: 'recorded',
    explorerNote: 'Links open MonadVision. Monadscan is in the copy menu of each hash.',
    emptyIdle: 'No run yet. Pick a rumor and start one to see its transactions here.',
    practice: {
      title: 'No transactions in Practice',
      body: 'This run happened in your browser, so there is nothing onchain to show. Watch a sealed run to see real transaction links.',
      cta: 'Watch a sealed run',
      stats: 'What the browser run did',
    },
    replay: {
      note: 'Recorded data. Each link opens the real transaction that sealed it.',
    },
    scaleNote: `AUSD values shown with a dollar value at ${DISPLAY_SCALE_NOTE}.`,
  },

  // Ops page (E-06)
  ops: {
    title: 'Operator',
    lead: 'Load a key, check the network, fund the bank, then go to the stage.',
    back: 'Back to the stage',
    steps: {
      key: { label: 'Load operator key', done: 'Operator key loaded' },
      network: { label: 'Fix network', done: 'Network ready' },
      fund: { label: 'Fund the bank', done: 'Bank funded' },
      stage: { label: 'Go to stage', done: 'Ready' },
    },
    key: {
      title: 'Operator key',
      warning: 'Use a testnet-only key. It stays in this tab and is cleared when you close it.',
      primary: 'Primary key',
      backup: 'Backup key (optional)',
      primaryHint: '32-byte hex, starts with 0x',
      rpc: 'RPC override (optional)',
      rpcHint: 'A dedicated Monad testnet HTTPS URL, tried before the public endpoints',
      load: 'Load keys',
      loading: 'Loading keys…',
      forget: 'Forget keys',
      loaded: 'Key loaded',
      operator: 'Operator',
      backupLabel: 'Backup',
      balance: 'Balance',
      testnetOnly: 'testnet',
      invalid: 'That is not a 32-byte hex key.',
      invalidBackup: 'The backup key is not a 32-byte hex key.',
      sameKey: 'The backup key must differ from the primary key.',
      show: 'Show',
      hide: 'Hide',
      fromEnv: 'Loaded from the local environment.',
      fromSession: 'Loaded for this tab.',
      none: 'No key loaded. Practice and Replay work without one.',
      usingBackup: 'Sending from the backup key.',
    },
    preflight: {
      title: 'Preflight',
      run: 'Run checks again',
      running: 'Checking…',
      pass: 'Pass',
      warn: 'Warning',
      fail: 'Fail',
      pending: 'Checking',
      critical: 'Critical',
      optional: 'Optional',
      summaryOk: 'All critical checks pass.',
      summaryBad: (n: number) => `${fmtCount(n, 'critical check')} failing.`,
      empty: 'No checks yet. Load a key, then run the checks.',
      lastRun: (when: string) => `Last run ${when}`,
    },
    actions: {
      title: 'Bank actions',
      fund: 'Fund the bank (10,000 AUSD)',
      funding: 'Funding the bank…',
      fundHint: 'Sends AUSD from the operator to RunBank so the bank holds cash and bonds.',
      ping: 'Send a test transaction',
      pinging: 'Sending test transaction…',
      pingHint: 'A harmless ping that should seal in under 2 s.',
      reset: 'Reset the bank',
      resetting: 'Resetting the bank…',
      resetHint: 'Sweeps AUSD back from Street and restores the balance sheet.',
      save: 'Save last run as replay',
      saving: 'Saving…',
      saveHint: 'Downloads the last real run as a JSON file.',
      saved: 'Replay downloaded.',
      saveNone: 'There is no finished live run to save yet.',
      needKey: 'Load an operator key first.',
      needDeployment: 'The bank is not deployed yet.',
      done: 'Done',
    },
    go: {
      stage: 'Go to stage',
      anyway: 'Go anyway',
      anywayHint: 'Skip the failing checks and open the stage in Practice.',
      blocked: 'Fix the failing critical checks first, or go anyway.',
    },
    footer: {
      build: 'Build',
      deployment: 'Deployment',
      notDeployed: 'Not deployed',
      chain: 'Monad testnet · chain 10143',
    },
  },

  // Replay picker (E-07)
  replays: {
    title: 'Recorded runs',
    lead: 'Each run was sealed on Monad testnet. Every tick links to a real transaction.',
    play: 'Play',
    recorded: (when: string) => `Recorded ${when}`,
    failed: 'Bank failed',
    survived: 'Bank survived',
    empty: 'No recorded runs yet.',
    emptyHint: 'Play in Practice, or follow the live bank, while the first run is being recorded.',
    loading: 'Loading recorded runs…',
    loadError: "Couldn't load the list of recorded runs.",
    retry: 'Try again',
    practice: 'Play in Practice',
    follow: 'Follow the live bank',
    back: 'Back to the stage',
  },

  // Closing card (E-10)
  closing: {
    line: 'A game for people. A stress test for protocols.',
    body: "Plug in your stablecoin's redemption logic and see if it survives a block-speed run.",
    link: 'The link is live:',
    play: 'Play',
    replay: 'Replay',
    watch: 'Watch live',
    qrAlt: 'QR code that opens the live bank in Watch mode',
    qrCaption: 'Scan to watch',
    adapter: 'Plug in your protocol: swap in your own withdrawal rules and rerun the same rumor.',
  },

  // Labs
  labs: {
    brand: 'Brand lab',
    panels: 'Panels lab',
  },

  // Generic
  generic: {
    loading: 'Loading…',
    offline: 'Offline',
    unknown: 'Unknown',
    yes: 'Yes',
    no: 'No',
    verified: 'Verified',
    notDeployed: 'Not deployed',
    ausdAmount: 'AUSD',
    tx: 'Transaction',
    address: 'Address',
    block: 'Block',
  },

  // Value context (PRD §13.3 rule 4)
  value: {
    withScale: (ausd: string, usd: string) => `${ausd} · ${usd} at ${DISPLAY_SCALE_NOTE}`,
  },
} as const;

export type Copy = typeof copy;
