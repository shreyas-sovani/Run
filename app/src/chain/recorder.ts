// Recorder and replay loading (PRD §12.7, §16.1, C-09). Times are milliseconds after the rumor receipt.
import type { ReplayFile, ReplayIndexEntry } from '@/types';
import { NETWORK } from '@/config/network';
import { ZERO_HASH } from './decode';
import { deployment } from './deployment';
import type { Recorder } from './types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function createRecorder(): Recorder {
  let partial: Omit<ReplayFile, 'outcome'> | null = null;
  let done: ReplayFile | null = null;
  /** Wall-clock time of the rumor receipt: every recorded time is relative to it. */
  let t0 = 0;

  return {
    begin(params, rumor, modelHash) {
      t0 = Date.now();
      done = null;
      partial = {
        version: 1,
        id: `run-${rumor.runId}-${t0}`,
        name: `Run ${rumor.runId}`,
        recordedAt: new Date(t0).toISOString(),
        chainId: NETWORK.chainId,
        runBank: deployment.runBank ?? ZERO_ADDRESS,
        runId: rumor.runId,
        params: { level: params.level, card: params.card, seedNode: params.seedNode, modelSeed: params.modelSeed.toString(), modelHash },
        rumor: { txHash: rumor.txHash, blockNumber: rumor.blockNumber.toString() },
        ticks: [],
        seals: [],
      };
    },

    add(r) {
      if (!partial || r.record.kind !== 'ticks' || r.ticks.length === 0) return;
      const have = new Set(partial.ticks.map((t) => t.tick));
      for (const t of r.ticks) {
        if (!have.has(t.tick)) partial.ticks.push({ tick: t.tick, requested: t.requested });
      }
      partial.ticks.sort((a, b) => a.tick - b.tick);
      const sealedAt = r.record.sealedAtMs ?? Date.now();
      partial.seals.push({
        fromTick: r.record.fromTick ?? r.ticks[0].tick,
        toTick: r.record.toTick ?? r.ticks[r.ticks.length - 1].tick,
        txHash: r.record.txHash ?? ZERO_HASH,
        blockNumber: (r.record.blockNumber ?? 0n).toString(),
        sentAtMs: Math.max(0, r.record.sentAtMs - t0),
        sealedAtMs: Math.max(0, sealedAt - t0),
        gasUsed: (r.record.gasUsed ?? 0n).toString(),
      });
    },

    finish(o) {
      if (!partial) return null;
      done = {
        ...partial,
        outcome: {
          kind: o.kind,
          tick: o.tick,
          txHash: o.txHash,
          blockNumber: o.blockNumber.toString(),
          atMs: Math.max(0, Date.now() - t0),
          trappedCount: o.trappedCount,
          trappedAmount: o.trappedAmount.toString(),
          uninsuredTrapped: o.uninsuredTrapped.toString(),
        },
      };
      return done;
    },

    current() {
      return done;
    },
  };
}

export async function listReplays(): Promise<ReplayIndexEntry[]> {
  try {
    const res = await fetch('/replays/index.json');
    if (!res.ok) return [];
    const j = (await res.json()) as unknown;
    return Array.isArray(j) ? (j as ReplayIndexEntry[]) : [];
  } catch {
    return [];
  }
}

export async function loadReplay(id: string): Promise<ReplayFile> {
  const res = await fetch(`/replays/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error(`Replay "${id}" was not found.`);
  const file = (await res.json()) as ReplayFile;
  if (file.version !== 1 || !Array.isArray(file.ticks)) throw new Error(`Replay "${id}" is not a valid replay file.`);
  return file;
}
