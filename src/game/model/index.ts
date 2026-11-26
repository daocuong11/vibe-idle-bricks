export { createSeededRandom, type RandomSource } from './rng';
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
export * from './physics';
