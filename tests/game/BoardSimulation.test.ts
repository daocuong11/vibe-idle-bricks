import Decimal from 'break_infinity.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BoardSimulation } from '../../src/game/BoardSimulation';
import { useGameStore } from '../../src/store';
import { FIXED_STEP, MIN_BRICKS_ON_SCREEN } from '../../src/game/constants';
import { PRESTIGE_THRESHOLD, type BallData, type BrickData } from '../../src/types';

const initial = useGameStore.getState();
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  useGameStore.setState(initial, true);
});

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
  expect(useGameStore.getState().bricks).toBe(simulation.getRenderState().bricks);
  expect(useGameStore.getState().bricks.some((item) => item.id === brick.id)).toBe(false);
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
  const mirroredBricks = useGameStore.getState().bricks;
  simulation.step(FIXED_STEP);

  expect(simulation.getRenderState().bricks.some((item) => item.id === brick.id)).toBe(false);
  expect(useGameStore.getState().bricks).toBe(mirroredBricks);
  expect(useGameStore.getState().bricks.some((item) => item.id === brick.id)).toBe(true);
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

  const remaining = simulation.getRenderState().bricks.map((brick) => brick.id);
  expect(remaining).not.toContain(first.id);
  expect(remaining).not.toContain(second.id);
  expect(effects.shakeExplosion).toHaveBeenCalledTimes(1);
  expect(simulation.getRenderState().explosions[0].life).toBe(300 - FIXED_STEP);
  expect(useGameStore.getState().explosions).toHaveLength(0);
});

it('refills the board up to the minimum after it is cleared', () => {
  const effects = createEffects();
  const simulation = new BoardSimulation({ width: 800, height: 500 }, effects);
  useGameStore.getState().setBricks([]);

  simulation.step(0);
  simulation.step(0);

  expect(simulation.getRenderState().bricks.length).toBeGreaterThanOrEqual(20);
  expect(useGameStore.getState().bricks).toHaveLength(0);
});

