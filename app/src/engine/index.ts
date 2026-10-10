// Engine barrel (PRD §16.2). Owner: B. Pure TypeScript, deterministic, no React / DOM / fetch.
export { TICK_MS, MAX_LEAD, loadModel, defaultParams } from './model';
export { bestSeeds } from './seeds';
export { createRun, stepRun, stepRunWithRequested, replayTicks, verifyDecisions } from './run';
export { applyTick, initialBank, hashConfig } from './bank';
