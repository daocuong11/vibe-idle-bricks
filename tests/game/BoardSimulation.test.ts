import Decimal from 'break_infinity.js';
import { afterEach, expect, it, vi } from 'vitest';
import { BoardSimulation } from '../../src/game/BoardSimulation';
import { useGameStore } from '../../src/store';
import { FIXED_STEP } from '../../src/game/constants';
import type { BallData, BrickData } from '../../src/types';

const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));

const createEffects = () => ({
  showFloatingText: vi.fn(),
  emitBrickBreakParticles: vi.fn(),
  shakeExplosion: vi.fn(),
});

const makeBrick = (overrides: Partial<BrickData> = {}): BrickData => ({
  ...useGameStore.getState().bricks[0],
  x: 100,
  y: 100,
  width: 60,
  height: 25,
  health: new Decimal(0.5),
  maxHealth: new Decimal(3),
  value: new Decimal(5),
  ...overrides,
});

const makeBall = (overrides: Partial<BallData> = {}): BallData => ({
  id: 'ball-test',
  type: 'basic',
  x: 94,
  y: 112,
  dx: 3,
  dy: 0,
  ...overrides,
});

it('routes a board-space click through the grid and awards a destroyed brick once', () => {
  const effects = createEffects();
  const simulation = new BoardSimulation({ width: 800, height: 500 }, effects);
  const brick = makeBrick();
  useGameStore.getState().setBricks([brick]);
  simulation.step(0);
  const coins = useGameStore.getState().coins;
  simulation.handleBrickClick(brick.x + 1, brick.y + 1);
  simulation.handleBrickClick(brick.x + 1, brick.y + 1);
  expect(useGameStore.getState().coins.eq(coins.add(brick.value))).toBe(true);
  expect(effects.emitBrickBreakParticles).toHaveBeenCalledTimes(1);
});

it('destroys a brick on a ball hit and awards its value once', () => {
  const effects = createEffects();
  const simulation = new BoardSimulation({ width: 800, height: 500 }, effects);
  const brick = makeBrick();
  useGameStore.getState().setBricks([brick]);
  useGameStore.setState({ balls: [makeBall()] });

  simulation.step(0);
  const coins = useGameStore.getState().coins;
  simulation.step(FIXED_STEP);

  expect(useGameStore.getState().bricks.some((item) => item.id === brick.id)).toBe(false);
  expect(useGameStore.getState().coins.eq(coins.add(brick.value))).toBe(true);
  expect(effects.emitBrickBreakParticles).toHaveBeenCalled();
});

it('applies explosive damage to nearby bricks', () => {
  const effects = createEffects();
  const simulation = new BoardSimulation({ width: 800, height: 500 }, effects);
  const first = makeBrick({ id: 'brick-a', x: 100 });
  const second = makeBrick({ id: 'brick-b', x: 130 });
  useGameStore.getState().setBricks([first, second]);
  useGameStore.setState({ balls: [makeBall({ type: 'explosive' })] });

  simulation.step(0);
  simulation.step(FIXED_STEP);

  const remaining = useGameStore.getState().bricks.map((brick) => brick.id);
  expect(remaining).not.toContain(first.id);
  expect(remaining).not.toContain(second.id);
  expect(effects.shakeExplosion).toHaveBeenCalledTimes(1);
  expect(useGameStore.getState().explosions[0].life).toBe(300 - FIXED_STEP);
});

it('refills the board up to the minimum after it is cleared', () => {
  const effects = createEffects();
  const simulation = new BoardSimulation({ width: 800, height: 500 }, effects);
  useGameStore.getState().setBricks([]);

  simulation.step(0);
  simulation.step(0);

  expect(useGameStore.getState().bricks.length).toBeGreaterThanOrEqual(20);
});

it('uses the resized viewport for refill capacity', () => {
  const effects = createEffects();
  const simulation = new BoardSimulation({ width: 800, height: 500 }, effects);

  useGameStore.getState().setBricks([]);
  simulation.step(0);
  simulation.step(0);
  const wideCount = useGameStore.getState().bricks.length;

  simulation.resize(400, 300);
  useGameStore.getState().setBricks([]);
  simulation.step(0);
  simulation.step(0);

  expect(useGameStore.getState().canvasSize).toEqual({ width: 400, height: 300 });
  expect(useGameStore.getState().bricks.length).toBeLessThan(wideCount);
});

it('advances a ball on the shared fixed step and stops when paused', () => {
  const effects = createEffects();
  const simulation = new BoardSimulation({ width: 800, height: 500 }, effects);
  const ball = useGameStore.getState().balls[0];
  const position = [ball.x, ball.y];
  useGameStore.getState().setPaused(true);
  expect(simulation.step(FIXED_STEP)).toBeUndefined();
  expect([ball.x, ball.y]).toEqual(position);
  useGameStore.getState().setPaused(false);
  expect(simulation.step(FIXED_STEP)).toBe(FIXED_STEP);
  expect([ball.x, ball.y]).not.toEqual(position);
});
