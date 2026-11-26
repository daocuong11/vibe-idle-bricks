import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BALANCE_CONFIG,
  DEFAULT_REPORT_TIERS,
  formatBalanceReport,
  runBalanceHarness,
} from '../../../src/game/model/balanceHarness';
import {
  MAX_BALLS,
  MAX_SPEED_UPGRADE,
  PRESTIGE_THRESHOLD,
} from '../../../src/types';

describe('balanceHarness', () => {
  it('produces deterministic results for identical inputs', () => {
    const runA = runBalanceHarness();
    const runB = runBalanceHarness();

    expect(runA.timeToFirstPurchaseSeconds).toBe(runB.timeToFirstPurchaseSeconds);
    expect(runA.timeToPrestigeSeconds).toBe(runB.timeToPrestigeSeconds);
    expect(runA.finalTier).toBe(runB.finalTier);
    expect(runA.totalBalls).toBe(runB.totalBalls);
    expect(runA.finalBalls).toEqual(runB.finalBalls);
    expect(runA.finalUpgrades).toEqual(runB.finalUpgrades);
    expect(runA.finalCoins.eq(runB.finalCoins)).toBe(true);
    expect(runA.finalIncomePerSecond.eq(runB.finalIncomePerSecond)).toBe(true);
  });

  it('reaches prestige within bounded simulated time and respects MAX_BALLS and MAX_SPEED_UPGRADE', () => {
    const result = runBalanceHarness();

    expect(result.reachedPrestige).toBe(true);
    expect(result.timeToPrestigeSeconds).not.toBeNull();
    expect(result.timeToPrestigeSeconds!).toBeGreaterThan(0);
    expect(result.timeToPrestigeSeconds!).toBeLessThanOrEqual(
      DEFAULT_BALANCE_CONFIG.maxRunSeconds
    );
    expect(result.finalBricksBroken.gte(PRESTIGE_THRESHOLD)).toBe(true);
    expect(result.totalBalls).toBeLessThanOrEqual(MAX_BALLS);
    expect(result.finalUpgrades.speed).toBeLessThanOrEqual(MAX_SPEED_UPGRADE);
  });

  it('supports redesigned economy parameters (multiplicative upgrades, 100 balls, unbounded tiers)', () => {
    const result = runBalanceHarness({
      maxBalls: 100,
      prestigeMultiplier: 1.25,
      upgradeMode: 'multiplicative',
      upgradeMultBase: 1.08,
      unboundedTiers: true,
    });

    expect(result.reachedPrestige).toBe(true);
    expect(result.totalBalls).toBeLessThanOrEqual(100);
    expect(result.finalTier).toBeGreaterThan(20);
    expect(result.finalIncomePerSecond.gt(0)).toBe(true);
  });

  it('computes valid finite Decimal values for incomeByTier and capImpact across tiers 1-50', () => {
    const result = runBalanceHarness();

    expect(result.incomeByTier.map((row) => row.tier)).toEqual([
      ...DEFAULT_REPORT_TIERS,
    ]);

    for (const row of result.incomeByTier) {
      expect(row.maxHealth).toBeInstanceOf(Decimal);
      expect(row.value).toBeInstanceOf(Decimal);
      expect(row.yieldPerHealth).toBeInstanceOf(Decimal);
      expect(row.incomePerSecond).toBeInstanceOf(Decimal);

      expect(Number.isFinite(row.maxHealth.mantissa)).toBe(true);
      expect(Number.isFinite(row.value.mantissa)).toBe(true);
      expect(Number.isFinite(row.yieldPerHealth.mantissa)).toBe(true);
      expect(Number.isFinite(row.incomePerSecond.mantissa)).toBe(true);

      expect(row.maxHealth.gt(0)).toBe(true);
      expect(row.value.gt(0)).toBe(true);
      expect(row.yieldPerHealth.gt(0)).toBe(true);
      expect(row.incomePerSecond.gt(0)).toBe(true);
    }

    expect(result.capImpact).not.toBeNull();
    const capImpact = result.capImpact!;
    expect(capImpact.balls50.maxBalls).toBe(50);
    expect(capImpact.balls100.maxBalls).toBe(100);
    expect(capImpact.cappedTierAndSpeed.unboundedTiers).toBe(false);
    expect(capImpact.uncappedTierAndSpeed.unboundedTiers).toBe(true);

    for (const scenario of [
      capImpact.balls50,
      capImpact.balls100,
      capImpact.cappedTierAndSpeed,
      capImpact.uncappedTierAndSpeed,
    ]) {
      expect(Number.isFinite(scenario.finalIncomePerSecond.mantissa)).toBe(true);
      expect(scenario.finalIncomePerSecond.gt(0)).toBe(true);
    }
  });

  it('formats a clean Markdown report via formatBalanceReport', () => {
    const result = runBalanceHarness();
    const markdown = formatBalanceReport(result);

    expect(markdown).toContain('# Idle Bricks Balance Report');
    expect(markdown).toContain('## Run Summary');
    expect(markdown).toContain('## Ball Composition');
    expect(markdown).toContain('## Income by Tier');
    expect(markdown).toContain('## Cap Impact Comparison');
    expect(markdown).toContain('| Time to Prestige |');
    expect(markdown).toContain('| MAX_BALLS = 50 |');
    expect(markdown).toContain('| MAX_BALLS = 100 |');
  });
});
