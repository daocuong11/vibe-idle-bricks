import { describe, it, expect } from 'vitest';
import Decimal from 'break_infinity.js';
import {
  BALL_TYPES,
  UPGRADE_MULTIPLIER,
  UPGRADE_MULT_BASE,
  PRESTIGE_MULTIPLIER,
  PRESTIGE_THRESHOLD,
  OFFLINE_EARNINGS_RATE,
  MAX_BALLS,
  MAX_SPEED_UPGRADE,
  calculateBlueprintsEarned,
  calculateBrickStats,
  calculateTierForBricks,
  getPrestigeMultiplier,
  getUpgradeMultiplier,
  STARTING_COINS,
  UPGRADE_COST_MULTIPLIER,
} from '../../src/types/game';

describe('Ball Types Configuration', () => {
  it('should have all expected ball types', () => {
    const expectedTypes = ['basic', 'fast', 'heavy', 'plasma', 'explosive', 'sniper'];
    expect(Object.keys(BALL_TYPES)).toEqual(expect.arrayContaining(expectedTypes));
  });

  describe('Individual Ball Configs', () => {
    Object.entries(BALL_TYPES).forEach(([type, config]) => {
      describe(`${type} ball`, () => {
        it('should have required properties', () => {
          expect(config).toHaveProperty('speed');
          expect(config).toHaveProperty('damage');
          expect(config).toHaveProperty('color');
          expect(config).toHaveProperty('pierce');
          expect(config).toHaveProperty('explosive');
          expect(config).toHaveProperty('targeting');
          expect(config).toHaveProperty('baseCost');
          expect(config).toHaveProperty('description');
        });

        it('should have positive speed and damage', () => {
          expect(config.speed).toBeGreaterThan(0);
          expect(config.damage).toBeGreaterThan(0);
        });

        it('should have positive base cost', () => {
          expect(config.baseCost).toBeGreaterThan(0);
        });
      });
    });

    it('basic ball should have no special abilities', () => {
      const basic = BALL_TYPES.basic;
      expect(basic.pierce).toBe(false);
      expect(basic.explosive).toBe(false);
      expect(basic.targeting).toBe(false);
    });

    it('fast ball should be faster than basic', () => {
      expect(BALL_TYPES.fast.speed).toBeGreaterThan(BALL_TYPES.basic.speed);
    });

    it('heavy ball should deal more damage than basic', () => {
      expect(BALL_TYPES.heavy.damage).toBeGreaterThan(BALL_TYPES.basic.damage);
    });

    it('plasma ball should have pierce ability', () => {
      expect(BALL_TYPES.plasma.pierce).toBe(true);
    });

    it('explosive ball should have explosive ability and radius', () => {
      expect(BALL_TYPES.explosive.explosive).toBe(true);
      expect(BALL_TYPES.explosive.explosionRadius).toBeDefined();
      expect(BALL_TYPES.explosive.explosionRadius).toBeGreaterThan(0);
    });

    it('sniper ball should have targeting ability', () => {
      expect(BALL_TYPES.sniper.targeting).toBe(true);
    });
  });

  describe('Costs and Constants', () => {
    it('should have increasing base costs for more powerful balls', () => {
      expect(BALL_TYPES.fast.baseCost).toBeGreaterThan(BALL_TYPES.basic.baseCost);
      expect(BALL_TYPES.heavy.baseCost).toBeGreaterThan(BALL_TYPES.fast.baseCost);
      expect(BALL_TYPES.plasma.baseCost).toBeGreaterThan(BALL_TYPES.heavy.baseCost);
    });

    it('fast ball should cost 30 coins', () => {
      expect(BALL_TYPES.fast.baseCost).toBe(30);
    });

    it('sniper ball should cost 3500 coins', () => {
      expect(BALL_TYPES.sniper.baseCost).toBe(3500);
    });

    it('explosive ball should have 70px radius', () => {
      expect(BALL_TYPES.explosive.explosionRadius).toBe(70);
    });
  });
});

