/** A random source that can be injected for reproducible simulation setup. */
export interface RandomSource {
  next(): number;
}

/** Deterministic 32-bit linear congruential generator. */
export const createSeededRandom = (seed: number): RandomSource => {
  let state = seed >>> 0;
  return {
    next: () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    },
  };
};
