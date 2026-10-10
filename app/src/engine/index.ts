// Engine barrel (PRD §16.2). Owner: B.
// Real: applyTick / initialBank / hashConfig (bank mirror, PRD §9).
// Still the bootstrap fixture until B-06/B-07 land: loadModel, defaultParams, createRun, stepRun, stepRunWithRequested,
// replayTicks, verifyDecisions.
export { TICK_MS, MAX_LEAD, loadModel, defaultParams, createRun, stepRun, stepRunWithRequested, replayTicks, verifyDecisions } from './fixture';
export { applyTick, initialBank, hashConfig } from './bank';
