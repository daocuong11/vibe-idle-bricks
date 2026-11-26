import Decimal from 'break_infinity.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BoardSimulation } from '../../src/game/BoardSimulation';
import { useGameStore } from '../../src/store';
import { getMeasuredIncomePerSecond, resetIncomeTracking } from '../../src/store/earnings';
import { FIXED_STEP, MIN_BRICKS_ON_SCREEN } from '../../src/game/constants';
import { createSeededRandom } from '../../src/game/model';
import { PRESTIGE_THRESHOLD, type BallData, type BrickData } from '../../src/types';

const initial = useGameStore.getState();
beforeEach(() => {
  vi.useFakeTimers();
  resetIncomeTracking();
});
afterEach(() => {
  vi.useRealTimers();
  resetIncomeTracking();
  useGameStore.setState(initial, true);
});

const createEffects = () => ({
  showFloatingText: vi.fn(),
  emitBrickBreakParticles: vi.fn(),
  shakeExplosion: vi.fn(),
});

const makeBrick = (overrides: Partial<BrickData> = {}): BrickData => ({
  ...useGameStore.getState().bricks[0],
  kind: 'normal',
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

it('destroys a brick on a ball hit and batches its reward until the mirror cadence', () => {
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
  expect(useGameStore.getState().coins.eq(coins)).toBe(true);
  expect(effects.emitBrickBreakParticles).toHaveBeenCalled();

  vi.advanceTimersByTime(100);
  simulation.step(0);

  expect(useGameStore.getState().bricks.some((item) => item.id === brick.id)).toBe(false);
  expect(useGameStore.getState().coins.eq(coins.add(brick.value))).toBe(true);

  vi.advanceTimersByTime(100);
  simulation.step(0);
  expect(useGameStore.getState().coins.eq(coins.add(brick.value))).toBe(true);
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

it('restores saved board bricks on construction instead of regenerating fresh bricks', () => {
  const savedBrick: BrickData = {
    id: 'saved-brick-1',
    x: 120,
    y: 140,
    width: 60,
    height: 25,
    tier: 3,
    health: new Decimal(1.5),
    maxHealth: new Decimal(4.5),
    value: new Decimal(12),
  };
  useGameStore.setState({
    bricks: [savedBrick],
    boardSeed: 98765,
  });

  const simulation = new BoardSimulation({ width: 800, height: 500 }, createEffects());
  const renderBricks = simulation.getRenderState().bricks;
  expect(renderBricks).toHaveLength(1);
  expect(renderBricks[0].id).toBe('saved-brick-1');
  expect(renderBricks[0].health.eq(1.5)).toBe(true);
  expect(useGameStore.getState().boardSeed).toBe(98765);
  simulation.destroy();
});

it('keeps total store writes at most 10/second during high-rate brick destruction', () => {
  const simulation = new BoardSimulation({ width: 800, height: 500 }, createEffects());
  // Pack 20 fragile bricks inside explosionRadius (70) so one impact destroys all 20 in one step.
  const clusterBricks: BrickData[] = Array.from({ length: 20 }, (_, index) => ({
    id: `burst-${index}`,
    x: 90 + (index % 5) * 10,
    y: 95 + Math.floor(index / 5) * 8,
    width: 60,
    height: 25,
    tier: 1,
    health: new Decimal(0.5),
    maxHealth: new Decimal(3),
    value: new Decimal(5),
  }));
  useGameStore.setState({
    coins: new Decimal(0),
    bricksBroken: new Decimal(90),
    totalBricksBroken: new Decimal(90),
    balls: [makeBall({ id: 'b1', type: 'explosive', x: 96, y: 112, dx: 4, dy: 0 })],
    bricks: clusterBricks,
  });
  simulation.step(0);

  let totalWrites = 0;
  const unsubscribe = useGameStore.subscribe(() => {
    totalWrites++;
  });

  // First 8ms step destroys all 20 bricks in a single explosion; still 0 store writes before 100ms.
  vi.advanceTimersByTime(8);
  simulation.step(8);
  expect(totalWrites).toBe(0);

  for (let i = 1; i < 125; i++) {
    vi.advanceTimersByTime(8);
    simulation.step(8);
  }
  unsubscribe();

  const state = useGameStore.getState();
  expect(totalWrites).toBeGreaterThan(0);
  expect(totalWrites).toBeLessThanOrEqual(10);
  expect(state.bricksBroken.gte(110)).toBe(true);
  expect(state.totalBricksBroken.gte(110)).toBe(true);
  expect(state.currentTier).toBeGreaterThanOrEqual(2);
  expect(state.coins.gte(100)).toBe(true);
  expect(state.unlockedAchievements.first_brick).toBeTypeOf('number');
  expect(state.unlockedAchievements.hundred_bricks).toBeTypeOf('number');
  expect(getMeasuredIncomePerSecond().gt(0)).toBe(true);
  simulation.destroy();
});

it('flushes buffered rewards immediately on save, exportSave, pause, resize, and destroy', () => {
  useGameStore.setState({ coins: new Decimal(0) });
  const simulation = new BoardSimulation({ width: 800, height: 500 }, createEffects());

  // 1. Flush on save()
  useGameStore.setState({
    balls: [makeBall({ x: 95.5 })],
    bricks: [makeBrick({ id: 'flush-save', health: new Decimal(0.5), value: new Decimal(7) })],
  });
  simulation.step(0);
  simulation.step(FIXED_STEP);
  expect(useGameStore.getState().coins.eq(0)).toBe(true);
  useGameStore.getState().save();
  expect(useGameStore.getState().coins.eq(7)).toBe(true);
  expect(useGameStore.getState().bricksBroken.eq(1)).toBe(true);

  // 2. Flush on exportSave()
  useGameStore.setState({
    balls: [makeBall({ x: 95.5 })],
    bricks: [makeBrick({ id: 'flush-export', health: new Decimal(0.5), value: new Decimal(9) })],
  });
  simulation.step(0);
  simulation.step(FIXED_STEP);
  const exported = JSON.parse(useGameStore.getState().exportSave());
  expect(exported.coins).toBe('16');
  expect(exported.bricksBroken).toBe('2');

  // 3. Flush on setPaused(true)
  useGameStore.setState({
    balls: [makeBall({ x: 95.5 })],
    bricks: [makeBrick({ id: 'flush-pause', health: new Decimal(0.5), value: new Decimal(4) })],
  });
  simulation.step(0);
  simulation.step(FIXED_STEP);
  useGameStore.getState().setPaused(true);
  expect(useGameStore.getState().coins.eq(20)).toBe(true);
  expect(useGameStore.getState().bricksBroken.eq(3)).toBe(true);
  useGameStore.getState().setPaused(false);

  // 4. Flush on resize()
  useGameStore.setState({
    balls: [makeBall({ x: 95.5 })],
    bricks: [makeBrick({ id: 'flush-resize', health: new Decimal(0.5), value: new Decimal(5) })],
  });
  simulation.step(0);
  simulation.step(FIXED_STEP);
  simulation.resize(700, 450);
  expect(useGameStore.getState().coins.eq(25)).toBe(true);

  // 5. Flush on destroy() (unmount)
  useGameStore.setState({
    balls: [makeBall({ x: 95.5 })],
    bricks: [makeBrick({ id: 'flush-destroy', health: new Decimal(0.5), value: new Decimal(6) })],
  });
  simulation.step(0);
  simulation.step(FIXED_STEP);
  expect(useGameStore.getState().coins.eq(25)).toBe(true);
  simulation.destroy();
  expect(useGameStore.getState().coins.eq(31)).toBe(true);
  expect(useGameStore.getState().bricksBroken.eq(5)).toBe(true);
});

it('flushes buffered bricks before prestige and discards stale rewards on reset', () => {
  const simulation = new BoardSimulation(
    { width: 800, height: 500 },
    createEffects(),
    createSeededRandom(77)
  );
  useGameStore.setState({
    bricksBroken: new Decimal(PRESTIGE_THRESHOLD - 1),
    totalBricksBroken: new Decimal(PRESTIGE_THRESHOLD - 1),
    balls: [makeBall({ x: 95.5 })],
    bricks: [makeBrick({ id: 'prestige-trigger', health: new Decimal(0.5), value: new Decimal(50) })],
  });
  simulation.step(0);
  simulation.step(FIXED_STEP);

  // Buffered brick has not been flushed to store yet, but prestige() flushes first.
  expect(useGameStore.getState().prestige()).toBe(true);
  expect(useGameStore.getState().prestigeLevel).toBe(1);
  expect(useGameStore.getState().totalBricksBroken.eq(PRESTIGE_THRESHOLD)).toBe(true);
  expect(useGameStore.getState().coins.eq(0)).toBe(true);

  // Advancing 100ms after prestige must not leak pre-prestige coins into the new run.
  vi.advanceTimersByTime(100);
  simulation.step(0);
  expect(useGameStore.getState().coins.eq(0)).toBe(true);

  // Buffered rewards before reset() must also not leak after reset().
  useGameStore.setState({
    balls: [makeBall({ x: 95.5 })],
    bricks: [makeBrick({ id: 'pre-reset', health: new Decimal(0.5), value: new Decimal(500) })],
  });
  simulation.step(0);
  simulation.step(FIXED_STEP);
  useGameStore.getState().reset();
  vi.advanceTimersByTime(100);
  simulation.step(0);
  expect(useGameStore.getState().coins.eq(35)).toBe(true);
  simulation.destroy();
});
