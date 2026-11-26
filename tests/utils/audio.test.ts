import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAudioModule, playSound } from '../../src/utils/audio';
import type { SoundName } from '../../src/utils/audio';

const createAudioContextMock = () => {
  const starts = { oscillators: 0, buffers: 0 };
  const context = {
    state: 'suspended' as AudioContextState,
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    createOscillator: vi.fn(() => ({
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(() => {
        starts.oscillators += 1;
      }),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: {
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
    createBuffer: vi.fn(() => ({
      getChannelData: () => new Float32Array(128),
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(() => {
        starts.buffers += 1;
      }),
      stop: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: 'highpass',
      frequency: { value: 0 },
      connect: vi.fn(),
    })),
  };
  const constructor = vi.fn(function () {
    return context;
  });
  return { context, constructor, starts };
};

const resetAudioModule = () => {
  delete (globalThis as unknown as { __idleBricksAudioModule__?: unknown })
    .__idleBricksAudioModule__;
};

const installAudioContext = () => {
  const mock = createAudioContextMock();
  vi.stubGlobal('AudioContext', mock.constructor);
  return mock;
};

describe('audio module', () => {
  beforeEach(() => {
    resetAudioModule();
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetAudioModule();
  });

  it('returns a stable, enabled module instance', () => {
    const audio = getAudioModule();
    expect(getAudioModule()).toBe(audio);
    expect(audio.isEnabled()).toBe(true);
    audio.setEnabled(false);
    expect(getAudioModule().isEnabled()).toBe(false);
    audio.setEnabled(true);
    expect(audio.isEnabled()).toBe(true);
  });

  it('does not create an AudioContext or play before unlock', () => {
    const { constructor, starts } = installAudioContext();
    const audio = getAudioModule();

    (['ballBounce', 'brickBreak', 'coin', 'purchase', 'prestige'] as const).forEach(
      (name) => audio.play(name)
    );

    expect(audio.getContext()).toBeNull();
    expect(constructor).not.toHaveBeenCalled();
    expect(starts).toEqual({ oscillators: 0, buffers: 0 });
  });

  it('creates and resumes the context on unlock, idempotently', async () => {
    const { context, constructor } = installAudioContext();
    const audio = getAudioModule();

    audio.unlock();
    audio.unlock();

    expect(constructor).toHaveBeenCalledTimes(1);
    expect(audio.getContext()).toBe(context);
    expect(context.resume).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();
    context.state = 'suspended';
    audio.unlock();
    expect(context.resume).toHaveBeenCalledTimes(2);
  });

  it('keeps the jsdom no-audio behavior as a safe no-op', () => {
    const audio = getAudioModule();
    expect(audio.getContext()).toBeNull();
    expect(() => audio.unlock()).not.toThrow();
    expect(() => playSound('ballBounce')).not.toThrow();
    expect(() => playSound('brickBreak')).not.toThrow();
    expect(() => playSound('coin')).not.toThrow();
    expect(() => playSound('purchase')).not.toThrow();
    expect(() => playSound('prestige')).not.toThrow();
    expect(audio.getContext()).toBeNull();
  });

  it.each([
    ['ballBounce', 1],
    ['brickBreak', 1],
    ['coin', 2],
  ] as const)(
    'suppresses rapid %s repeats until the 30 ms cooldown expires',
    (name, oscillatorsPerPlay) => {
      const { starts } = installAudioContext();
      const audio = getAudioModule();
      audio.unlock();

      audio.play(name);
      const afterFirst = starts.oscillators;
      expect(afterFirst).toBe(oscillatorsPerPlay);

      audio.play(name);
      vi.advanceTimersByTime(29);
      audio.play(name);
      expect(starts.oscillators).toBe(afterFirst);

      vi.advanceTimersByTime(1);
      audio.play(name);
      expect(starts.oscillators).toBe(afterFirst + oscillatorsPerPlay);
    }
  );

  it('tracks cooldowns independently for each sound', () => {
    const { starts } = installAudioContext();
    const audio = getAudioModule();
    audio.unlock();

    audio.play('ballBounce');
    audio.play('brickBreak');
    audio.play('coin');

    expect(starts.oscillators).toBe(4);
    expect(starts.buffers).toBe(1);
  });

  it.each([
    ['purchase', 2],
    ['prestige', 3],
  ] as const)('does not cooldown %s', (name: SoundName, oscillatorsPerPlay) => {
    const { starts } = installAudioContext();
    const audio = getAudioModule();
    audio.unlock();

    audio.play(name);
    audio.play(name);

    expect(starts.oscillators).toBe(oscillatorsPerPlay * 2);
  });

  it('caps concurrent sound voices at eight until a slot is released', () => {
    const { starts } = installAudioContext();
    const audio = getAudioModule();
    audio.unlock();

    for (let i = 0; i < 12; i++) {
      audio.play(i % 2 === 0 ? 'brickBreak' : 'ballBounce');
      vi.advanceTimersByTime(30);
    }
    expect(starts.oscillators).toBe(8);

    vi.advanceTimersByTime(600);
    audio.play('brickBreak');
    expect(starts.oscillators).toBe(9);
  });

  it('creates no sound while muted, before or after unlock', () => {
    const { context, starts } = installAudioContext();
    const audio = getAudioModule();
    audio.setEnabled(false);

    audio.play('ballBounce');
    audio.unlock();
    (['ballBounce', 'brickBreak', 'coin', 'purchase', 'prestige'] as const).forEach(
      (name) => audio.play(name)
    );

    expect(starts).toEqual({ oscillators: 0, buffers: 0 });
    expect(context.resume).toHaveBeenCalledTimes(1);

    audio.setEnabled(true);
    audio.play('ballBounce');
    expect(starts.oscillators).toBe(1);
  });
});
