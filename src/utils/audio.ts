/**
 * Tiny Web Audio sound effects module.
 *
 * Goals:
 *  - Zero asset files: every effect is synthesised on demand from a couple of
 *    oscillators + envelopes, so the production bundle is unchanged.
 *  - AudioContext is created only after the first user gesture unlocks it.
 *  - Respect a `getEnabled()` flag so the UI can mute everything.
 *
 * The exported `playSound` helper is intentionally fire-and-forget; failures
 * are swallowed so missing Web Audio support never breaks the game.
 */

export type SoundName = 'ballBounce' | 'brickBreak' | 'coin' | 'purchase' | 'prestige';

interface AudioModule {
  getContext: () => AudioContext | null;
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
  unlock: () => void;
  play: (name: SoundName) => void;
}

interface EnvelopeOptions {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  peak: number;
}

const DEFAULT_ENVELOPE: EnvelopeOptions = {
  attack: 0.005,
  decay: 0.05,
  sustain: 0.4,
  release: 0.12,
  peak: 0.18,
};

const SOUND_COOLDOWN_MS = 30;
const MAX_VOICES = 8;
// The longest cue stops at 0.56 s; keep its voice slot slightly longer.
const VOICE_RELEASE_MS = 600;
const THROTTLED_SOUNDS: ReadonlySet<SoundName> = new Set([
  'ballBounce',
  'brickBreak',
  'coin',
]);

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const applyEnvelope = (
  gain: GainNode,
  startTime: number,
  options: Partial<EnvelopeOptions> = {}
): number => {
  const env: EnvelopeOptions = { ...DEFAULT_ENVELOPE, ...options };
  const { attack, decay, sustain, release, peak } = env;
  const safePeak = clamp(peak, 0, 1);

  gain.gain.cancelScheduledValues(startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(safePeak, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, safePeak * sustain),
    startTime + attack + decay
  );
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    startTime + attack + decay + release
  );

  return startTime + attack + decay + release;
};

const createBlip = (
  ctx: AudioContext,
  frequency: number,
  type: OscillatorType,
  options: Partial<EnvelopeOptions> = {}
): void => {
  const start = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  const stopAt = applyEnvelope(gain, start, options);
  oscillator.start(start);
  oscillator.stop(stopAt + 0.02);
};

