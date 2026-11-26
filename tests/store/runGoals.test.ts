import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Decimal from 'break_infinity.js';
import { SAVE_VERSION, useGameStore } from '../../src/store/gameStore';
import { ACHIEVEMENTS } from '../../src/types/achievements';
import { PRESTIGE_THRESHOLD } from '../../src/types/game';

const getState = () => useGameStore.getState();

beforeEach(() => {
  getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('run goals', () => {
  it('awards each crossed goal exactly once through board rewards', () => {
    useGameStore.setState({
      unlockedAchievements: Object.fromEntries(
        ACHIEVEMENTS.map((achievement) => [achievement.id, 1])
      ),
    });
    getState().applyBoardRewards({ bricksBroken: new Decimal(100) });
    expect(getState().claimedRunGoals).toEqual(['run_100']);
    expect(getState().blueprints.eq(1)).toBe(true);
    expect(getState().pendingRunGoalUnlocks).toEqual(['run_100']);

    getState().applyBoardRewards({ bricksBroken: new Decimal(100) });
    expect(getState().claimedRunGoals).toEqual(['run_100']);
    expect(getState().blueprints.eq(1)).toBe(true);

    getState().applyBoardRewards({ bricksBroken: new Decimal(800) });
    expect(getState().claimedRunGoals).toEqual(['run_100', 'run_500', 'run_1000']);
    expect(getState().blueprints.eq(6)).toBe(true);
    expect(getState().pendingRunGoalUnlocks).toEqual([
      'run_100',
      'run_500',
      'run_1000',
    ]);
  });

  it('resets goals on prestige', () => {
    useGameStore.setState({
      bricksBroken: new Decimal(PRESTIGE_THRESHOLD),
      claimedRunGoals: ['run_100', 'run_500'],
    });
    expect(getState().prestige()).toBe(true);
    expect(getState().claimedRunGoals).toEqual([]);
  });

  it('persists claims across save/import and defaults missing v4 claims', () => {
    getState().applyBoardRewards({ bricksBroken: new Decimal(100) });
    const saved = getState().exportSave();
    const parsed = JSON.parse(saved);
    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.claimedRunGoals).toEqual(['run_100']);

    getState().reset();
    expect(getState().importSave(saved)).toBe(true);
    expect(getState().claimedRunGoals).toEqual(['run_100']);

    const v4 = { ...parsed, version: 4 };
    delete v4.claimedRunGoals;
    expect(getState().importSave(JSON.stringify(v4))).toBe(true);
    expect(getState().claimedRunGoals).toEqual([]);
  });

  it('drains the run-goal toast queue', () => {
    getState().applyBoardRewards({ bricksBroken: new Decimal(100) });
    getState().drainPendingRunGoalUnlocks(['run_100']);
    expect(getState().pendingRunGoalUnlocks).toEqual([]);
  });
});
