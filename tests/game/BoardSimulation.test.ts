import Decimal from 'break_infinity.js';
import { afterEach, expect, it, vi } from 'vitest';
import { BoardSimulation } from '../../src/game/BoardSimulation';
import { useGameStore } from '../../src/store';
import { FIXED_STEP } from '../../src/game/constants';

const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));

it('routes a board-space click through the grid and awards a destroyed brick once', () => {
  const effects = { showFloatingText: vi.fn(), emitBrickBreakParticles: vi.fn(), shakeExplosion: vi.fn() };
  const simulation = new BoardSimulation({ width: 800, height: 500 }, effects);
  const brick = { ...useGameStore.getState().bricks[0], health: new Decimal(0.5) };
  useGameStore.getState().setBricks([brick]);
  simulation.step(0);
  const coins = useGameStore.getState().coins;
  simulation.handleBrickClick(brick.x + 1, brick.y + 1);
  simulation.handleBrickClick(brick.x + 1, brick.y + 1);
  expect(useGameStore.getState().coins.eq(coins.add(brick.value))).toBe(true);
  expect(effects.emitBrickBreakParticles).toHaveBeenCalledTimes(1);
});

it('advances a ball on the shared fixed step and stops when paused', () => {
  const effects = { showFloatingText: vi.fn(), emitBrickBreakParticles: vi.fn(), shakeExplosion: vi.fn() };
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
