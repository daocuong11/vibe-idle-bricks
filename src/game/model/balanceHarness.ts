import Decimal from 'break_infinity.js';
import {
  BALL_TYPES,
  COST_MULTIPLIER,
  MAX_BALLS,
  MAX_SPEED_UPGRADE,
  PRESTIGE_MULTIPLIER,
  PRESTIGE_THRESHOLD,
  STARTING_COINS,
  UPGRADE_COST_MULTIPLIER,
  UPGRADE_MULT_BASE,
  UPGRADE_MULTIPLIER,
  type BallType,
  type Upgrades,
} from '../../types/game.ts';

/** Legacy tier cap used when modeling pre-Batch 6 capped scenarios. */
export const LEGACY_MAX_TIER = 20;

/** Default calibration factor matching LIVE_INCOME_CALIBRATION in earnings.ts. */
export const DEFAULT_INCOME_CALIBRATION = 0.1;

/** Default tiers sampled in the incomeByTier table. */
export const DEFAULT_REPORT_TIERS: readonly number[] = [1, 5, 10, 20, 30, 50];

/** Base costs for global upgrades, matching gameStore.ts. */
export const DEFAULT_UPGRADE_BASE_COSTS: Record<keyof Upgrades, number> = {
  speed: 50,
  damage: 75,
  coinMult: 100,
};

const BALL_TYPE_ORDER: readonly BallType[] = [
  'basic',
  'fast',
  'heavy',
  'plasma',
  'explosive',
  'sniper',
];

export type UpgradeScalingMode = 'additive' | 'multiplicative';

export interface BalanceConfig {
  /** Maximum number of balls allowed. */
  maxBalls: number;
  /** Maximum level for the speed upgrade. */
  maxSpeedUpgrade: number;
  /** Whether brick tiers can exceed maxTier. */
  unboundedTiers: boolean;
  /** Maximum tier when unboundedTiers is false. */
  maxTier: number;
  /** Scaling mode for damage and coinMult upgrades. */
  upgradeMode: UpgradeScalingMode;
  /** Base multiplier per level when upgradeMode is 'multiplicative'. */
  upgradeMultBase: number;
  /** Additive step per level for speed (and damage/coinMult in additive mode). */
  upgradeAdditiveStep: number;
  /** Base multiplier per prestige level. */
  prestigeMultiplier: number;
  /** Starting prestige level for the simulated run. */
  prestigeLevel: number;
  /** Starting coins at t = 0. */
  startingCoins: number;
  /** Bricks broken required to reach prestige. */
  prestigeThreshold: number;
  /** Cost growth multiplier per ball purchased. */
  ballCostMultiplier: number;
  /** Cost growth multiplier per upgrade level. */
  upgradeCostMultiplier: number;
  /** Live income calibration factor applied to nominal hit rate. */
  incomeCalibration: number;
  /** Fixed simulation step size in seconds. */
  dtSeconds: number;
  /** Maximum simulated run duration in seconds. */
  maxRunSeconds: number;
  /** Bricks broken required per tier advancement. */
  bricksPerTier: number;
  /** Whether tier > 20 uses exponential wall scaling when unbounded. */
  exponentialWallAfter20: boolean;
  /** Health growth factor per tier > 20. */
  wallHealthGrowth: number;
  /** Value growth factor per tier > 20. */
  wallValueGrowth: number;
}

export const DEFAULT_BALANCE_CONFIG: BalanceConfig = {
  maxBalls: MAX_BALLS,
  maxSpeedUpgrade: MAX_SPEED_UPGRADE,
  unboundedTiers: true,
  maxTier: LEGACY_MAX_TIER,
  upgradeMode: 'multiplicative',
  upgradeMultBase: UPGRADE_MULT_BASE,
  upgradeAdditiveStep: UPGRADE_MULTIPLIER,
  prestigeMultiplier: PRESTIGE_MULTIPLIER,
  prestigeLevel: 0,
  startingCoins: STARTING_COINS,
  prestigeThreshold: PRESTIGE_THRESHOLD,
  ballCostMultiplier: COST_MULTIPLIER,
  upgradeCostMultiplier: UPGRADE_COST_MULTIPLIER,
  incomeCalibration: DEFAULT_INCOME_CALIBRATION,
  dtSeconds: 1,
  maxRunSeconds: 24 * 60 * 60,
  bricksPerTier: 100,
  exponentialWallAfter20: true,
  wallHealthGrowth: 1.18,
  wallValueGrowth: 1.12,
};

