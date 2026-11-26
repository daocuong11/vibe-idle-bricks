import type Decimal from 'break_infinity.js';
import type { BallData, BallType, BrickData, Explosion } from '../../types';
import type { SpatialGrid } from '../SpatialGrid';

export type DamageSource = 'ball' | 'explosion' | 'click';

export interface BrickDamagedEvent {
  type: 'brickDamaged';
  brick: BrickData;
  damage: Decimal;
  source: DamageSource;
  showDamageText: boolean;
}

export interface BrickDestroyedEvent {
  type: 'brickDestroyed';
  brick: BrickData;
  coins: Decimal;
  source: DamageSource;
  particleCount: number;
  showCoinText: boolean;
}

export type BoardEvent =
  | BrickDamagedEvent
  | BrickDestroyedEvent
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'explosionShake' };

/** All mutable inputs and step state needed by the pure board simulation. */
export interface BoardWorld {
  width: number;
  height: number;
  balls: BallData[];
  bricks: BrickData[];
  explosions: Explosion[];
  speedMultiplier: number;
  damageMultiplier: Decimal;
  coinMultiplier: Decimal;
  accumulator: number;
  time: number;
  spatialGrid: SpatialGrid;
  target: BrickData | null;
  /** Player-marked priority target; cleared when it is destroyed or missing. */
  priorityBrickId?: string | null;
  /** Permanent per-type damage/speed multipliers. */
  ballDamageMultipliers?: Partial<Record<BallType, Decimal>>;
  ballSpeedMultipliers?: Partial<Record<BallType, Decimal>>;
  events: BoardEvent[];
}
