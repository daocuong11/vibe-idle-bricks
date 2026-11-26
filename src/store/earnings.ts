import Decimal from 'break_infinity.js';
import { BALL_TYPES, OFFLINE_EARNINGS_RATE, calculateBrickStats, getPrestigeMultiplier } from '../types';
import { formatNumber } from '../utils';
import type { BallData } from '../types';

/** Offline income stops after this much time away. */
export const MAX_OFFLINE_SECONDS = 24 * 60 * 60;

const INCOME_WINDOW_MS = 60 * 1000;
let incomeSamples: Array<{ at: number; amount: Decimal }> = [];

const pruneIncomeSamples = (now: number): void => {
  const cutoff = now - INCOME_WINDOW_MS;
  let firstActive = 0;
  while (firstActive < incomeSamples.length && incomeSamples[firstActive].at < cutoff) {
    firstActive++;
  }
  if (firstActive > 0) incomeSamples = incomeSamples.slice(firstActive);
};

/** Records positive coins actually credited by gameplay, after prestige bonuses. */
export const recordIncome = (creditedCoins: Decimal): void => {
  if (!creditedCoins.gt(0)) return;
  const now = Date.now();
  pruneIncomeSamples(now);
  incomeSamples.push({ at: now, amount: creditedCoins });
};

/** Average actual coin credits over the rolling 60-second measurement window. */
export const getMeasuredIncomePerSecond = (): Decimal => {
  pruneIncomeSamples(Date.now());
  if (incomeSamples.length === 0) return new Decimal(0);

  let total = new Decimal(0);
  for (const sample of incomeSamples) total = total.add(sample.amount);
  return total.div(60);
};

export const resetIncomeTracking = (): void => {
  incomeSamples = [];
};

const formatElapsed = (seconds: number): string => {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${totalMinutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
};

export interface OfflineEarningsResult {
  coins: Decimal;
  message: string | null;
}

const calculateBallHitRateDecimal = (
  ball: BallData,
  speedMult: number,
  damageMult: Decimal,
  maxHealth: Decimal
): Decimal => {
  const config = BALL_TYPES[ball.type];
  const ballDamage = damageMult.mul(config.damage);
  const hits = ballDamage.gt(0)
    ? Decimal.max(1, maxHealth.div(ballDamage).ceil())
    : new Decimal(1);
  let rate = new Decimal(config.speed * speedMult).div(hits);
  if (config.explosive) rate = rate.mul(1.5);
  if (config.pierce) rate = rate.mul(1.3);
  if (config.targeting) rate = rate.mul(1.2);
  return rate;
};

/**
 * Nominal bricks per second for the current board. Damage past a one-shot is
 * wasted, so each ball's rate is capped by the hits the brick actually needs.
 */
export const calculateHitRate = (
  balls: BallData[],
  speedMult: number,
  damageMult: Decimal | number,
  currentTier: number
): number => {
  const { maxHealth } = calculateBrickStats(currentTier);
  const damageMultDecimal = damageMult instanceof Decimal ? damageMult : new Decimal(damageMult);
  let hitRate = 0;
  for (const ball of balls) {
    hitRate += calculateBallHitRateDecimal(ball, speedMult, damageMultDecimal, maxHealth).toNumber();
  }
  return hitRate;
};

/**
 * Simulated bricks-per-second is optimistic: balls bounce and spend time in
 * empty space. Live measurement at tier 1 (one basic ball, 60 s) gave 0.1
 * coins/s against a nominal 1/s, so the fallback display and ETA hints apply
 * this factor until actual gameplay credits are available.
 */
export const LIVE_INCOME_CALIBRATION = 0.1;

/** Nominal coins per second, before live calibration. */
export const calculateIncomePerSecond = (
  balls: BallData[],
  speedMult: number,
  damageMult: Decimal | number,
  coinMult: Decimal | number,
  prestigeLevel: number,
  currentTier: number
): Decimal => {
  const { maxHealth, value } = calculateBrickStats(currentTier);
  const damageMultDecimal = damageMult instanceof Decimal ? damageMult : new Decimal(damageMult);
  let totalHitRate = new Decimal(0);
  for (const ball of balls) {
    totalHitRate = totalHitRate.add(
      calculateBallHitRateDecimal(ball, speedMult, damageMultDecimal, maxHealth)
    );
  }
  return totalHitRate
    .mul(value)
    .mul(coinMult)
    .mul(getPrestigeMultiplier(prestigeLevel));
};

export const formatOfflineMessage = (
  offlineCoins: Decimal,
  offlineSeconds: number
): string | null => {
  if (offlineCoins.lte(0)) return null;
  const safeOfflineSeconds = Math.min(
    Math.max(0, Number.isFinite(offlineSeconds) ? offlineSeconds : 0),
    MAX_OFFLINE_SECONDS
  );
  const capped = offlineSeconds > MAX_OFFLINE_SECONDS ? ' (max)' : '';
  return `Welcome back! You earned ${formatNumber(offlineCoins)} coins over ${formatElapsed(safeOfflineSeconds)}${capped}.`;
};

export const calculateOfflineEarnings = (
  liveIncomePerSecond: Decimal,
  offlineSeconds: number
): OfflineEarningsResult => {
  const safeOfflineSeconds = Math.min(
    Math.max(0, Number.isFinite(offlineSeconds) ? offlineSeconds : 0),
    MAX_OFFLINE_SECONDS
  );
  const offlineCoins = liveIncomePerSecond
    .mul(safeOfflineSeconds)
    .mul(OFFLINE_EARNINGS_RATE)
    .floor();

  const message = formatOfflineMessage(offlineCoins, offlineSeconds);
  if (!message) {
    return { coins: new Decimal(0), message: null };
  }

  return {
    coins: offlineCoins,
    message,
  };
};