export interface TierIncomeRow {
  tier: number;
  maxHealth: Decimal;
  value: Decimal;
  yieldPerHealth: Decimal;
  incomePerSecond: Decimal;
}

export interface CapScenarioMetrics {
  label: string;
  maxBalls: number;
  unboundedTiers: boolean;
  maxSpeedUpgrade: number;
  reachedPrestige: boolean;
  timeToPrestigeSeconds: number | null;
  finalTier: number;
  totalBalls: number;
  finalIncomePerSecond: Decimal;
}

export interface CapImpactComparison {
  balls50: CapScenarioMetrics;
  balls100: CapScenarioMetrics;
  cappedTierAndSpeed: CapScenarioMetrics;
  uncappedTierAndSpeed: CapScenarioMetrics;
}

export interface BalanceRunResult {
  config: BalanceConfig;
  timeToFirstPurchaseSeconds: number | null;
  timeToPrestigeSeconds: number | null;
  reachedPrestige: boolean;
  simulatedSeconds: number;
  finalTier: number;
  finalBalls: Record<BallType, number>;
  totalBalls: number;
  finalUpgrades: Upgrades;
  finalCoins: Decimal;
  finalBricksBroken: Decimal;
  finalIncomePerSecond: Decimal;
  incomeByTier: TierIncomeRow[];
  capImpact: CapImpactComparison | null;
}

export interface BalanceRunOptions {
  tiers?: readonly number[];
  includeCapImpact?: boolean;
}

/** Resolves a partial BalanceConfig against DEFAULT_BALANCE_CONFIG. */
export const resolveBalanceConfig = (
  overrides?: Partial<BalanceConfig>
): BalanceConfig => ({
  ...DEFAULT_BALANCE_CONFIG,
  ...overrides,
});

/** Computes brick maxHealth and coin value for a given tier under the provided config. */
export const computeBrickStatsForConfig = (
  tier: number,
  config: BalanceConfig
): { maxHealth: Decimal; value: Decimal } => {
  const safeTier = Math.max(1, Math.floor(tier));
  const effectiveTier = config.unboundedTiers
    ? safeTier
    : Math.min(config.maxTier, safeTier);

  if (effectiveTier <= 20 || !config.exponentialWallAfter20) {
    return {
      maxHealth: new Decimal(3 * (1 + 0.25 * (effectiveTier - 1))),
      value: new Decimal(Math.floor(Math.pow(effectiveTier, 1.6))),
    };
  }

  const baseHealth20 = new Decimal(3 * (1 + 0.25 * 19));
  const baseValue20 = new Decimal(Math.floor(Math.pow(20, 1.6)));
  const exponent = effectiveTier - 20;

  return {
    maxHealth: baseHealth20.mul(new Decimal(config.wallHealthGrowth).pow(exponent)),
    value: baseValue20.mul(new Decimal(config.wallValueGrowth).pow(exponent)).floor(),
  };
};

export const computeSpeedMultiplier = (level: number, config: BalanceConfig): number =>
  1 + level * config.upgradeAdditiveStep;

export const computeDamageMultiplier = (level: number, config: BalanceConfig): Decimal =>
  config.upgradeMode === 'multiplicative'
    ? new Decimal(config.upgradeMultBase).pow(level)
    : new Decimal(1 + level * config.upgradeAdditiveStep);

export const computeCoinMultiplier = (level: number, config: BalanceConfig): Decimal =>
  config.upgradeMode === 'multiplicative'
    ? new Decimal(config.upgradeMultBase).pow(level)
    : new Decimal(1 + level * config.upgradeAdditiveStep);

export const computePrestigeMultiplier = (
  prestigeLevel: number,
  config: BalanceConfig
): Decimal => new Decimal(config.prestigeMultiplier).pow(prestigeLevel);

export const computeUpgradeCost = (
  type: keyof Upgrades,
  level: number,
  config: BalanceConfig
): Decimal => {
  const base = new Decimal(DEFAULT_UPGRADE_BASE_COSTS[type]);
  if (level > 100) {
    return base.mul(new Decimal(config.upgradeCostMultiplier).pow(level)).ceil();
  }
  let cost = base;
  for (let i = 0; i < level; i++) {
    cost = cost.mul(config.upgradeCostMultiplier).ceil();
  }
  return cost;
};

