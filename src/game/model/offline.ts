import Decimal from 'break_infinity.js';
import {
  LIVE_INCOME_CALIBRATION,
  MAX_OFFLINE_SECONDS,
  calculateIncomePerSecond,
} from '../../store/earnings';
import {
  MAX_TIER,
  OFFLINE_EARNINGS_RATE,
  getPrestigeMultiplier,
  type BallData,
  type BrickData,
} from '../../types';
import { BrickManager } from '../BrickManager';
import { FIXED_STEP, MIN_BRICKS_ON_SCREEN } from '../constants';
import { createSeededRandom } from './rng';
import {
  createBoardWorld,
  refreshBoardWorld,
  stepBoardWorld,
  takeBoardEvents,
} from './simulation';

/** Default cap on directly simulated seconds to bound CPU time during long absences. */
export const DEFAULT_MAX_SIMULATED_SECONDS = 60;

/** Default deterministic RNG seed used when the caller does not provide one. */
export const DEFAULT_OFFLINE_SEED = 1;

export interface OfflineSimulationInput {
  width: number;
  height: number;
  balls: BallData[];
  bricks: BrickData[];
  speedMultiplier: number;
  damageMultiplier: number;
  coinMultiplier: number;
  prestigeLevel: number;
  currentTier: number;
  initialBricksBroken?: Decimal;
  elapsedSeconds: number;
  seed?: number;
  maxSimulatedSeconds?: number;
  offlineRate?: number;
}

export interface OfflineSimulationResult {
  coinsEarned: Decimal;
  bricksBroken: number;
  simulatedSeconds: number;
  effectiveSeconds: number;
  finalBricks: BrickData[];
  finalBalls: BallData[];
}

const cloneBall = (ball: BallData): BallData => ({ ...ball });

const cloneBrick = (brick: BrickData): BrickData => ({
  ...brick,
  health: new Decimal(brick.health),
  maxHealth: new Decimal(brick.maxHealth),
  value: new Decimal(brick.value),
});

/**
 * Deterministically fast-forwards the board simulation for an offline interval.
 *
 * Simulates up to `maxSimulatedSeconds` (default 60s) using the pure fixed-step
 * board core and a seeded `BrickManager`, then extrapolates any remaining time
 * up to `MAX_OFFLINE_SECONDS` (24h) from the measured simulated rate (with a
 * calibrated nominal fallback if no bricks were broken during the budget).
 */
export const simulateOfflineBoard = (
  input: OfflineSimulationInput
): OfflineSimulationResult => {
  const safeElapsed = Number.isFinite(input.elapsedSeconds)
    ? Math.max(0, input.elapsedSeconds)
    : 0;
  const effectiveSeconds = Math.min(safeElapsed, MAX_OFFLINE_SECONDS);

  const rawMaxSim = input.maxSimulatedSeconds ?? DEFAULT_MAX_SIMULATED_SECONDS;
  const maxSimulatedSeconds = Number.isFinite(rawMaxSim)
    ? Math.max(0, rawMaxSim)
    : DEFAULT_MAX_SIMULATED_SECONDS;

  const rawOfflineRate = input.offlineRate ?? OFFLINE_EARNINGS_RATE;
  const offlineRate = Number.isFinite(rawOfflineRate)
    ? Math.max(0, rawOfflineRate)
    : OFFLINE_EARNINGS_RATE;

  const initialBalls = input.balls.map(cloneBall);
  const initialBricks = input.bricks.map(cloneBrick);

  if (effectiveSeconds <= 0 || initialBalls.length === 0) {
    return {
      coinsEarned: new Decimal(0),
      bricksBroken: 0,
      simulatedSeconds: 0,
      effectiveSeconds,
      finalBricks: initialBricks,
      finalBalls: initialBalls,
    };
  }

  const simulatedSeconds = Math.min(effectiveSeconds, maxSimulatedSeconds);
  const seed = input.seed ?? DEFAULT_OFFLINE_SEED;
  const random = createSeededRandom(seed);
  const brickManager = new BrickManager(
    { width: input.width, height: input.height },
    random
  );

  let activeTier = Math.max(1, Math.min(MAX_TIER, Math.floor(input.currentTier)));
  const baseBricksBroken = input.initialBricksBroken ?? new Decimal(0);
  const prestigeMultiplier = getPrestigeMultiplier(input.prestigeLevel);

  const world = createBoardWorld({
    width: input.width,
    height: input.height,
    balls: initialBalls,
    bricks: initialBricks,
    speedMultiplier: input.speedMultiplier,
    damageMultiplier: input.damageMultiplier,
    coinMultiplier: input.coinMultiplier,
    time: 0,
  });

  const refillTarget = Math.min(MIN_BRICKS_ON_SCREEN, brickManager.getCapacity());
  if (world.bricks.length < refillTarget) {
    const initialFill = brickManager.addBricksToFillScreen(world.bricks, activeTier);
    if (initialFill.length > 0) {
      world.bricks = [...world.bricks, ...initialFill];
      refreshBoardWorld(world);
    }
  }

  const totalSteps = Math.floor((simulatedSeconds * 1000) / FIXED_STEP);
  let simulatedCoins = new Decimal(0);
  let simulatedBricksBroken = 0;

  for (let step = 0; step < totalSteps; step++) {
    world.time += FIXED_STEP;
    stepBoardWorld(world, FIXED_STEP);

    const events = takeBoardEvents(world);
    if (events.length === 0) continue;

    for (const event of events) {
      if (event.type !== 'brickDestroyed') continue;
      simulatedBricksBroken += 1;
      simulatedCoins = simulatedCoins.add(event.coins.mul(prestigeMultiplier));

      const runBricks = baseBricksBroken.add(simulatedBricksBroken);
      const nextTier = Math.min(MAX_TIER, 1 + runBricks.div(100).floor().toNumber());
      if (nextTier > activeTier) {
        activeTier = nextTier;
      }
    }

    if (world.bricks.length < refillTarget) {
      const newBricks = brickManager.addBricksToFillScreen(world.bricks, activeTier);
      if (newBricks.length > 0) {
        world.bricks = [...world.bricks, ...newBricks];
      }
    }

    refreshBoardWorld(world);
  }

  let totalGrossCoins: Decimal;
  let totalBricksBroken = simulatedBricksBroken;

  if (simulatedSeconds > 0 && simulatedCoins.gt(0)) {
    const remainingSeconds = effectiveSeconds - simulatedSeconds;
    if (remainingSeconds > 0) {
      const coinRatePerSecond = simulatedCoins.div(simulatedSeconds);
      const brickRatePerSecond = simulatedBricksBroken / simulatedSeconds;
      totalGrossCoins = simulatedCoins.add(coinRatePerSecond.mul(remainingSeconds));
      totalBricksBroken = simulatedBricksBroken + Math.floor(brickRatePerSecond * remainingSeconds);
    } else {
      totalGrossCoins = simulatedCoins;
    }
  } else {
    const fallbackRate = calculateIncomePerSecond(
      initialBalls,
      input.speedMultiplier,
      input.damageMultiplier,
      input.coinMultiplier,
      input.prestigeLevel,
      activeTier
    ).mul(LIVE_INCOME_CALIBRATION);
    totalGrossCoins = fallbackRate.mul(effectiveSeconds);
  }

  const coinsEarned = totalGrossCoins.mul(offlineRate).floor();

  return {
    coinsEarned,
    bricksBroken: totalBricksBroken,
    simulatedSeconds,
    effectiveSeconds,
    finalBricks: world.bricks.map(cloneBrick),
    finalBalls: world.balls.map(cloneBall),
  };
};
