export { createSeededRandom, type RandomSource, type SeededRandomSource } from './rng';
export {
  resolveBrickDamageBatch,
  type BrickDamageOperation,
  type BrickDamageResult,
} from './damage';
export type { BoardEvent, BoardWorld, DamageSource } from './types';
export {
  createBoardWorld,
  refreshBoardWorld,
  damageBoardBricks,
  explodeBoard,
  checkBrickCollisions,
  simulateBall,
  stepBoardWorld,
  updateBoardExplosions,
  advanceBoardWorld,
  findBrickAt,
  applyBoardClickDamage,
  takeBoardEvents,
} from './simulation';
export {
  DEFAULT_MAX_SIMULATED_SECONDS,
  DEFAULT_OFFLINE_SEED,
  simulateOfflineBoard,
  type OfflineSimulationInput,
  type OfflineSimulationResult,
} from './offline';
export {
  DEFAULT_BALANCE_CONFIG,
  DEFAULT_INCOME_CALIBRATION,
  DEFAULT_REPORT_TIERS,
  DEFAULT_UPGRADE_BASE_COSTS,
  computeBrickStatsForConfig,
  computeCalibratedRates,
  computeCapImpact,
  computeCoinMultiplier,
  computeDamageMultiplier,
  computeIncomeByTier,
  computePrestigeMultiplier,
  computeSpeedMultiplier,
  computeUpgradeCost,
  formatBalanceReport,
  resolveBalanceConfig,
  runBalanceHarness,
  type BalanceConfig,
  type BalanceRunOptions,
  type BalanceRunResult,
  type CapImpactComparison,
  type CapScenarioMetrics,
  type TierIncomeRow,
  type UpgradeScalingMode,
} from './balanceHarness';
export * from './physics';