/** Computes calibrated brick-break rate and coin income per second for a loadout and tier. */
export const computeCalibratedRates = (
  ballCounts: Record<BallType, number>,
  upgrades: Upgrades,
  tier: number,
  config: BalanceConfig
): { hitRatePerSecond: Decimal; incomePerSecond: Decimal } => {
  const { maxHealth, value } = computeBrickStatsForConfig(tier, config);
  const speedMult = computeSpeedMultiplier(upgrades.speed, config);
  const damageMult = computeDamageMultiplier(upgrades.damage, config);
  const coinMult = computeCoinMultiplier(upgrades.coinMult, config);
  const prestigeMult = computePrestigeMultiplier(config.prestigeLevel, config);

  let nominalHitRate = new Decimal(0);
  for (const type of BALL_TYPE_ORDER) {
    const count = ballCounts[type];
    if (count <= 0) continue;

    const ballConfig = BALL_TYPES[type];
    const effectiveDamage = new Decimal(ballConfig.damage).mul(damageMult);
    const hitsRequired = Decimal.max(1, maxHealth.div(effectiveDamage).ceil());
    let ballRate = new Decimal(ballConfig.speed * speedMult).div(hitsRequired);

    if (ballConfig.explosive) ballRate = ballRate.mul(1.5);
    if (ballConfig.pierce) ballRate = ballRate.mul(1.3);
    if (ballConfig.targeting) ballRate = ballRate.mul(1.2);

    nominalHitRate = nominalHitRate.add(ballRate.mul(count));
  }

  const hitRatePerSecond = nominalHitRate.mul(config.incomeCalibration);
  const incomePerSecond = hitRatePerSecond
    .mul(value)
    .mul(coinMult)
    .mul(prestigeMult);

  return { hitRatePerSecond, incomePerSecond };
};

const createEmptyBallCounts = (): Record<BallType, number> => ({
  basic: 0,
  fast: 0,
  heavy: 0,
  plasma: 0,
  explosive: 0,
  sniper: 0,
});

const createInitialBallCosts = (): Record<BallType, Decimal> => ({
  basic: new Decimal(BALL_TYPES.basic.baseCost),
  fast: new Decimal(BALL_TYPES.fast.baseCost),
  heavy: new Decimal(BALL_TYPES.heavy.baseCost),
  plasma: new Decimal(BALL_TYPES.plasma.baseCost),
  explosive: new Decimal(BALL_TYPES.explosive.baseCost),
  sniper: new Decimal(BALL_TYPES.sniper.baseCost),
});

const createInitialUpgradeCosts = (): Record<keyof Upgrades, Decimal> => ({
  speed: new Decimal(DEFAULT_UPGRADE_BASE_COSTS.speed),
  damage: new Decimal(DEFAULT_UPGRADE_BASE_COSTS.damage),
  coinMult: new Decimal(DEFAULT_UPGRADE_BASE_COSTS.coinMult),
});

const computeTierFromBricks = (bricksBroken: Decimal, config: BalanceConfig): number => {
  const rawTier = 1 + bricksBroken.div(config.bricksPerTier).floor().toNumber();
  if (config.unboundedTiers) return Math.max(1, rawTier);
  return Math.max(1, Math.min(config.maxTier, rawTier));
};

type PurchaseCandidate =
  | { kind: 'ball'; ballType: BallType; cost: Decimal; paybackSeconds: Decimal }
  | { kind: 'upgrade'; upgradeType: keyof Upgrades; cost: Decimal; paybackSeconds: Decimal };

