import Decimal from 'break_infinity.js';
import type { BrickData } from '../../types';

export interface BrickDamageOperation {
  id: string;
  damage: Decimal;
}

export interface BrickDamageResult {
  id: string;
  brick: BrickData;
  destroyed: boolean;
  value: Decimal;
  damage: Decimal;
}

export interface BrickDamageResolution {
  bricks: BrickData[];
  results: BrickDamageResult[];
}

const ZERO = new Decimal(0);

/** Resolves a batch against each brick at most once, in board order. */
export const resolveBrickDamageBatch = (
  bricks: BrickData[],
  operations: BrickDamageOperation[],
  now: number = 0
): BrickDamageResolution => {
  const damageByBrickId = new Map<string, Decimal>();
  for (const operation of operations) {
    const currentDamage = damageByBrickId.get(operation.id);
    damageByBrickId.set(
      operation.id,
      currentDamage ? currentDamage.add(operation.damage) : operation.damage
    );
  }

  if (damageByBrickId.size === 0) return { bricks, results: [] };

  const nextBricks: BrickData[] = [];
  const results: BrickDamageResult[] = [];
  for (const brick of bricks) {
    const damage = damageByBrickId.get(brick.id);
    if (!damage) {
      nextBricks.push(brick);
      continue;
    }

    const health = brick.health.sub(damage);
    const destroyed = health.lte(0);
    const updatedBrick = destroyed
      ? brick
      : { ...brick, health, lastHitTime: now };

    if (!destroyed) nextBricks.push(updatedBrick);
    results.push({
      id: brick.id,
      brick: updatedBrick,
      destroyed,
      value: destroyed ? brick.value : ZERO,
      damage,
    });
  }

  return { bricks: nextBricks, results };
};
