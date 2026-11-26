import { describe, it, expect } from 'vitest';
import { BrickManager } from '../../src/game/BrickManager';
import { createSeededRandom } from '../../src/game/model/rng';
import {
  BRICK_WIDTH,
  BRICK_HEIGHT,
  BRICK_PADDING,
  MAX_ROWS_FILL_FACTOR,
  ARENA_FLOOR_HEIGHT,
  getSpawnZoneHeight,
  GOLD_BRICK_VALUE_MULTIPLIER,
  ARMORED_BRICK_HEALTH_MULTIPLIER,
} from '../../src/game/constants';
import { calculateBrickStats } from '../../src/types/game';

describe('BrickManager', () => {
  describe('generateBricks', () => {
    it('reproduces tiers and entity IDs from the same seed', () => {
      const first = new BrickManager({ width: 800, height: 600 }, createSeededRandom(42));
      const second = new BrickManager({ width: 800, height: 600 }, createSeededRandom(42));

      expect(first.generateBricks(50, 5)).toEqual(second.generateBricks(50, 5));
    });

    it('uses a different seeded sequence for a different seed', () => {
      const first = new BrickManager({ width: 800, height: 600 }, createSeededRandom(42));
      const second = new BrickManager({ width: 800, height: 600 }, createSeededRandom(43));

      expect(first.generateBricks(20, 5)).not.toEqual(second.generateBricks(20, 5));
    });

    it('keeps every brick above the launch zone on a short canvas', () => {
      const height = 250;
      const manager = new BrickManager({ width: 375, height });
      const bricks = manager.generateBricks(1000, 1);
      const spawnTop = height - ARENA_FLOOR_HEIGHT - getSpawnZoneHeight(height);

      expect(bricks.length).toBeGreaterThan(0);
      expect(bricks.length).toBeLessThanOrEqual(manager.getCapacity());
      for (const brick of bricks) {
        expect(brick.y + brick.height).toBeLessThanOrEqual(spawnTop);
      }
    })

    it('generates the requested number of bricks', () => {
      const manager = new BrickManager({ width: 800, height: 600 });
      const bricks = manager.generateBricks(20, 1);
      expect(bricks.length).toBe(20);
    });

    it('lays bricks out in a grid starting from offsetLeft and offsetTop', () => {
      const manager = new BrickManager({ width: 800, height: 600 });
      const bricks = manager.generateBricks(2, 1);

      expect(bricks[0].x).toBeLessThan(bricks[1].x);
      expect(bricks[0].y).toBe(bricks[1].y);
    });

    it('assigns bricks the correct dimensions', () => {
      const manager = new BrickManager({ width: 400, height: 300 });
      const bricks = manager.generateBricks(1, 1);

      expect(bricks[0].width).toBe(BRICK_WIDTH);
      expect(bricks[0].height).toBe(BRICK_HEIGHT);
    });

    it('varies tier around the base tier', () => {
      const manager = new BrickManager({ width: 800, height: 600 });
      const bricks = manager.generateBricks(50, 5);

      const tiers = bricks.map((b) => b.tier);
      const minTier = Math.min(...tiers);
      const maxTier = Math.max(...tiers);

      expect(minTier).toBeGreaterThanOrEqual(4);
      expect(maxTier).toBeLessThanOrEqual(7);
    });

    it('spawns gold and armored bricks with modified stats', () => {
      const manager = new BrickManager({ width: 800, height: 600 }, createSeededRandom(7));
      const bricks = manager.generateBricks(200, 5);
      const gold = bricks.find((brick) => brick.kind === 'gold');
      const armored = bricks.find((brick) => brick.kind === 'armored');

      expect(gold).toBeDefined();
      expect(armored).toBeDefined();
      if (gold) {
        expect(gold.value.eq(calculateBrickStats(gold.tier).value.mul(GOLD_BRICK_VALUE_MULTIPLIER))).toBe(true);
      }
      if (armored) {
        expect(
          armored.maxHealth.eq(
            calculateBrickStats(armored.tier).maxHealth.mul(ARMORED_BRICK_HEALTH_MULTIPLIER),
          ),
        ).toBe(true);
      }
    });

    it('does not drop tier below 1', () => {
      const manager = new BrickManager({ width: 800, height: 600 });
      const bricks = manager.generateBricks(100, 1);

      expect(bricks.every((b) => b.tier >= 1)).toBe(true);
    });
  });

  describe('addBricksToFillScreen', () => {
    it('returns empty array when screen is already full', () => {
      const manager = new BrickManager({ width: 200, height: 200 });
      const cols = Math.floor((200 - 40) / (BRICK_WIDTH + BRICK_PADDING));
      const offsetTop = Math.max(20, 200 * 0.2);
      const maxRows = Math.floor((200 * MAX_ROWS_FILL_FACTOR - offsetTop) / (BRICK_HEIGHT + BRICK_PADDING));
      const fullBricks = manager.generateBricks(cols * maxRows, 1);

      const added = manager.addBricksToFillScreen(fullBricks, 1);
      expect(added.length).toBe(0);
    });

    it('fills empty grid slots up to one row worth', () => {
      const manager = new BrickManager({ width: 400, height: 300 });
      const existing = manager.generateBricks(5, 1);
      const added = manager.addBricksToFillScreen(existing, 2);

      expect(added.length).toBeGreaterThan(0);
      // Ensure no duplicate positions
      const positions = new Set(existing.concat(added).map((b) => `${b.x},${b.y}`));
      expect(positions.size).toBe(existing.length + added.length);
    });

    it('returns bricks with valid stats', () => {
      const manager = new BrickManager({ width: 400, height: 300 });
      const added = manager.addBricksToFillScreen([], 3);

      expect(added.length).toBeGreaterThan(0);
      for (const brick of added) {
        expect(brick.id).toBeTruthy();
        expect(brick.health.gt(0)).toBe(true);
        expect(brick.maxHealth.gt(0)).toBe(true);
        expect(brick.value.gte(0)).toBe(true);
      }
    });
  });

  describe('resize', () => {
    it('recomputes capacity and layout for the new viewport', () => {
      const manager = new BrickManager({ width: 800, height: 500 });
      const wideCapacity = manager.getCapacity();

      manager.resize(400, 300);

      expect(manager.getCapacity()).toBeLessThan(wideCapacity);
      const bricks = manager.generateBricks(1000, 1);
      expect(bricks.length).toBeGreaterThan(0);
      expect(bricks.every((brick) => brick.x + brick.width <= 400)).toBe(true);
      expect(bricks.every((brick) => brick.y + brick.height <= 300)).toBe(true);
    });
  });
});
