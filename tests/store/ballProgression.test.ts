import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Decimal from 'break_infinity.js';
import { SAVE_VERSION, useGameStore } from '../../src/store/gameStore';
import {
  MAX_BALL_LEVEL,
  PRESTIGE_THRESHOLD,
  getBallUpgradeCost,
  getDefaultBallLevels,
} from '../../src/types/game';

const getState = () => useGameStore.getState();

beforeEach(() => {
  getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('per-ball progression', () => {
  it('buys levels with coins and raises damage/speed multipliers', () => {
    useGameStore.setState({ coins: new Decimal(1000) });

    expect(getState().upgradeBall('basic')).toBe(true);
    expect(getState().ballLevels.basic).toBe(1);
    expect(getState().coins.eq(850)).toBe(true);
    expect(getState().getBallDamageMult('basic').eq(1.25)).toBe(true);

    expect(getState().upgradeBall('basic')).toBe(true);
    expect(getState().ballLevels.basic).toBe(2);
    expect(getState().coins.eq(1000 - 150 - 210)).toBe(true);
    expect(getState().getBallDamageMult('basic').eq(1.5)).toBe(true);

    useGameStore.setState({ coins: new Decimal(0) });
    expect(getState().upgradeBall('fast')).toBe(false);
    useGameStore.setState({ coins: new Decimal(1000) });
    expect(getState().upgradeBall('fast')).toBe(true);
    expect(getState().getBallSpeedMult('fast').toNumber()).toBeCloseTo(1.04);
  });

  it('uses the level cost curve and rejects unaffordable/maxed upgrades', () => {
    expect(getBallUpgradeCost('basic', 0).eq(150)).toBe(true);
    expect(getBallUpgradeCost('basic', 1).eq(210)).toBe(true);

    useGameStore.setState({ coins: new Decimal(1000), ballLevels: { ...getDefaultBallLevels(), basic: MAX_BALL_LEVEL } });
    expect(getState().upgradeBall('basic')).toBe(false);
    expect(getState().ballLevels.basic).toBe(MAX_BALL_LEVEL);
  });

  it('caps the per-type speed multiplier while damage keeps scaling', () => {
    useGameStore.setState({ ballLevels: { ...getDefaultBallLevels(), fast: MAX_BALL_LEVEL } });
    expect(getState().getBallSpeedMult('fast').eq(3)).toBe(true);
    expect(getState().getBallDamageMult('fast').gt(10)).toBe(true);
  });

  it('keeps levels through prestige and clears them on full reset', () => {
    useGameStore.setState({
      coins: new Decimal(1000),
      ballLevels: { ...getDefaultBallLevels(), basic: 3 },
      bricksBroken: new Decimal(PRESTIGE_THRESHOLD),
    });

    expect(getState().prestige()).toBe(true);
    expect(getState().ballLevels.basic).toBe(3);

    getState().reset();
    expect(getState().ballLevels).toEqual(getDefaultBallLevels());
  });

  it('persists levels in save v6 and migrates a v5 save to zeroes', () => {
    useGameStore.setState({ coins: new Decimal(1000) });
    getState().upgradeBall('plasma');
    const saved = getState().exportSave();
    const parsed = JSON.parse(saved);
    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.ballLevels.plasma).toBe(1);

    getState().reset();
    expect(getState().importSave(saved)).toBe(true);
    expect(getState().ballLevels.plasma).toBe(1);

    const v5 = { ...parsed, version: 5 };
    delete v5.ballLevels;
    expect(getState().importSave(JSON.stringify(v5))).toBe(true);
    expect(getState().ballLevels).toEqual(getDefaultBallLevels());
  });
});
