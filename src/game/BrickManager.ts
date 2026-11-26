import type { BrickData } from '../types';
import { calculateBrickStats } from '../types';
import { generateId } from '../utils';
import type { RandomSource } from './model/rng';
import {
  BRICK_WIDTH,
  BRICK_HEIGHT,
  BRICK_PADDING,
  MAX_ROWS_FILL_FACTOR,
  ARENA_FLOOR_HEIGHT,
  getSpawnZoneHeight,
  GOLD_BRICK_VALUE_MULTIPLIER,
  ARMORED_BRICK_HEALTH_MULTIPLIER,
  GOLD_BRICK_SPAWN_CHANCE,
  ARMORED_BRICK_SPAWN_CHANCE,
} from './constants';
import type { BrickKind } from '../types';

/**
 * Manages brick generation and screen-space placement.
 */
export class BrickManager {
  private size: { width: number; height: number };
  private readonly random: RandomSource;

  constructor(
    size: { width: number; height: number },
    random: RandomSource = { next: Math.random }
  ) {
    this.size = { width: size.width, height: size.height };
    this.random = random;
  }

  /** Updates the viewport used for layout and capacity calculations. */
  resize(width: number, height: number) {
    this.size = { width, height };
  }

  private get offsetTop() {
    // Leaves the top edge and launch zone visually clear.
    return Math.max(20, this.size.height * 0.2);
  }

  /** Lowest brick row stays above the floor and launch zone. */
  private get fillBottom() {
    const { height } = this.size;
    const spawnTop = height - ARENA_FLOOR_HEIGHT - getSpawnZoneHeight(height);
    return Math.min(height * MAX_ROWS_FILL_FACTOR, spawnTop);
  }

  /** Rows that fit between offsetTop and the bottom fill limit. */
  private get maxRows() {
    return Math.max(
      0,
      Math.floor((this.fillBottom - this.offsetTop) / (BRICK_HEIGHT + BRICK_PADDING))
    );
  }

  /** Maximum bricks the current viewport can hold. */
  getCapacity(): number {
    const { width } = this.size;
    const cols = Math.floor(
      (width - this.offsetLeft * 2) / (BRICK_WIDTH + BRICK_PADDING)
    );
    return Math.max(0, cols * this.maxRows);
  }

  private get offsetLeft() {
    return Math.max(
      20,
      (this.size.width % (BRICK_WIDTH + BRICK_PADDING)) / 2
    );
  }

  /**
   * Creates a single brick instance.
   */
  private createBrick(x: number, y: number, baseTier: number): BrickData {
    const tierVariation = Math.floor(this.random.next() * 3) - 1;
    const tier = Math.max(1, baseTier + tierVariation);
    const { maxHealth: baseHealth, value: baseValue } = calculateBrickStats(tier);

    const roll = this.random.next();
    const kind: BrickKind =
      roll < GOLD_BRICK_SPAWN_CHANCE
        ? 'gold'
        : roll < GOLD_BRICK_SPAWN_CHANCE + ARMORED_BRICK_SPAWN_CHANCE
          ? 'armored'
          : 'normal';

    const maxHealth =
      kind === 'armored'
        ? baseHealth.mul(ARMORED_BRICK_HEALTH_MULTIPLIER)
        : baseHealth;
    const value =
      kind === 'gold' ? baseValue.mul(GOLD_BRICK_VALUE_MULTIPLIER) : baseValue;

    return {
      id: generateId(() => this.random.next()),
      kind,
      x,
      y,
      width: BRICK_WIDTH,
      height: BRICK_HEIGHT,
      tier,
      health: maxHealth,
      maxHealth,
      value,
    };
  }

  /**
   * Generates a grid of bricks.
   */
  generateBricks(count: number, baseTier: number): BrickData[] {
    const { width } = this.size;
    const bricks: BrickData[] = [];
    const cols = Math.floor(
      (width - this.offsetLeft * 2) / (BRICK_WIDTH + BRICK_PADDING)
    );
    const rows = Math.min(Math.ceil(count / cols), this.maxRows);

    let created = 0;

    for (let row = 0; row < rows && created < count; row++) {
      for (let col = 0; col < cols && created < count; col++) {
        const x = this.offsetLeft + col * (BRICK_WIDTH + BRICK_PADDING);
        const y = this.offsetTop + row * (BRICK_HEIGHT + BRICK_PADDING);

        bricks.push(this.createBrick(x, y, baseTier));
        created++;
      }
    }

    return bricks;
  }

  /**
   * Adds new bricks to fill available space on the screen.
   */
  addBricksToFillScreen(currentBricks: BrickData[], baseTier: number): BrickData[] {
    const { width } = this.size;
    const cols = Math.floor(
      (width - this.offsetLeft * 2) / (BRICK_WIDTH + BRICK_PADDING)
    );
    const maxRows = this.maxRows;
    const maxBricks = cols * maxRows;

    const bricksToAdd = Math.min(maxBricks - currentBricks.length, cols);
    if (bricksToAdd <= 0) {
      return [];
    }

    const occupied = new Set<string>();
    for (const brick of currentBricks) {
      const col = Math.round(
        (brick.x - this.offsetLeft) / (BRICK_WIDTH + BRICK_PADDING)
      );
      const row = Math.round(
        (brick.y - this.offsetTop) / (BRICK_HEIGHT + BRICK_PADDING)
      );
      occupied.add(`${row},${col}`);
    }

    const newBricks: BrickData[] = [];

    for (let row = 0; row < maxRows && newBricks.length < bricksToAdd; row++) {
      for (let col = 0; col < cols && newBricks.length < bricksToAdd; col++) {
        if (!occupied.has(`${row},${col}`)) {
          const x = this.offsetLeft + col * (BRICK_WIDTH + BRICK_PADDING);
          const y = this.offsetTop + row * (BRICK_HEIGHT + BRICK_PADDING);

          newBricks.push(this.createBrick(x, y, baseTier));
        }
      }
    }

    return newBricks;
  }
}
