// Placeholder from F-00. Owner: E. Replace freely.
// Every user-facing string lives here. D and E read from it; nobody hardcodes copy in components.
export const copy = {
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
    reset: 'Reset the bank',
    resetting: 'Resetting the bank…',
    switching: 'Switching bank…',
    retry: 'Retry sealing',
    pickRumor: 'Pick a rumor to start the run',
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
  chips: {
    live: 'LIVE · sealed on Monad testnet',
    practice: 'PRACTICE · simulated in your browser, not onchain',
    replay: 'REPLAY · every tick links to a real transaction',
    spectate: 'WATCHING LIVE · rebuilt from Monad testnet',
  },
} as const;
