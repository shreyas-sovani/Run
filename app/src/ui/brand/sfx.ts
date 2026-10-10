// Sound (PRD §14.5): Web Audio synthesis only, no audio files. Everything is quiet by design:
// it runs next to a speaker in a lit room, under a presenter's voice.
//
// Browsers keep an AudioContext suspended until a user gesture, so `unlock()` is called by the app on the
// first key press or click. This module also arms a one-time listener itself, so a hotkey is enough.
// Brand code must not import the store (store → brand), so mute state is also read from the same
// localStorage key the store persists (`run.muted`) and kept in sync through `setMuted`.

const MUTE_KEY = 'run.muted';
const MASTER_LEVEL = 0.9;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = readMuted();
let unlocked = false;

let alarmNodes: { osc: OscillatorNode; gain: GainNode; timer: number } | null = null;
let murmurNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let murmurLevel = 0;
let alarmWanted = false; // remembered so an alarm requested before the first gesture starts on unlock

function readMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function Ctor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const C = Ctor();
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_LEVEL;
  master.connect(ctx.destination);
  return ctx;
}

/** Two seconds of white noise, looped for the crowd and sliced for the thud. */
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  // Deterministic LCG: the same crowd every time, and no Math.random in a module used by tests.
  let x = 0x2545f491;
  for (let i = 0; i < len; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    data[i] = (x / 0x80000000) - 1;
  }
  noiseBuf = buf;
  return buf;
}

/** Plays a sound only when the context is running (otherwise the gesture rule would queue it for later). */
function live(): AudioContext | null {
  const c = ensure();
  if (!c || muted || c.state !== 'running') return null;
  return c;
}

/** Restarts whatever the app asked for while we were silent (locked or muted). */
function resume(): void {
  const c = live();
  if (c && alarmWanted) startAlarm(c);
  applyMurmur();
}

/**
 * Builds the AudioContext, master gain and noise buffer while the main thread is idle, so the first alarm or thud
 * (the moment cash hits zero) doesn't pay for them (a CPU profile caught ~450 ms in `ensure()` on a cold start).
 * A context created before a gesture stays suspended; that is fine, `unlock()` resumes it.
 */
function prewarm(): void {
  if (typeof window === 'undefined') return;
  const run = () => {
    const c = ensure();
    if (c) noise(c);
  };
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(run, { timeout: 2000 });
  else window.setTimeout(run, 300);
}

function armUnlock(): void {
  if (typeof window === 'undefined') return;
  const handler = () => {
    window.removeEventListener('pointerdown', handler, true);
    window.removeEventListener('keydown', handler, true);
    void sfx.unlock();
  };
  window.addEventListener('pointerdown', handler, true);
  window.addEventListener('keydown', handler, true);
}

function startAlarm(c: AudioContext): void {
  if (alarmNodes || !master) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const filter = c.createBiquadFilter();
  osc.type = 'triangle';
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  gain.gain.value = 0;
  osc.connect(filter).connect(gain).connect(master);
  osc.start();
  gain.gain.setTargetAtTime(0.05, c.currentTime, 0.05);
  // Two tones, alternating (a european-style two-tone, not a siren): 660 Hz and 880 Hz every 380 ms.
  let hi = false;
  const flip = () => {
    hi = !hi;
    osc.frequency.setTargetAtTime(hi ? 880 : 660, c.currentTime, 0.008);
  };
  osc.frequency.value = 660;
  const timer = window.setInterval(flip, 380);
  alarmNodes = { osc, gain, timer };
}

function stopAlarm(): void {
  if (!alarmNodes || !ctx) return;
  const { osc, gain, timer } = alarmNodes;
  alarmNodes = null;
  window.clearInterval(timer);
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  osc.stop(ctx.currentTime + 0.4);
}

function applyMurmur(): void {
  const c = ctx;
  if (!c || !master) return;
  if (murmurLevel <= 0.001 || muted || c.state !== 'running') {
    if (murmurNodes) {
      murmurNodes.gain.gain.setTargetAtTime(0, c.currentTime, 0.2);
      const { src } = murmurNodes;
      murmurNodes = null;
      src.stop(c.currentTime + 1.2);
    }
    return;
  }
  if (!murmurNodes) {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.7;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(band).connect(gain).connect(master);
    src.start();
    murmurNodes = { src, gain };
  }
  // A crowd swells in loudness and in pitch as it panics.
  const g = murmurNodes.gain.gain;
  g.setTargetAtTime(0.012 + murmurLevel * 0.07, c.currentTime, 0.35);
}

export interface Sfx {
  /** Resumes audio. Call from a user gesture; safe to call many times. Resolves once the context is running (or it can't). */
  unlock(): Promise<void>;
  /** The two-tone bank alarm, looped and quiet. */
  alarm(on: boolean): void;
  /** The stamp landing: a low sine drop plus a short noise burst. */
  thud(): void;
  /** A very soft paper tick for each sealed batch. */
  seal(): void;
  /** The crowd, swelling with panic. `level` 0–1; 0 fades it out. */
  murmur(level: number): void;
  setMuted(m: boolean): void;
  stopAll(): void;
  /** Additive: for the preflight row "audio unlocked". */
  isUnlocked(): boolean;
  /** Additive: current mute state. */
  isMuted(): boolean;
}

export const sfx: Sfx = {
  async unlock(): Promise<void> {
    const c = ensure();
    if (!c) return;
    noise(c); // no-op when prewarmed
    try {
      if (c.state !== 'running') await c.resume();
    } catch {
      return;
    }
    unlocked = c.state === 'running';
    if (unlocked) resume();
  },

  alarm(on: boolean): void {
    alarmWanted = on;
    if (!on) {
      stopAlarm();
      return;
    }
    const c = live();
    if (c) startAlarm(c);
  },

  thud(): void {
    const c = live();
    if (!c || !master) return;
    const t = c.currentTime;
    // Body: a sine falling from 150 Hz to 38 Hz.
    const osc = c.createOscillator();
    const og = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.32);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(og).connect(master);
    osc.start(t);
    osc.stop(t + 0.45);
    // Rubber on paper: a short low-passed noise burst.
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.12);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.28, t + 0.006);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(lp).connect(ng).connect(master);
    src.start(t, 0.1);
    src.stop(t + 0.15);
  },

  seal(): void {
    const c = live();
    if (!c || !master) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.03);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.06);
  },

  murmur(level: number): void {
    murmurLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
    applyMurmur();
  },

  setMuted(m: boolean): void {
    muted = m;
    if (ctx && master) master.gain.setTargetAtTime(m ? 0 : MASTER_LEVEL, ctx.currentTime, 0.02);
    if (m) {
      stopAlarm();
      applyMurmur();
    } else {
      resume();
    }
  },

  stopAll(): void {
    alarmWanted = false;
    stopAlarm();
    murmurLevel = 0;
    applyMurmur();
  },

  isUnlocked(): boolean {
    return unlocked && ctx !== null && ctx.state === 'running';
  },

  isMuted(): boolean {
    return muted;
  },
};

armUnlock();
prewarm();
