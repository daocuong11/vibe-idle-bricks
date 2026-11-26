import Decimal from 'break_infinity.js';
import { BALL_TYPES } from '../../types';
import type { BallData, BrickData, Explosion } from '../../types';
import { SpatialGrid } from '../SpatialGrid';
import {
  BALL_HIT_PARTICLE_COUNT,
  BALL_RADIUS,
  CLICK_DAMAGE_BASE,
  CLICK_PARTICLE_COUNT,
  EXPLOSION_DAMAGE_MULTIPLIER,
  EXPLOSION_HIT_PARTICLE_COUNT,
  FIXED_STEP,
  clampAccumulator,
  clampFrameDelta,
} from '../constants';
import {
  resolveBrickDamageBatch,
  type BrickDamageOperation,
  type BrickDamageResult,
} from './damage';
import {
  applyBallMovement,
  ballCollidesWithBrick,
  calculateBounce,
  findWeakestBrick,
  isBrickWithinRadius,
  normalizeVelocity,
  seekTarget,
} from './physics';
import type { BoardEvent, BoardWorld, DamageSource } from './types';

interface BoardWorldInput {
  width: number;
  height: number;
  balls: BallData[];
  bricks: BrickData[];
  explosions?: Explosion[];
  speedMultiplier?: number;
  damageMultiplier?: Decimal | number;
  coinMultiplier?: Decimal | number;
  time?: number;
}

const toMultiplierDecimal = (value: Decimal | number | undefined): Decimal => {
  if (value === undefined) return new Decimal(1);
  return value instanceof Decimal ? value : new Decimal(value);
};

export const createBoardWorld = (input: BoardWorldInput): BoardWorld => {
  const world: BoardWorld = {
    width: input.width,
    height: input.height,
    balls: [...input.balls],
    bricks: [...input.bricks],
    explosions: [...(input.explosions ?? [])],
    speedMultiplier: input.speedMultiplier ?? 1,
    damageMultiplier: toMultiplierDecimal(input.damageMultiplier),
    coinMultiplier: toMultiplierDecimal(input.coinMultiplier),
    accumulator: 0,
    time: input.time ?? 0,
    spatialGrid: new SpatialGrid(100),
    target: null,
    events: [],
  };
  refreshBoardWorld(world);
  return world;
};

/** Rebuilds derived collision/target data after a board replacement or refill. */
export const refreshBoardWorld = (world: BoardWorld): void => {
  world.spatialGrid.rebuild(world.bricks);
  world.target = findWeakestBrick(world.bricks);
};

interface BoardDamageOptions {
  source: DamageSource;
  coinMultiplier: Decimal | number;
  particleCount: number;
  showCoinText: boolean;
  showDamageText?: (result: BrickDamageResult) => boolean;
}

/** Applies batched damage and records the presentation/reward intent as data. */
export const damageBoardBricks = (
  world: BoardWorld,
  operations: BrickDamageOperation[],
  options: BoardDamageOptions
): BrickDamageResult[] => {
  const { bricks, results } = resolveBrickDamageBatch(
    world.bricks,
    operations,
    world.time
  );
  world.bricks = bricks;

  for (const result of results) {
    world.events.push({
      type: 'brickDamaged',
      brick: result.brick,
      damage: result.damage,
      source: options.source,
      showDamageText: options.showDamageText?.(result) ?? false,
    });
    if (result.destroyed) {
      world.events.push({
        type: 'brickDestroyed',
        brick: result.brick,
        coins: result.brick.value.mul(options.coinMultiplier),
        source: options.source,
        particleCount: options.particleCount,
        showCoinText: options.showCoinText,
      });
    }
  }

  return results;
};

export const explodeBoard = (
  world: BoardWorld,
  x: number,
  y: number,
  radius: number,
  damage: Decimal
): void => {
  const candidates = world.spatialGrid.queryBounds(x - radius, y - radius, x + radius, y + radius);
  const impacted = candidates.filter((brick) => isBrickWithinRadius(x, y, radius, brick));
  damageBoardBricks(
    world,
    impacted.map((brick) => ({ id: brick.id, damage: damage.mul(EXPLOSION_DAMAGE_MULTIPLIER) })),
    {
      source: 'explosion',
      coinMultiplier: world.coinMultiplier,
      particleCount: EXPLOSION_HIT_PARTICLE_COUNT,
      showCoinText: false,
    }
  );
  world.events.push({ type: 'explosion', x, y, radius });
};

