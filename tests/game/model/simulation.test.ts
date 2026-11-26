import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import type { BallData, BrickData, Explosion } from '../../../src/types';
import { FIXED_STEP } from '../../../src/game/constants';
import { BrickManager } from '../../../src/game/BrickManager';
import { createSeededRandom } from '../../../src/game/model/rng';
import {
  advanceBoardWorld,
  applyBoardClickDamage,
  createBoardWorld,
  damageBoardBricks,
  explodeBoard,
  findBrickAt,
  findWeakestBrick,
  refreshBoardWorld,
  resolveBrickDamageBatch,
  simulateBall,
  stepBoardWorld,
  takeBoardEvents,
  updateBoardExplosions,
  type BoardWorld,
} from '../../../src/game/model';

const makeBrick = (overrides: Partial<BrickData> = {}): BrickData => ({
  id: 'brick-a',
  x: 100,
  y: 100,
  width: 60,
  height: 25,
  tier: 1,
  health: new Decimal(3),
  maxHealth: new Decimal(3),
  value: new Decimal(5),
  ...overrides,
});

const makeBall = (overrides: Partial<BallData> = {}): BallData => ({
  id: 'ball-a',
  type: 'basic',
  x: 94,
  y: 112,
  dx: 3,
  dy: 0,
  ...overrides,
});

const makeWorld = (
  balls: BallData[] = [],
  bricks: BrickData[] = [],
  overrides: Partial<{
    speedMultiplier: number;
    damageMultiplier: Decimal | number;
    coinMultiplier: Decimal | number;
    time: number;
  }> = {}
): BoardWorld => createBoardWorld({
  width: 800,
  height: 500,
  balls,
  bricks,
  ...overrides,
});

const snapshot = (world: BoardWorld): string => JSON.stringify({
  balls: world.balls,
  bricks: world.bricks,
  explosions: world.explosions,
  accumulator: world.accumulator,
  time: world.time,
  events: world.events,
}, (_key, value: unknown) => value instanceof Decimal ? value.toString() : value);

