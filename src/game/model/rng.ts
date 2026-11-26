/** A random source that can be injected for reproducible simulation setup. */
export interface RandomSource {
  next(): number;
}

/** Seeded random source whose 32-bit state can be snapshotted and restored. */
export interface SeededRandomSource extends RandomSource {
  getState(): number;
  setState(seed: number): void;
}

/** Deterministic 32-bit linear congruential generator. */
export const createSeededRandom = (seed: number): SeededRandomSource => {
  let state = seed >>> 0;
  return {
    next: () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    },
    getState: () => state,
    setState: (nextSeed: number) => {
      state = nextSeed >>> 0;
    },
  };
};