export const checkBrickCollisions = (
  world: BoardWorld,
  ball: BallData
): { dx: number; dy: number } | null => {
  const config = BALL_TYPES[ball.type];
  const damage = new Decimal(config.damage).mul(world.damageMultiplier);
  for (const brick of world.spatialGrid.query(ball, BALL_RADIUS)) {
    if (!ballCollidesWithBrick(ball, brick)) continue;

    damageBoardBricks(world, [{ id: brick.id, damage }], {
      source: 'ball',
      coinMultiplier: world.coinMultiplier,
      particleCount: BALL_HIT_PARTICLE_COUNT,
      showCoinText: true,
      showDamageText: (result) =>
        !result.destroyed && (config.damage > 1 || config.explosive || ball.type === 'sniper'),
    });

    if (config.explosive && config.explosionRadius) {
      explodeBoard(world, ball.x, ball.y, config.explosionRadius, damage);
      world.events.push({ type: 'explosionShake' });
    }

    if (!config.pierce) return calculateBounce(ball, brick);
  }
  return null;
};

export const simulateBall = (world: BoardWorld, ball: BallData, step: number): void => {
  const config = BALL_TYPES[ball.type];
  const speed = config.speed * world.speedMultiplier;
  const initialVelocity = normalizeVelocity(ball.dx, ball.dy, speed);
  let dx = initialVelocity.dx;
  let dy = initialVelocity.dy;

  if (config.targeting && world.bricks.length > 0) {
    [dx, dy] = seekTarget(ball, dx, dy, world.target ?? findWeakestBrick(world.bricks));
  }

  const moved = applyBallMovement({ ...ball, dx, dy }, step, world.width, world.height);
  ball.x = moved.x;
  ball.y = moved.y;
  ball.dx = moved.dx;
  ball.dy = moved.dy;

  const bounce = checkBrickCollisions(world, ball);
  if (bounce) {
    ball.dx = bounce.dx;
    ball.dy = bounce.dy;
  }
  const normalized = normalizeVelocity(ball.dx, ball.dy, speed);
  ball.dx = normalized.dx;
  ball.dy = normalized.dy;
};

/** Advances exactly one fixed physics step; no wall-clock or store access. */
export const stepBoardWorld = (world: BoardWorld, step: number = FIXED_STEP): void => {
  for (const ball of world.balls) simulateBall(world, ball, step);
};

export const updateBoardExplosions = (world: BoardWorld, delta: number): void => {
  world.explosions = world.explosions
    .map((explosion) => ({ ...explosion, life: explosion.life - delta }))
    .filter((explosion) => explosion.life > 0);
};

/** Clamps frame time and runs the accumulated fixed steps. Returns simulated time. */
export const advanceBoardWorld = (
  world: BoardWorld,
  delta: number,
  time: number = world.time + delta
): number => {
  const frameDelta = clampFrameDelta(delta);
  world.time = time;
  world.accumulator = clampAccumulator(world.accumulator, frameDelta);
  while (world.accumulator >= FIXED_STEP) {
    stepBoardWorld(world);
    world.accumulator -= FIXED_STEP;
  }
  updateBoardExplosions(world, frameDelta);
  return frameDelta;
};

export const findBrickAt = (world: BoardWorld, x: number, y: number): BrickData | undefined => {
  return world.spatialGrid
    .queryBounds(x - 5, y - 5, x + 5, y + 5)
    .find((brick) => x >= brick.x && x <= brick.x + brick.width && y >= brick.y && y <= brick.y + brick.height);
};

export const applyBoardClickDamage = (world: BoardWorld, x: number, y: number): BrickData | undefined => {
  const brick = findBrickAt(world, x, y);
  if (!brick) return undefined;

  const damage = world.damageMultiplier.mul(CLICK_DAMAGE_BASE);
  damageBoardBricks(world, [{ id: brick.id, damage }], {
    source: 'click',
    coinMultiplier: world.coinMultiplier,
    particleCount: CLICK_PARTICLE_COUNT,
    showCoinText: true,
    showDamageText: () => true,
  });
  return brick;
};

export const takeBoardEvents = (world: BoardWorld): BoardEvent[] => world.events.splice(0);
