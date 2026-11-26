import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Decimal from 'break_infinity.js';
import { SAVE_VERSION, useGameStore } from '../../src/store/gameStore';
import {
  PRESTIGE_THRESHOLD,
  calculateTierForBricks,
  getDefaultPrestigeUpgrades,
  getPrestigeUpgradeCost,
  getPrestigeUpgradeMultiplier,
  MAX_PRESTIGE_UPGRADE_LEVEL,
} from '../../src/types/game';

const getState = () => useGameStore.getState();

beforeEach(() => {
  getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('prestige tree', () => {
  it('starts with zero levels and calculates uncapped costs and effects', () => {
    expect(getState().prestigeUpgrades).toEqual(getDefaultPrestigeUpgrades());
    expect(getPrestigeUpgradeCost('might', 0).eq(2)).toBe(true);
    expect(getPrestigeUpgradeCost('might', 1).eq(4)).toBe(true);
    expect(getPrestigeUpgradeCost('fortune', 1).eq(4)).toBe(true);
    expect(getPrestigeUpgradeCost('insight', 2).eq(8)).toBe(true);
    expect(getPrestigeUpgradeMultiplier('might', 100).gte(10000)).toBe(true);
  });

  it('spends Blueprints and applies each node without a level cap', () => {
    useGameStore.setState({ blueprints: new Decimal(100) });

    expect(getState().buyPrestigeUpgrade('might')).toBe(true);
    expect(getState().buyPrestigeUpgrade('fortune')).toBe(true);
    expect(getState().buyPrestigeUpgrade('insight')).toBe(true);
    expect(getState().blueprints.eq(93)).toBe(true);
    expect(getState().prestigeUpgrades).toEqual({ might: 1, fortune: 1, insight: 1 });
    expect(getState().getDamageMult().eq(1.1)).toBe(true);
    expect(getState().getCoinMult().eq(1.1)).toBe(true);

    useGameStore.setState({ prestigeUpgrades: { might: 200, fortune: 0, insight: 0 } });
    expect(getState().buyPrestigeUpgrade('might')).toBe(false);
    expect(getState().prestigeUpgrades.might).toBe(200);
  });

  it('applies Fortune once to board coins and records the credited lifetime total', () => {
    useGameStore.setState({
      prestigeUpgrades: { might: 0, fortune: 1, insight: 0 },
      prestigeLevel: 2,
      lifetimeCoins: new Decimal(0),
    });

    getState().applyBoardRewards({ coins: new Decimal(10).mul(getState().getCoinMult()) });

    const expected = new Decimal(35).add(new Decimal(10).mul('1.1').mul('1.5625'));
    expect(getState().coins.toNumber()).toBeCloseTo(expected.toNumber());
    expect(getState().lifetimeCoins.toNumber()).toBeCloseTo(17.1875);
  });

  it('applies Insight to idle earnings without also applying Fortune', () => {
    useGameStore.setState({
      prestigeUpgrades: { might: 0, fortune: 10, insight: 1 },
      lifetimeCoins: new Decimal(0),
    });

    getState().applyIdleEarnings(3600, new Decimal(2));

    expect(getState().coins.toNumber()).toBeCloseTo(3995);
    expect(getState().lifetimeCoins.toNumber()).toBeCloseTo(3960);
  });

  it('tracks the best tier as bricks are broken', () => {
    getState().applyBoardRewards({ bricksBroken: PRESTIGE_THRESHOLD });
    const expectedTier = calculateTierForBricks(new Decimal(PRESTIGE_THRESHOLD));

    expect(getState().currentTier).toBe(expectedTier);
    expect(getState().bestTier).toBe(expectedTier);
  });

  it('preserves tree and records through prestige and a v4 save round trip', () => {
    useGameStore.setState({
      bricksBroken: new Decimal(PRESTIGE_THRESHOLD),
      totalBricksBroken: new Decimal(12000),
      currentTier: 4,
      bestTier: 7,
      prestigeUpgrades: { might: 2, fortune: 3, insight: 4 },
      lifetimeCoins: new Decimal('1e20'),
      playTimeMs: 123456,
      canvasSize: { width: 800, height: 500 },
    });

    expect(getState().prestige()).toBe(true);
    expect(getState().prestigeUpgrades).toEqual({ might: 2, fortune: 3, insight: 4 });
    expect(getState().lifetimeCoins.eq('1e20')).toBe(true);
    expect(getState().bestTier).toBe(7);
    expect(getState().playTimeMs).toBe(123456);

    const saved = getState().exportSave();
    expect(JSON.parse(saved).version).toBe(SAVE_VERSION);
    getState().reset();
    expect(getState().importSave(saved)).toBe(true);
    expect(getState().prestigeUpgrades).toEqual({ might: 2, fortune: 3, insight: 4 });
    expect(getState().lifetimeCoins.eq('1e20')).toBe(true);
    expect(getState().bestTier).toBe(7);
    expect(getState().playTimeMs).toBe(123456);
  });

  it('accrues bounded active-session playtime on save', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    getState().reset();

    now.mockReturnValue(1_010_000);
    expect(getState().save()).toBe(true);
    expect(getState().playTimeMs).toBe(10000);

    now.mockReturnValue(1_500_000);
    expect(getState().save()).toBe(true);
    expect(getState().playTimeMs).toBe(70000);
    const saved = localStorage.getItem('idleBricksSave')!;
    expect(JSON.parse(saved).playTimeMs).toBe(70000);
  });

  it('clears tree and records on a full reset', () => {
    useGameStore.setState({
      prestigeUpgrades: { might: 2, fortune: 3, insight: 4 },
      lifetimeCoins: new Decimal(100),
      bestTier: 9,
      playTimeMs: 1000,
    });

    getState().reset();

    expect(getState().prestigeUpgrades).toEqual(getDefaultPrestigeUpgrades());
    expect(getState().lifetimeCoins.eq(0)).toBe(true);
    expect(getState().bestTier).toBe(1);
    expect(getState().playTimeMs).toBe(0);
  });
});

describe('prestige records migration', () => {
  it('adds zeroed records and preserves the current tier for a v3 save', () => {
    const save = {
      version: 3,
      coins: '0',
      prestigeLevel: 0,
      upgrades: { speed: 0, damage: 0, coinMult: 0 },
      ballCosts: {},
      upgradeCosts: {},
      balls: ['basic'],
      currentTier: 8,
    };

    expect(getState().importSave(JSON.stringify(save))).toBe(true);
    expect(getState().prestigeUpgrades).toEqual(getDefaultPrestigeUpgrades());
    expect(getState().lifetimeCoins.eq(0)).toBe(true);
    expect(getState().bestTier).toBe(8);
    expect(getState().playTimeMs).toBe(0);
  });

  it('caps crafted prestige levels before they can overflow multipliers', () => {
    const save = {
      version: SAVE_VERSION,
      coins: '0',
      prestigeLevel: 0,
      upgrades: { speed: 0, damage: 0, coinMult: 0 },
      ballCosts: {},
      upgradeCosts: {},
      balls: ['basic'],
      currentTier: 1,
      prestigeUpgrades: { might: 1e9, fortune: -5, insight: 2 },
    };

    expect(getState().importSave(JSON.stringify(save))).toBe(true);
    expect(getState().prestigeUpgrades).toEqual({
      might: MAX_PRESTIGE_UPGRADE_LEVEL,
      fortune: 0,
      insight: 2,
    });
    expect(getState().getDamageMult().toString()).not.toBe('Infinity');
  });

  it('sanitizes malformed records and keeps bestTier at least currentTier', () => {
    const save = {
      version: SAVE_VERSION,
      coins: '0',
      prestigeLevel: 0,
      upgrades: { speed: 0, damage: 0, coinMult: 0 },
      ballCosts: {},
      upgradeCosts: {},
      balls: ['basic'],
      currentTier: 5,
      bestTier: 2,
      lifetimeCoins: 'NaN',
      playTimeMs: -10,
      prestigeUpgrades: { might: -1, fortune: 'bad', insight: 3 },
    };

    expect(getState().importSave(JSON.stringify(save))).toBe(true);
    expect(getState().prestigeUpgrades).toEqual({ might: 0, fortune: 0, insight: 3 });
    expect(getState().lifetimeCoins.eq(0)).toBe(true);
    expect(getState().playTimeMs).toBe(0);
    expect(getState().bestTier).toBe(5);
  });
});
