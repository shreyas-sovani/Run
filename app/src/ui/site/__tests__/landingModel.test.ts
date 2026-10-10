import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadModel } from '@/engine';
import { NodeState } from '@/types';
import type { ReplayFile, ReplayIndexEntry } from '@/types';
import { buildStory, chooseHero, heroCandidates, newestReplayId } from '../landingModel';

const replay = (id: string): ReplayFile =>
  JSON.parse(readFileSync(new URL(`../../../../public/replays/${id}.json`, import.meta.url), 'utf8')) as ReplayFile;
const index = JSON.parse(
  readFileSync(new URL('../../../../public/replays/index.json', import.meta.url), 'utf8'),
) as ReplayIndexEntry[];

describe('choosing the featured recording', () => {
  it('only considers failed runs of Bhau’s Bank, newest first', () => {
    const c = heroCandidates(index);
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((e) => e.kind === 'failed' && e.level === 0)).toBe(true);
    for (let i = 1; i < c.length; i++) expect(Date.parse(c[i - 1].recordedAt)).toBeGreaterThanOrEqual(Date.parse(c[i].recordedAt));
  });

  it('prefers the demo card (W), else the fastest failure, else nothing', () => {
    const w = replay('bhaus-w-failed-202610100809');
    const r = replay('bhaus-r-failed-202610100809');
    const survived = replay('mutual-w-survived-202610100809');
    expect(chooseHero([r, w, survived])?.id).toBe(w.id);
    expect(chooseHero([r, { ...r, id: 'slow', outcome: { ...r.outcome, atMs: 99_999 } }])?.id).toBe(r.id);
    expect(chooseHero([survived])).toBeNull();
    expect(chooseHero([])).toBeNull();
  });

  it('newestReplayId picks the latest recording of any kind', () => {
    const newest = index.slice().sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0];
    expect(newestReplayId(index)).toBe(newest.id);
    expect(newestReplayId([])).toBeNull();
  });
});

describe('buildStory on the recorded Bhau’s Bank × W run', () => {
  const model = loadModel();
  const file = replay('bhaus-w-failed-202610100809');
  const story = buildStory(model, file);

  it('derives the passbook line from the recording', () => {
    expect(story.hero.id).toBe(file.id);
    expect(story.hero.wallMs).toBe(file.outcome.atMs);
    expect(story.hero.blocks).toBe(Number(BigInt(file.outcome.blockNumber) - BigInt(file.rumor.blockNumber)));
    expect(story.hero.year).toBe('2026');
    // Withdrawn = deposits0 − what the bank still owes at failure = 9,500 AUSD − the trapped amount.
    expect(story.hero.withdrawn).toBe(9_500_000_000n - BigInt(file.outcome.trappedAmount));
  });

  it('keeps three ticks in order, ending on the verdict the contract emitted', () => {
    const [spread, run, verdict] = story.frames;
    expect(spread.tick).toBeLessThan(run.tick);
    expect(run.tick).toBeLessThan(verdict.tick);
    expect(verdict.tick).toBe(file.outcome.tick);
    expect(spread.heard).toBeGreaterThanOrEqual(model.graph.nodes.length / 10);
    expect(verdict.trapped).toBe(file.outcome.trappedCount);
    expect(verdict.trappedAmount).toBe(BigInt(file.outcome.trappedAmount));
    expect(verdict.nodeState.filter((s) => s === NodeState.Trapped).length).toBe(file.outcome.trappedCount);
  });

  it('copies node states so later ticks cannot change an earlier frame', () => {
    expect(story.frames[0].nodeState).not.toBe(story.frames[2].nodeState);
    expect(story.frames[0].nodeState.some((s, i) => s !== story.frames[2].nodeState[i])).toBe(true);
  });
});
