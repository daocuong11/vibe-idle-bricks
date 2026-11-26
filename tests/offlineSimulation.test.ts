import { describe, expect, it } from 'vitest';
import Decimal from 'break_infinity.js';
import { BrickManager } from '../src/game/BrickManager';
import { MIN_BRICKS_ON_SCREEN } from '../src/game/constants';
import {
  DEFAULT_MAX_SIMULATED_SECONDS,
  createSeededRandom,
  simulateOfflineBoard,
  type OfflineSimulationInput,
} from '../src/game/model';
import { MAX_OFFLINE_SECONDS } from '../src/store/earnings';
import type { BallData, BrickData } from '../src/types';

const makeBalls = (count = 2): BallData[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `ball-${i}`,
    type: i % 2 === 0 ? 'fast' : 'sniper',
    x: 200 + i * 80,
    y: 350,
    dx: 3 + i,
    dy: -4,
  }));

const makeSeededBricks = (seed = 42, count = 25, tier = 1): BrickData[] =>
  new BrickManager({ width: 800, height: 500 }, createSeededRandom(seed)).generateBricks(
    count,
    tier
  );

const makeInput = (overrides: Partial<OfflineSimulationInput> = {}): OfflineSimulationInput => ({
  width: 800,
  height: 500,
  balls: makeBalls(2),
  bricks: makeSeededBricks(42, 25, 1),
  speedMultiplier: 1,
  damageMultiplier: 1,
  coinMultiplier: 1,
  prestigeLevel: 0,
  currentTier: 1,
  elapsedSeconds: 30,
  seed: 12345,
  ...overrides,
});

const serializeBricks = (bricks: BrickData[]): string =>
  JSON.stringify(
    bricks.map((b) => ({
      ...b,
      health: b.health.toString(),
      maxHealth: b.maxHealth.toString(),
      value: b.value.toString(),
    }))
  );