describe('Game Constants', () => {
  it('should raise ball cap to 100 and keep speed cap at 50', () => {
    expect(MAX_BALLS).toBe(100);
    expect(MAX_SPEED_UPGRADE).toBe(50);
  });

  it('should be 0.1 for additive speed and 1.08 for multiplicative upgrades', () => {
    expect(UPGRADE_MULTIPLIER).toBe(0.1);
    expect(UPGRADE_MULT_BASE).toBe(1.08);
  });

  it('should grant 35 starting coins', () => {
    expect(STARTING_COINS).toBe(35);
  });

  it('should grow upgrade costs 10% per level', () => {
    expect(UPGRADE_COST_MULTIPLIER).toBe(1.1);
  });

  it('should multiply income by 1.25 per prestige', () => {
    expect(PRESTIGE_MULTIPLIER).toBe(1.25);
  });

  it('should be 0.5 (50% of normal earnings)', () => {
    expect(OFFLINE_EARNINGS_RATE).toBe(0.5);
  });

  it('should be between 0 and 1', () => {
    expect(OFFLINE_EARNINGS_RATE).toBeGreaterThan(0);
    expect(OFFLINE_EARNINGS_RATE).toBeLessThan(1);
  });

  it('should keep the prestige goal fixed at 10,000 bricks', () => {
    expect(PRESTIGE_THRESHOLD).toBe(10000);
  });

  describe('getPrestigeMultiplier', () => {
    it('should start at 1x', () => {
      expect(getPrestigeMultiplier(0).eq(1)).toBe(true);
    });

    it('should compound multiplicatively as Decimal without cap', () => {
      expect(getPrestigeMultiplier(1).toNumber()).toBeCloseTo(1.25);
      expect(getPrestigeMultiplier(2).toNumber()).toBeCloseTo(1.5625);
      expect(getPrestigeMultiplier(5).toNumber()).toBeCloseTo(Math.pow(1.25, 5));
      expect(getPrestigeMultiplier(5000).gt('1e400')).toBe(true);
    });
  });

  describe('getUpgradeMultiplier', () => {
    it('should start at 1x and compound by 1.08 per level', () => {
      expect(getUpgradeMultiplier(0).eq(1)).toBe(true);
      expect(getUpgradeMultiplier(1).toNumber()).toBeCloseTo(1.08);
      expect(getUpgradeMultiplier(10).toNumber()).toBeCloseTo(Math.pow(1.08, 10));
      expect(getUpgradeMultiplier(10000).gt('1e300')).toBe(true);
    });
  });

  describe('calculateBlueprintsEarned', () => {
    it('returns 0 below threshold or on invalid input', () => {
      expect(calculateBlueprintsEarned(new Decimal(0), 1).eq(0)).toBe(true);
      expect(calculateBlueprintsEarned(new Decimal(PRESTIGE_THRESHOLD - 1), 20).eq(0)).toBe(true);
      expect(calculateBlueprintsEarned(new Decimal('NaN'), 1).eq(0)).toBe(true);
    });

    it('grants at least 1 Blueprint at threshold and scales with bricks and tier', () => {
      expect(calculateBlueprintsEarned(new Decimal(PRESTIGE_THRESHOLD), 1).eq(1)).toBe(true);
      expect(calculateBlueprintsEarned(new Decimal(PRESTIGE_THRESHOLD * 4), 1).eq(2)).toBe(true);
      expect(calculateBlueprintsEarned(new Decimal(PRESTIGE_THRESHOLD * 4), 20).eq(4)).toBe(true);
    });
  });

  describe('calculateTierForBricks', () => {
    it('advances 1 tier per 100 bricks without a hard cap', () => {
      expect(calculateTierForBricks(new Decimal(0))).toBe(1);
      expect(calculateTierForBricks(new Decimal(99))).toBe(1);
      expect(calculateTierForBricks(new Decimal(100))).toBe(2);
      expect(calculateTierForBricks(new Decimal(2500))).toBe(26);
    });
  });

  describe('calculateBrickStats tier curve', () => {
    it('should keep tier 1 pacing unchanged', () => {
      const { maxHealth, value } = calculateBrickStats(1);
      expect(maxHealth.toNumber()).toBe(3);
      expect(value.toNumber()).toBe(1);
    });

    it('should pay more per hit through tier 20', () => {
      let previous = 0;
      for (let tier = 1; tier <= 20; tier++) {
        const { maxHealth, value } = calculateBrickStats(tier);
        const coinsPerHealth = value.div(maxHealth).toNumber();
        expect(coinsPerHealth).toBeGreaterThan(previous);
        previous = coinsPerHealth;
      }
    });

    it('should soften health growth up to tier 20 and apply exponential wall past tier 20', () => {
      const tier1 = calculateBrickStats(1).maxHealth;
      const tier20 = calculateBrickStats(20);
      expect(tier20.maxHealth.div(tier1).toNumber()).toBeLessThanOrEqual(6);
      expect(tier20.value.toNumber()).toBe(120);

      const tier21 = calculateBrickStats(21);
      expect(tier21.maxHealth.toNumber()).toBeCloseTo(17.25 * 1.18);
      expect(tier21.value.toNumber()).toBe(Math.floor(120 * 1.12));

      const tier30 = calculateBrickStats(30);
      expect(tier30.maxHealth.div(tier20.maxHealth).toNumber()).toBeCloseTo(Math.pow(1.18, 10));
      expect(tier30.maxHealth.div(tier30.value).gt(tier20.maxHealth.div(tier20.value))).toBe(true);

      const tier5000 = calculateBrickStats(5000);
      expect(tier5000.maxHealth.gt('1e300')).toBe(true);
      expect(tier5000.value.gt('1e200')).toBe(true);
    });
  });
});
