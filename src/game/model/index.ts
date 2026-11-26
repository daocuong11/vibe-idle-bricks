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
export * from './physics';