describe('simulateOfflineBoard', () => {
  it('is 100% deterministic for identical inputs, seed, and elapsed seconds', () => {
    const inputA = makeInput({ elapsedSeconds: 30, seed: 999 });
    const inputB = makeInput({ elapsedSeconds: 30, seed: 999 });

    const resultA = simulateOfflineBoard(inputA);
    const resultB = simulateOfflineBoard(inputB);

    expect(resultA.coinsEarned.eq(resultB.coinsEarned)).toBe(true);
    expect(resultA.bricksBroken).toBe(resultB.bricksBroken);
    expect(resultA.simulatedSeconds).toBe(resultB.simulatedSeconds);
    expect(resultA.effectiveSeconds).toBe(resultB.effectiveSeconds);
    expect(serializeBricks(resultA.finalBricks)).toBe(serializeBricks(resultB.finalBricks));
    expect(resultA.finalBalls).toEqual(resultB.finalBalls);
  });

  it('does not mutate caller balls or bricks arrays', () => {
    const balls = makeBalls(2);
    const bricks = makeSeededBricks(42, 25, 1);
    const initialBallX = balls[0].x;
    const initialBrickCount = bricks.length;

    simulateOfflineBoard(makeInput({ balls, bricks, elapsedSeconds: 20 }));

    expect(balls[0].x).toBe(initialBallX);
    expect(bricks.length).toBe(initialBrickCount);
  });

  it('returns 0 coins and 0 bricks broken when there are 0 balls', () => {
    const result = simulateOfflineBoard(
      makeInput({
        balls: [],
        elapsedSeconds: 3600,
      })
    );

    expect(result.coinsEarned.eq(0)).toBe(true);
    expect(result.bricksBroken).toBe(0);
    expect(result.simulatedSeconds).toBe(0);
    expect(result.effectiveSeconds).toBe(3600);
    expect(result.finalBalls).toEqual([]);
    expect(result.finalBricks).toHaveLength(25);
  });

  it('returns 0 coins for zero, negative, or non-finite elapsed seconds', () => {
    for (const elapsedSeconds of [0, -100, Number.NaN]) {
      const result = simulateOfflineBoard(makeInput({ elapsedSeconds }));
      expect(result.coinsEarned.eq(0)).toBe(true);
      expect(result.bricksBroken).toBe(0);
      expect(result.effectiveSeconds).toBe(0);
    }
  });

  it('directly simulates short absences (10s to 60s) within the step budget', () => {
    const short10 = simulateOfflineBoard(makeInput({ elapsedSeconds: 10 }));
    const short60 = simulateOfflineBoard(makeInput({ elapsedSeconds: 60 }));

    expect(short10.simulatedSeconds).toBe(10);
    expect(short10.effectiveSeconds).toBe(10);
    expect(short10.bricksBroken).toBeGreaterThan(0);
    expect(short10.coinsEarned.gt(0)).toBe(true);

    expect(short60.simulatedSeconds).toBe(DEFAULT_MAX_SIMULATED_SECONDS);
    expect(short60.effectiveSeconds).toBe(60);
    expect(short60.bricksBroken).toBeGreaterThanOrEqual(short10.bricksBroken);
    expect(short60.coinsEarned.gte(short10.coinsEarned)).toBe(true);
  });

  it('bounds CPU time on long absences, scales monotonically, and caps at 24h', () => {
    const start = performance.now();
    const res5m = simulateOfflineBoard(makeInput({ elapsedSeconds: 5 * 60 }));
    const res24h = simulateOfflineBoard(makeInput({ elapsedSeconds: MAX_OFFLINE_SECONDS }));
    const res48h = simulateOfflineBoard(makeInput({ elapsedSeconds: MAX_OFFLINE_SECONDS * 2 }));
    const durationMs = performance.now() - start;

    // 3 runs of 60s fixed-step simulation should finish well under 1 second
    expect(durationMs).toBeLessThan(1000);

    expect(res5m.simulatedSeconds).toBe(DEFAULT_MAX_SIMULATED_SECONDS);
    expect(res5m.effectiveSeconds).toBe(300);

    expect(res24h.simulatedSeconds).toBe(DEFAULT_MAX_SIMULATED_SECONDS);
    expect(res24h.effectiveSeconds).toBe(MAX_OFFLINE_SECONDS);

    expect(res48h.effectiveSeconds).toBe(MAX_OFFLINE_SECONDS);
    expect(res48h.coinsEarned.eq(res24h.coinsEarned)).toBe(true);
    expect(res48h.bricksBroken).toBe(res24h.bricksBroken);

    expect(res24h.coinsEarned.gt(res5m.coinsEarned)).toBe(true);
    expect(res24h.bricksBroken).toBeGreaterThan(res5m.bricksBroken);
  });

  it('refills bricks during fast-forward so the board does not run dry', () => {
    const initialBricks = makeSeededBricks(7, 5, 1);
    const balls = makeBalls(4);

    const result = simulateOfflineBoard(
      makeInput({
        balls,
        bricks: initialBricks,
        elapsedSeconds: 30,
        speedMultiplier: 2,
        damageMultiplier: 5,
      })
    );

    expect(result.bricksBroken).toBeGreaterThan(initialBricks.length);
    expect(result.finalBricks.length).toBeGreaterThanOrEqual(MIN_BRICKS_ON_SCREEN);
  });

  it('falls back to calibrated nominal income when no bricks are broken in the budget', () => {
    const result = simulateOfflineBoard(
      makeInput({
        elapsedSeconds: 3600,
        maxSimulatedSeconds: 0,
      })
    );

    expect(result.simulatedSeconds).toBe(0);
    expect(result.bricksBroken).toBe(0);
    expect(result.coinsEarned.gt(0)).toBe(true);
  });

  it('supports tiers above 20 and Decimal multipliers beyond Number.MAX_VALUE', () => {
    const result = simulateOfflineBoard(
      makeInput({
        currentTier: 35,
        prestigeLevel: 200,
        damageMultiplier: new Decimal('1e400'),
        coinMultiplier: new Decimal('1e400'),
        bricks: makeSeededBricks(7, 10, 35),
        elapsedSeconds: 30,
      })
    );

    expect(result.coinsEarned.toString()).not.toBe('NaN');
    expect(result.coinsEarned.gt('1e400')).toBe(true);
    expect(result.bricksBroken).toBeGreaterThan(0);
  });
});