const findBestAffordablePurchase = (
  coins: Decimal,
  ballCounts: Record<BallType, number>,
  totalBalls: number,
  upgrades: Upgrades,
  ballCosts: Record<BallType, Decimal>,
  upgradeCosts: Record<keyof Upgrades, Decimal>,
  currentTier: number,
  config: BalanceConfig
): PurchaseCandidate | null => {
  const baseIncome = computeCalibratedRates(
    ballCounts,
    upgrades,
    currentTier,
    config
  ).incomePerSecond;

  let best: PurchaseCandidate | null = null;

  const consider = (candidate: PurchaseCandidate): void => {
    if (!best || candidate.paybackSeconds.lt(best.paybackSeconds)) {
      best = candidate;
    }
  };

  if (totalBalls < config.maxBalls) {
    for (const ballType of BALL_TYPE_ORDER) {
      const cost = ballCosts[ballType];
      if (coins.lt(cost)) continue;

      const nextBalls = { ...ballCounts, [ballType]: ballCounts[ballType] + 1 };
      const nextIncome = computeCalibratedRates(
        nextBalls,
        upgrades,
        currentTier,
        config
      ).incomePerSecond;
      const delta = nextIncome.sub(baseIncome);
      if (delta.gt(0)) {
        consider({
          kind: 'ball',
          ballType,
          cost,
          paybackSeconds: cost.div(delta),
        });
      }
    }
  }

  const upgradeOrder: Array<keyof Upgrades> = ['speed', 'damage', 'coinMult'];
  for (const upgradeType of upgradeOrder) {
    if (upgradeType === 'speed' && upgrades.speed >= config.maxSpeedUpgrade) {
      continue;
    }
    const cost = upgradeCosts[upgradeType];
    if (coins.lt(cost)) continue;

    const nextUpgrades: Upgrades = {
      ...upgrades,
      [upgradeType]: upgrades[upgradeType] + 1,
    };
    const nextIncome = computeCalibratedRates(
      ballCounts,
      nextUpgrades,
      currentTier,
      config
    ).incomePerSecond;
    const delta = nextIncome.sub(baseIncome);
    if (delta.gt(0)) {
      consider({
        kind: 'upgrade',
        upgradeType,
        cost,
        paybackSeconds: cost.div(delta),
      });
    }
  }

  return best;
};

/** Computes brick stats and income/s across a list of tiers for a given loadout. */
export const computeIncomeByTier = (
  tiers: readonly number[],
  ballCounts: Record<BallType, number>,
  upgrades: Upgrades,
  config: BalanceConfig
): TierIncomeRow[] => {
  const unboundedConfig: BalanceConfig = { ...config, unboundedTiers: true };
  return tiers.map((tier) => {
    const { maxHealth, value } = computeBrickStatsForConfig(tier, unboundedConfig);
    const yieldPerHealth = value.div(maxHealth);
    const { incomePerSecond } = computeCalibratedRates(
      ballCounts,
      upgrades,
      tier,
      unboundedConfig
    );
    return {
      tier,
      maxHealth,
      value,
      yieldPerHealth,
      incomePerSecond,
    };
  });
};

const toCapScenarioMetrics = (
  label: string,
  result: BalanceRunResult
): CapScenarioMetrics => ({
  label,
  maxBalls: result.config.maxBalls,
  unboundedTiers: result.config.unboundedTiers,
  maxSpeedUpgrade: result.config.maxSpeedUpgrade,
  reachedPrestige: result.reachedPrestige,
  timeToPrestigeSeconds: result.timeToPrestigeSeconds,
  finalTier: result.finalTier,
  totalBalls: result.totalBalls,
  finalIncomePerSecond: result.finalIncomePerSecond,
});

/** Compares time-to-prestige and peak income across ball, tier, and speed caps. */
export const computeCapImpact = (config: BalanceConfig): CapImpactComparison => {
  const balls50 = runBalanceHarness(
    { ...config, maxBalls: 50 },
    { includeCapImpact: false, tiers: [] }
  );
  const balls100 = runBalanceHarness(
    { ...config, maxBalls: 100 },
    { includeCapImpact: false, tiers: [] }
  );
  const cappedTierAndSpeed = runBalanceHarness(
    { ...config, unboundedTiers: false, maxSpeedUpgrade: MAX_SPEED_UPGRADE },
    { includeCapImpact: false, tiers: [] }
  );
  const uncappedTierAndSpeed = runBalanceHarness(
    { ...config, unboundedTiers: true, maxSpeedUpgrade: Number.MAX_SAFE_INTEGER },
    { includeCapImpact: false, tiers: [] }
  );

  return {
    balls50: toCapScenarioMetrics('MAX_BALLS = 50', balls50),
    balls100: toCapScenarioMetrics('MAX_BALLS = 100', balls100),
    cappedTierAndSpeed: toCapScenarioMetrics('Capped Tier & Speed', cappedTierAndSpeed),
    uncappedTierAndSpeed: toCapScenarioMetrics(
      'Uncapped Tier & Speed',
      uncappedTierAndSpeed
    ),
  };
};

