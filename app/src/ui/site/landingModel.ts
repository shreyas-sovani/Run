// Pure derivations for the landing page: which recording to feature, the passbook's last line, and three frames of
// the recorded run. Everything here is recomputed from a committed replay file with the engine, never typed in.
import { createRun, stepRunWithRequested } from '@/engine';
import type { Model, ReplayFile, ReplayIndexEntry, SimFrame } from '@/types';

/** The demo's rumor card (`W`, "The audit is delayed."). The landing features a run of it when one is recorded. */
const DEMO_CARD = 1;

/** Failed runs of Bhau's Bank, newest first: the candidates for the hero passbook. */
export function heroCandidates(entries: ReplayIndexEntry[]): ReplayIndexEntry[] {
  return entries
    .filter((e) => e.kind === 'failed' && e.level === 0)
    .slice()
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
}

/** Prefer the demo's card; otherwise the fastest failure. `null` when nothing qualifies. */
export function chooseHero(files: ReplayFile[]): ReplayFile | null {
  const failed = files.filter((f) => f.outcome.kind === 'failed' && f.params.level === 0);
  if (failed.length === 0) return null;
  const demo = failed.find((f) => f.params.card === DEMO_CARD);
  if (demo) return demo;
  return failed.slice().sort((a, b) => a.outcome.atMs - b.outcome.atMs)[0];
}

/** Newest recording of any kind, for "Watch a sealed run". */
export function newestReplayId(entries: ReplayIndexEntry[]): string | null {
  let best: ReplayIndexEntry | null = null;
  for (const e of entries) if (!best || Date.parse(e.recordedAt) > Date.parse(best.recordedAt)) best = e;
  return best?.id ?? null;
}

export interface HeroFigures {
  id: string;
  year: string;
  wallMs: number;
  blocks: number;
  withdrawn: bigint; // base units: deposits0 − depositsOwed at the outcome
}

export interface StoryFrame {
  tick: number;
  nodeState: Uint8Array;
  heard: number;
  withdrew: number;
  withdrawn: bigint;
  trapped: number;
  trappedAmount: bigint;
}

export interface Story {
  hero: HeroFigures;
  frames: [StoryFrame, StoryFrame, StoryFrame]; // spread, run, verdict
}

function snapshot(frame: SimFrame): StoryFrame {
  let heard = 0;
  for (let i = 0; i < frame.heardAt.length; i++) if (frame.heardAt[i] >= 0) heard++;
  const bank = frame.bank;
  const trapped = frame.last?.trapped ?? null;
  return {
    tick: frame.tick,
    nodeState: frame.nodeState.slice(),
    heard,
    withdrew: bank.withdrawnCount,
    withdrawn: bank.deposits0 - bank.depositsOwed,
    trapped: trapped?.count ?? 0,
    trappedAmount: trapped?.amount ?? 0n,
  };
}

/**
 * Re-run the recording through the engine (the same path Replay mode uses) and keep three ticks: the rumor
 * spreading (the first tick where a tenth of depositors have heard, at least two ticks before the end), the tick
 * before the verdict (the run at full speed), and the verdict.
 */
export function buildStory(model: Model, file: ReplayFile): Story {
  let run = createRun(model, {
    level: file.params.level,
    card: file.params.card,
    seedNode: file.params.seedNode,
    modelSeed: BigInt(file.params.modelSeed),
  });
  const frames: StoryFrame[] = [snapshot(run.frame)]; // frames[i].tick === i
  for (const t of file.ticks) {
    run = stepRunWithRequested(model, run, t.requested).run;
    frames.push(snapshot(run.frame));
    if (run.frame.bank.status !== 'running') break;
  }
  const n = model.graph.nodes.length;
  const lastTick = frames.length - 1;
  const firstWide = frames.findIndex((f) => f.heard >= n / 10);
  const spreadTick = Math.max(0, Math.min(firstWide < 0 ? lastTick : firstWide, lastTick - 2));
  const runTick = Math.max(spreadTick, lastTick - 1);
  const last = frames[lastTick];
  const rumorBlock = BigInt(file.rumor.blockNumber);
  const outcomeBlock = BigInt(file.outcome.blockNumber);
  return {
    hero: {
      id: file.id,
      year: String(new Date(file.recordedAt).getFullYear()),
      wallMs: file.outcome.atMs,
      blocks: Math.max(1, Number(outcomeBlock - rumorBlock)),
      withdrawn: last.withdrawn,
    },
    frames: [frames[spreadTick], frames[runTick], last],
  };
}