it('uses the resized viewport for refill capacity', () => {
  const effects = createEffects();
  const simulation = new BoardSimulation({ width: 800, height: 500 }, effects);

  useGameStore.getState().setBricks([]);
  simulation.step(0);
  simulation.step(0);
  const wideCount = simulation.getRenderState().bricks.length;

  simulation.resize(400, 300);
  expect(useGameStore.getState().bricks).toBe(simulation.getRenderState().bricks);
  useGameStore.getState().setBricks([]);
  simulation.step(0);
  simulation.step(0);

  expect(useGameStore.getState().canvasSize).toEqual({ width: 400, height: 300 });
  expect(simulation.getRenderState().bricks.length).toBeLessThan(wideCount);
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

it('publishes the initial mirror and at most ten board updates during one second', () => {
  const simulation = new BoardSimulation({ width: 800, height: 500 }, createEffects());
  const renderState = simulation.getRenderState();
  expect(useGameStore.getState().balls).toBe(renderState.balls);
  expect(useGameStore.getState().bricks).toBe(renderState.bricks);
  expect(useGameStore.getState().explosions).toBe(renderState.explosions);

  let updates = 0;
  const unsubscribe = useGameStore.subscribe((state, previous) => {
    if (
      state.balls !== previous.balls ||
      state.bricks !== previous.bricks ||
      state.explosions !== previous.explosions
    ) updates++;
  });
  for (let i = 0; i < 125; i++) {
    vi.advanceTimersByTime(8);
    simulation.step(8);
  }
  unsubscribe();

  expect(updates).toBeGreaterThan(0);
  expect(updates).toBeLessThanOrEqual(10);
});

it('syncs an external ball purchase without letting the next mirror overwrite it', () => {
  const simulation = new BoardSimulation({ width: 800, height: 500 }, createEffects());
  useGameStore.setState({ coins: new Decimal(1000) });
  const count = useGameStore.getState().balls.length;
  expect(useGameStore.getState().buyBall('basic')).toBe(true);
  const purchasedBalls = useGameStore.getState().balls;

  simulation.step(0);
  expect(simulation.getRenderState().balls).toBe(purchasedBalls);
  expect(simulation.getRenderState().balls).toHaveLength(count + 1);

  vi.advanceTimersByTime(100);
  simulation.step(0);
  expect(useGameStore.getState().balls).toBe(purchasedBalls);
});

it('does not restore stale store bricks when only balls change externally', () => {
  const simulation = new BoardSimulation({ width: 800, height: 500 }, createEffects());
  const target = makeBrick({
    id: 'external-target',
    x: 100,
    y: 100,
    health: new Decimal(0.5),
    maxHealth: new Decimal(0.5),
  });
  useGameStore.setState({
    balls: [makeBall({ x: 95.5 })],
    bricks: [target],
    explosions: [],
  });

  simulation.step(0);
  vi.advanceTimersByTime(8);
  simulation.step(8);
  expect(simulation.getRenderState().bricks.some((brick) => brick.id === target.id)).toBe(false);
  expect(useGameStore.getState().bricks.some((brick) => brick.id === target.id)).toBe(true);

  useGameStore.setState({ coins: new Decimal(1000) });
  expect(useGameStore.getState().buyBall('basic')).toBe(true);
  simulation.step(0);

  expect(simulation.getRenderState().bricks.some((brick) => brick.id === target.id)).toBe(false);
});

it('syncs a prestige reset without letting the next mirror overwrite it', () => {
  const simulation = new BoardSimulation({ width: 800, height: 500 }, createEffects());
  useGameStore.setState({
    bricksBroken: new Decimal(PRESTIGE_THRESHOLD),
    bricks: [makeBrick()],
    explosions: [{ x: 10, y: 10, radius: 20, life: 100, maxLife: 300 }],
  });
  expect(useGameStore.getState().prestige()).toBe(true);
  const resetBalls = useGameStore.getState().balls;
  const resetExplosions = useGameStore.getState().explosions;

  simulation.step(0);
  expect(simulation.getRenderState().balls).toBe(resetBalls);
  expect(simulation.getRenderState().explosions).toEqual(resetExplosions);
  expect(useGameStore.getState().explosions).toBe(resetExplosions);

  vi.advanceTimersByTime(100);
  simulation.step(0);
  expect(useGameStore.getState().balls).toBe(resetBalls);
  expect(useGameStore.getState().explosions).toBe(simulation.getRenderState().explosions);
  expect(useGameStore.getState().explosions).toEqual(resetExplosions);
});

it('adopts external bricks once and publishes newer world damage on the cadence', () => {
  const simulation = new BoardSimulation({ width: 800, height: 500 }, createEffects());
  const target = makeBrick({ id: 'external-target', x: 100, y: 100 });
  const fillers = Array.from({ length: MIN_BRICKS_ON_SCREEN - 1 }, (_, index) =>
    makeBrick({ id: `external-${index}`, x: 400 + index * 10, health: new Decimal(3) })
  );
  useGameStore.setState({ balls: [makeBall({ x: 95.5 })], bricks: [target, ...fillers] });
  const externalBricks = useGameStore.getState().bricks;

  simulation.step(0);
  expect(simulation.getRenderState().bricks).toBe(externalBricks);
  for (let i = 0; i < 4; i++) {
    vi.advanceTimersByTime(8);
    simulation.step(8);
  }

  expect(simulation.getRenderState().bricks.some((brick) => brick.id === target.id)).toBe(false);
  expect(useGameStore.getState().bricks).toBe(externalBricks);
  expect(useGameStore.getState().bricks.some((brick) => brick.id === target.id)).toBe(true);

  vi.advanceTimersByTime(68);
  simulation.step(0);
  expect(useGameStore.getState().bricks).toBe(simulation.getRenderState().bricks);
  expect(useGameStore.getState().bricks.some((brick) => brick.id === target.id)).toBe(false);
});

it('syncs external explosions and ages them in the world before publication', () => {
  const simulation = new BoardSimulation({ width: 800, height: 500 }, createEffects());
  useGameStore.setState({
    explosions: [{ x: 10, y: 10, radius: 20, life: 250, maxLife: 300 }],
  });
  const externalExplosions = useGameStore.getState().explosions;

  simulation.step(0);
  expect(simulation.getRenderState().explosions).toEqual(externalExplosions);
  expect(useGameStore.getState().explosions).toBe(externalExplosions);

  vi.advanceTimersByTime(50);
  simulation.step(FIXED_STEP);
  expect(simulation.getRenderState().explosions[0].life).toBe(242);
  expect(useGameStore.getState().explosions).toBe(externalExplosions);
  expect(useGameStore.getState().explosions[0].life).toBe(250);

  vi.advanceTimersByTime(50);
  simulation.step(FIXED_STEP);
  expect(useGameStore.getState().explosions).toBe(simulation.getRenderState().explosions);
  expect(useGameStore.getState().explosions[0].life).toBe(234);
});