/**
 * Runs a deterministic headless idle simulation using a greedy ROI/payback
 * buy strategy until prestige threshold or maxRunSeconds is reached.
 */
export const runBalanceHarness = (
  overrides?: Partial<BalanceConfig>,
  options?: BalanceRunOptions
): BalanceRunResult => {
  const config = resolveBalanceConfig(overrides);
  const tiers = options?.tiers ?? DEFAULT_REPORT_TIERS;
  const includeCapImpact = options?.includeCapImpact ?? true;

  let coins = new Decimal(config.startingCoins);
  let bricksBroken = new Decimal(0);
  let currentTier = 1;
  const ballCounts = createEmptyBallCounts();
  let totalBalls = 0;
  const upgrades: Upgrades = { speed: 0, damage: 0, coinMult: 0 };
  const ballCosts = createInitialBallCosts();
  const upgradeCosts = createInitialUpgradeCosts();

  let elapsedSeconds = 0;
  let timeToFirstPurchaseSeconds: number | null = null;
  let timeToPrestigeSeconds: number | null = null;
  let reachedPrestige = false;

  const buyGreedy = (): void => {
    while (true) {
      const candidate = findBestAffordablePurchase(
        coins,
        ballCounts,
        totalBalls,
        upgrades,
        ballCosts,
        upgradeCosts,
        currentTier,
        config
      );
      if (!candidate) break;

      coins = coins.sub(candidate.cost);
      if (timeToFirstPurchaseSeconds === null) {
        timeToFirstPurchaseSeconds = elapsedSeconds;
      }

      if (candidate.kind === 'ball') {
        ballCounts[candidate.ballType] += 1;
        totalBalls += 1;
        ballCosts[candidate.ballType] = ballCosts[candidate.ballType]
          .mul(config.ballCostMultiplier)
          .ceil();
      } else {
        upgrades[candidate.upgradeType] += 1;
        upgradeCosts[candidate.upgradeType] = computeUpgradeCost(
          candidate.upgradeType,
          upgrades[candidate.upgradeType],
          config
        );
      }
    }
  };

  buyGreedy();

  const dt = Math.max(0.01, config.dtSeconds);
  const threshold = new Decimal(config.prestigeThreshold);

  while (elapsedSeconds < config.maxRunSeconds && bricksBroken.lt(threshold)) {
    const { hitRatePerSecond, incomePerSecond } = computeCalibratedRates(
      ballCounts,
      upgrades,
      currentTier,
      config
    );

    if (hitRatePerSecond.lte(0)) {
      break;
    }

    const stepBricks = hitRatePerSecond.mul(dt);
    if (bricksBroken.add(stepBricks).gte(threshold)) {
      const remainingBricks = threshold.sub(bricksBroken);
      const dtToPrestige = Math.min(dt, Math.max(0, remainingBricks.div(hitRatePerSecond).toNumber()));
      coins = coins.add(incomePerSecond.mul(dtToPrestige));
      bricksBroken = threshold;
      elapsedSeconds += dtToPrestige;
      currentTier = computeTierFromBricks(bricksBroken, config);
      timeToPrestigeSeconds = elapsedSeconds;
      reachedPrestige = true;
      break;
    }

    coins = coins.add(incomePerSecond.mul(dt));
    bricksBroken = bricksBroken.add(stepBricks);
    elapsedSeconds += dt;
    currentTier = computeTierFromBricks(bricksBroken, config);
    buyGreedy();
  }

  const finalIncomePerSecond = computeCalibratedRates(
    ballCounts,
    upgrades,
    currentTier,
    config
  ).incomePerSecond;

  const incomeByTier =
    tiers.length > 0
      ? computeIncomeByTier(tiers, ballCounts, upgrades, config)
      : [];

  const capImpact = includeCapImpact ? computeCapImpact(config) : null;

  return {
    config,
    timeToFirstPurchaseSeconds,
    timeToPrestigeSeconds,
    reachedPrestige,
    simulatedSeconds: elapsedSeconds,
    finalTier: currentTier,
    finalBalls: { ...ballCounts },
    totalBalls,
    finalUpgrades: { ...upgrades },
    finalCoins: coins,
    finalBricksBroken: bricksBroken,
    finalIncomePerSecond,
    incomeByTier,
    capImpact,
  };
};