const createNoiseBurst = (
  ctx: AudioContext,
  durationMs: number,
  options: Partial<EnvelopeOptions> = {}
): void => {
  const start = ctx.currentTime;
  const sampleCount = Math.max(1, Math.floor((durationMs / 1000) * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    channel[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1200;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  applyEnvelope(gain, start, options);
  source.start(start);
  source.stop(start + durationMs / 1000 + 0.05);
};

const playBallBounce = (ctx: AudioContext) => {
  createBlip(ctx, 420, 'sine', { attack: 0.002, decay: 0.04, sustain: 0.2, release: 0.05, peak: 0.12 });
};

const playBrickBreak = (ctx: AudioContext) => {
  createNoiseBurst(ctx, 80, { attack: 0.002, decay: 0.05, sustain: 0.1, release: 0.04, peak: 0.18 });
  createBlip(ctx, 240, 'square', { attack: 0.001, decay: 0.03, sustain: 0.1, release: 0.04, peak: 0.08 });
};

const playCoin = (ctx: AudioContext) => {
  const start = ctx.currentTime;
  createBlip(ctx, 880, 'sine', { attack: 0.001, decay: 0.04, sustain: 0.0, release: 0.05, peak: 0.14 });
  // Second note slightly higher
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1320, start + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  applyEnvelope(gain, start + 0.05, { attack: 0.001, decay: 0.06, sustain: 0.0, release: 0.06, peak: 0.14 });
  osc.start(start + 0.05);
  osc.stop(start + 0.18);
};

const playPurchase = (ctx: AudioContext) => {
  const start = ctx.currentTime;
  createBlip(ctx, 660, 'triangle', { attack: 0.001, decay: 0.04, sustain: 0.0, release: 0.06, peak: 0.16 });
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(990, start + 0.06);
  osc.connect(gain);
  gain.connect(ctx.destination);
  applyEnvelope(gain, start + 0.06, { attack: 0.001, decay: 0.06, sustain: 0.0, release: 0.08, peak: 0.16 });
  osc.start(start + 0.06);
  osc.stop(start + 0.22);
};

const playPrestige = (ctx: AudioContext) => {
  const start = ctx.currentTime;
  // Three ascending notes
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start + index * 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    applyEnvelope(gain, start + index * 0.08, {
      attack: 0.002,
      decay: 0.08,
      sustain: 0.1,
      release: 0.18,
      peak: 0.18,
    });
    osc.start(start + index * 0.08);
    osc.stop(start + index * 0.08 + 0.4);
  });
};

const SOUND_PLAYERS: Record<SoundName, (ctx: AudioContext) => void> = {
  ballBounce: playBallBounce,
  brickBreak: playBrickBreak,
  coin: playCoin,
  purchase: playPurchase,
  prestige: playPrestige,
};

/**
 * Returns the singleton audio module. The module is intentionally a plain
 * object (not a React hook) so it can be called from Phaser code paths
 * (`useGameStore.getState().purchaseBall(...)`) and from React components.
 *
 * Stored on `globalThis` so HMR, dynamic imports, and module duplication in
 * tests all return the same instance.
 */
const GLOBAL_KEY = '__idleBricksAudioModule__';

const buildAudioModule = (): AudioModule => {
  let context: AudioContext | null = null;
  let enabled = true;
  let unlocked = false;
  let resumePending = false;
  const lastPlayedAt: Partial<Record<SoundName, number>> = {};
  const voiceStartedAt: number[] = [];

  const getContext = (): AudioContext | null => context;

  const resume = (ctx: AudioContext): void => {
    if (ctx.state !== 'suspended' || resumePending) return;
    resumePending = true;
    void ctx.resume().catch(() => {
      // Ignore resume failures; we'll try again on the next unlock()/play().
    }).finally(() => {
      resumePending = false;
    });
  };

  const unlock = (): void => {
    unlocked = true;
    if (context) {
      resume(context);
      return;
    }
    if (typeof window === 'undefined') return;
    const AudioCtor: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    try {
      context = new AudioCtor();
      resume(context);
    } catch {
      context = null;
    }
  };

  const play = (name: SoundName): void => {
    if (!enabled || !unlocked) return;
    const ctx = getContext();
    if (!ctx) return;

    const now = performance.now();
    while (voiceStartedAt.length > 0 && now - voiceStartedAt[0] >= VOICE_RELEASE_MS) {
      voiceStartedAt.shift();
    }
    if (voiceStartedAt.length >= MAX_VOICES) return;
    if (THROTTLED_SOUNDS.has(name)) {
      const lastPlayed = lastPlayedAt[name] ?? -Infinity;
      if (now - lastPlayed < SOUND_COOLDOWN_MS) return;
    }

    lastPlayedAt[name] = now;
    voiceStartedAt.push(now);
    resume(ctx);
    try {
      SOUND_PLAYERS[name](ctx);
    } catch {
      // Swallow audio errors: missing context, autoplay policy, etc.
    }
  };

  return {
    getContext,
    isEnabled: () => enabled,
    setEnabled: (next) => {
      enabled = next;
    },
    unlock,
    play,
  };
};

export const getAudioModule = (): AudioModule => {
  const globalScope = globalThis as unknown as { [GLOBAL_KEY]?: AudioModule };
  if (!globalScope[GLOBAL_KEY]) {
    globalScope[GLOBAL_KEY] = buildAudioModule();
  }
  return globalScope[GLOBAL_KEY]!;
};

/** Convenience helper for callers that just want a one-liner. */
export const playSound = (name: SoundName): void => {
  getAudioModule().play(name);
};