describe('pure board model', () => {
  it('produces identical balls, bricks, and events for identical fixed-step inputs', () => {
    const ball = makeBall({ type: 'sniper' });
    const seededBricks = () => new BrickManager(
      { width: 800, height: 500 },
      createSeededRandom(42)
    ).generateBricks(3, 2).map((brick, index) => ({
      ...brick,
      x: 100 + index * 70,
      y: 100,
      health: new Decimal(index + 1),
      maxHealth: new Decimal(index + 1),
    }));
    const first = makeWorld([ball], seededBricks(), { time: 1000, coinMultiplier: 2 });
    const second = makeWorld([{ ...ball }], seededBricks(), {
      time: 1000,
      coinMultiplier: 2,
    });
    const firstEvents: unknown[] = [];
    const secondEvents: unknown[] = [];

    for (let frame = 0; frame < 10; frame++) {
      advanceBoardWorld(first, FIXED_STEP, 1008 + frame * FIXED_STEP);
      advanceBoardWorld(second, FIXED_STEP, 1008 + frame * FIXED_STEP);
      firstEvents.push(...takeBoardEvents(first));
      secondEvents.push(...takeBoardEvents(second));
      expect(snapshot(first)).toBe(snapshot(second));
    }
    expect(firstEvents).toEqual(secondEvents);
  });

  it('waits for the fixed step and clamps stalled frames to five steps', () => {
    const world = makeWorld([makeBall()]);
    expect(advanceBoardWorld(world, FIXED_STEP - 1)).toBe(FIXED_STEP - 1);
    expect(world.balls[0].x).toBe(94);
    expect(world.accumulator).toBe(FIXED_STEP - 1);
    expect(advanceBoardWorld(world, FIXED_STEP)).toBe(FIXED_STEP);
    expect(world.accumulator).toBe(FIXED_STEP - 1);
    expect(world.balls[0].x).toBeGreaterThan(94);

    const stalled = makeWorld([makeBall()]);
    expect(advanceBoardWorld(stalled, 1000)).toBe(FIXED_STEP * 5);
    expect(stalled.accumulator).toBe(0);
  });

  it('bounces at the viewport boundary without changing speed', () => {
    const world = makeWorld([makeBall({ x: 791, dx: 5, dy: 4 })], [], { speedMultiplier: 2 });
    stepBoardWorld(world);
    expect(world.balls[0].x).toBe(792);
    expect(world.balls[0].dx).toBeLessThan(0);
    expect(Math.hypot(world.balls[0].dx, world.balls[0].dy)).toBeCloseTo(6);
  });

  it('awards a brick once on a one-shot collision and records reward data', () => {
    const world = makeWorld([makeBall()], [makeBrick({ health: new Decimal(1), maxHealth: new Decimal(1) })], {
      coinMultiplier: 2,
    });
    stepBoardWorld(world);
    const events = takeBoardEvents(world);
    expect(world.bricks).toHaveLength(0);
    expect(events.map((event) => event.type)).toEqual(['brickDamaged', 'brickDestroyed']);
    const reward = events[1];
    expect(reward.type).toBe('brickDestroyed');
    if (reward.type === 'brickDestroyed') {
      expect(reward.coins.eq(10)).toBe(true);
      expect(reward.particleCount).toBe(10);
      expect(reward.showCoinText).toBe(true);
    }

    stepBoardWorld(world);
    expect(takeBoardEvents(world)).toEqual([]);
  });

  it('applies damage in board order and aggregates duplicate operations', () => {
    const bricks = [makeBrick({ id: 'a', health: new Decimal(10) }), makeBrick({ id: 'b' })];
    const resolution = resolveBrickDamageBatch(bricks, [
      { id: 'b', damage: new Decimal(1) },
      { id: 'missing', damage: new Decimal(10) },
      { id: 'a', damage: new Decimal(2) },
      { id: 'a', damage: new Decimal(3) },
    ], 1234);
    expect(resolution.results.map((result) => result.id)).toEqual(['a', 'b']);
    expect(resolution.results[0].damage.eq(5)).toBe(true);
    expect(resolution.bricks[0].health.eq(5)).toBe(true);
    expect(resolution.bricks[0].lastHitTime).toBe(1234);
    expect(resolveBrickDamageBatch(bricks, [], 0).bricks).toBe(bricks);
  });

  it('reduces basic hits on armored bricks but lets heavy balls pierce', () => {
    const basicWorld = makeWorld([], [
      makeBrick({ id: 'armor-basic', kind: 'armored', health: new Decimal(10), maxHealth: new Decimal(10) }),
    ]);
    damageBoardBricks(basicWorld, [{ id: 'armor-basic', damage: new Decimal(4) }], {
      source: 'ball',
      ballType: 'basic',
      coinMultiplier: 1,
      particleCount: 1,
      showCoinText: true,
    });
    expect(basicWorld.bricks[0].health.eq(9)).toBe(true);

    const heavyWorld = makeWorld([], [
      makeBrick({ id: 'armor-heavy', kind: 'armored', health: new Decimal(10), maxHealth: new Decimal(10) }),
    ]);
    damageBoardBricks(heavyWorld, [{ id: 'armor-heavy', damage: new Decimal(4) }], {
      source: 'ball',
      ballType: 'heavy',
      coinMultiplier: 1,
      particleCount: 1,
      showCoinText: true,
    });
    expect(heavyWorld.bricks[0].health.eq(6)).toBe(true);
  });

  it('damages nearby bricks once through explosive area-of-effect events', () => {
    const world = makeWorld([makeBall({ type: 'explosive' })], [
      makeBrick({ id: 'hit', health: new Decimal(2), maxHealth: new Decimal(2) }),
      makeBrick({ id: 'nearby', x: 130, health: new Decimal(1), maxHealth: new Decimal(1) }),
      makeBrick({ id: 'far', x: 300, health: new Decimal(1), maxHealth: new Decimal(1) }),
    ]);
    stepBoardWorld(world);
    expect(world.bricks.map((brick) => brick.id)).toEqual(['far']);
    const events = takeBoardEvents(world);
    const destroyed = events.filter((event) => event.type === 'brickDestroyed');
    expect(destroyed).toHaveLength(2);
    const directHit = destroyed.find((event) => event.brick.id === 'hit');
    const areaHit = destroyed.find((event) => event.brick.id === 'nearby');
    expect(directHit?.source).toBe('ball');
    expect(directHit?.particleCount).toBe(10);
    expect(directHit?.showCoinText).toBe(true);
    expect(areaHit?.source).toBe('explosion');
    expect(areaHit?.particleCount).toBe(8);
    expect(areaHit?.showCoinText).toBe(false);
    expect(events.filter((event) => event.type === 'explosion')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'explosionShake')).toHaveLength(1);
  });

  it('can explode independently and keeps non-destroyed damage events', () => {
    const world = makeWorld([], [makeBrick()]);
    explodeBoard(world, 130, 112, 70, new Decimal(2));
    expect(world.bricks[0].health.eq(2)).toBe(true);
    expect(world.events.map((event) => event.type)).toEqual(['brickDamaged', 'explosion']);
    world.events = [];
    damageBoardBricks(world, [{ id: 'brick-a', damage: new Decimal(3) }], {
      source: 'click',
      coinMultiplier: 3,
      particleCount: 5,
      showCoinText: true,
      showDamageText: () => true,
    });
    expect(world.bricks).toHaveLength(0);
    const destroyed = world.events[1];
    expect(destroyed.type).toBe('brickDestroyed');
    if (destroyed.type === 'brickDestroyed') expect(destroyed.coins.eq(15)).toBe(true);
  });

  it('targets the weakest brick and preserves a stationary zero-velocity ball', () => {
    const bricks = [
      makeBrick({ id: 'strong', health: new Decimal(10) }),
      makeBrick({ id: 'weak', x: 180, health: new Decimal(1) }),
    ];
    expect(findWeakestBrick(bricks)?.id).toBe('weak');
    expect(findWeakestBrick([])).toBeNull();

    const world = makeWorld([makeBall({ type: 'sniper', x: 400, y: 400, dx: 0, dy: 0 })], bricks);
    world.target = findWeakestBrick(world.bricks);
    simulateBall(world, world.balls[0], FIXED_STEP);
    expect(world.balls[0].dx).toBeLessThan(0);
    expect(world.balls[0].dy).toBeLessThan(0);

    const stationary = makeWorld([makeBall({ dx: 0, dy: 0 })]);
    simulateBall(stationary, stationary.balls[0], FIXED_STEP);
    expect([stationary.balls[0].dx, stationary.balls[0].dy]).toEqual([0, 0]);
  });

  it('finds clicks on inclusive brick edges and applies click damage and rewards', () => {
    const world = makeWorld([], [makeBrick({ health: new Decimal(0.5), maxHealth: new Decimal(0.5) })], {
      damageMultiplier: 2,
      coinMultiplier: 2,
    });
    expect(findBrickAt(world, 100, 100)?.id).toBe('brick-a');
    expect(findBrickAt(world, 160, 125)?.id).toBe('brick-a');
    expect(findBrickAt(world, 161, 125)).toBeUndefined();
    expect(applyBoardClickDamage(world, 200, 200)).toBeUndefined();
    expect(applyBoardClickDamage(world, 110, 110)?.id).toBe('brick-a');
    expect(world.bricks).toHaveLength(0);
    const events = takeBoardEvents(world);
    expect(events[0].type).toBe('brickDamaged');
    if (events[0].type === 'brickDamaged') {
      expect(events[0].damage.eq(1)).toBe(true);
      expect(events[0].showDamageText).toBe(true);
    }
    if (events[1].type === 'brickDestroyed') expect(events[1].coins.eq(10)).toBe(true);
    refreshBoardWorld(world);
    expect(world.target).toBeNull();
  });

  it('ages and removes explosions using explicit delta time', () => {
    const explosions: Explosion[] = [{ x: 1, y: 2, radius: 3, life: 12, maxLife: 300 }];
    const world = makeWorld([], [], {});
    world.explosions = explosions;
    updateBoardExplosions(world, 8);
    expect(world.explosions[0].life).toBe(4);
    expect(explosions[0].life).toBe(12);
    updateBoardExplosions(world, 8);
    expect(world.explosions).toEqual([]);
  });

  it('supports Decimal multipliers beyond Number.MAX_VALUE without overflow', () => {
    const hugeDamage = new Decimal('1e400');
    const hugeCoins = new Decimal('1e400');
    const brick = makeBrick({
      health: new Decimal('1e400'),
      maxHealth: new Decimal('1e400'),
      value: new Decimal('1e50'),
    });
    const world = makeWorld([makeBall()], [brick], {
      damageMultiplier: hugeDamage,
      coinMultiplier: hugeCoins,
    });

    stepBoardWorld(world);
    const events = takeBoardEvents(world);
    const destroyed = events.find((event) => event.type === 'brickDestroyed');
    expect(destroyed?.type).toBe('brickDestroyed');
    if (destroyed?.type === 'brickDestroyed') {
      expect(destroyed.coins.eq('1e450')).toBe(true);
    }
  });
});