const formatDecimal = (value: Decimal): string => {
  if (!Number.isFinite(value.mantissa) || !Number.isFinite(value.exponent)) {
    return '0';
  }
  if (value.abs().lt(1000)) {
    return value.toNumber().toFixed(2).replace(/\.00$/, '');
  }
  if (value.abs().lt(1e6)) {
    return Math.round(value.toNumber()).toLocaleString('en-US');
  }
  return value.toExponential(2);
};

const formatDuration = (seconds: number | null): string => {
  if (seconds === null) return 'N/A';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m ${secs}s`;
};

/** Formats a BalanceRunResult into a clean Markdown report. */
export const formatBalanceReport = (result: BalanceRunResult): string => {
  const lines: string[] = [];

  lines.push('# Idle Bricks Balance Report');
  lines.push('');
  lines.push(
    `Config: \`maxBalls=${result.config.maxBalls}\`, \`upgradeMode=${result.config.upgradeMode}\`, \`prestigeMult=${result.config.prestigeMultiplier}\`, \`unboundedTiers=${result.config.unboundedTiers}\`, \`maxSpeed=${result.config.maxSpeedUpgrade === Number.MAX_SAFE_INTEGER ? 'uncapped' : result.config.maxSpeedUpgrade}\``
  );
  lines.push('');
  lines.push('## Run Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Time to First Purchase | ${formatDuration(result.timeToFirstPurchaseSeconds)} |`);
  lines.push(`| Time to Prestige | ${formatDuration(result.timeToPrestigeSeconds)} |`);
  lines.push(`| Final Tier | ${result.finalTier} |`);
  lines.push(`| Final Balls | ${result.totalBalls} / ${result.config.maxBalls} |`);
  lines.push(
    `| Final Upgrades | speed=${result.finalUpgrades.speed}, damage=${result.finalUpgrades.damage}, coinMult=${result.finalUpgrades.coinMult} |`
  );
  lines.push(`| Final Coins | ${formatDecimal(result.finalCoins)} |`);
  lines.push(`| Final Income / s | ${formatDecimal(result.finalIncomePerSecond)} |`);
  lines.push('');

  lines.push('## Ball Composition');
  lines.push('');
  lines.push('| Ball Type | Count |');
  lines.push('| --- | --- |');
  for (const type of BALL_TYPE_ORDER) {
    lines.push(`| ${type} | ${result.finalBalls[type]} |`);
  }

  if (result.incomeByTier.length > 0) {
    lines.push('');
    lines.push('## Income by Tier');
    lines.push('');
    lines.push('| Tier | Brick Health | Brick Value | Value / Health | Income / s |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const row of result.incomeByTier) {
      lines.push(
        `| ${row.tier} | ${formatDecimal(row.maxHealth)} | ${formatDecimal(row.value)} | ${formatDecimal(row.yieldPerHealth)} | ${formatDecimal(row.incomePerSecond)} |`
      );
    }
  }

  if (result.capImpact) {
    lines.push('');
    lines.push('## Cap Impact Comparison');
    lines.push('');
    lines.push(
      '| Scenario | Max Balls | Tier Cap | Speed Cap | Time to Prestige | Final Tier | Peak Income / s |'
    );
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    const scenarios = [
      result.capImpact.balls50,
      result.capImpact.balls100,
      result.capImpact.cappedTierAndSpeed,
      result.capImpact.uncappedTierAndSpeed,
    ];
    for (const s of scenarios) {
      const tierCapLabel = s.unboundedTiers ? 'Uncapped' : String(result.config.maxTier);
      const speedCapLabel =
        s.maxSpeedUpgrade >= Number.MAX_SAFE_INTEGER
          ? 'Uncapped'
          : String(s.maxSpeedUpgrade);
      lines.push(
        `| ${s.label} | ${s.maxBalls} | ${tierCapLabel} | ${speedCapLabel} | ${formatDuration(s.timeToPrestigeSeconds)} | ${s.finalTier} | ${formatDecimal(s.finalIncomePerSecond)} |`
      );
    }
  }

  return lines.join('\n');
};
