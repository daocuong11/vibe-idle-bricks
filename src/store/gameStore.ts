import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import Decimal from 'break_infinity.js';
import {
  BALL_TYPES,
  UPGRADE_MULTIPLIER,
  MAX_TIER,
  PRESTIGE_THRESHOLD,
  getPrestigeMultiplier,
  MAX_BALLS,
  MAX_SPEED_UPGRADE,
  MAX_PRESTIGE_LEVEL,
  COST_MULTIPLIER,
  STARTING_COINS,
  UPGRADE_COST_MULTIPLIER,
} from '../types';
import type {
  BallType,
  BallData,
  BrickData,
  Upgrades,
  Explosion,
  SaveData,
  SavedBrickData,
  UnlockedAchievements,
} from '../types';
import {
  evaluateAchievements,
  getEmptyUnlocks,
  type AchievementGameState,
} from '../types/achievements';
import { createBall } from '../utils/helpers';
import {
  LIVE_INCOME_CALIBRATION,
  calculateIncomePerSecond,
  calculateOfflineEarnings,
  getMeasuredIncomePerSecond,
  recordIncome,
  resetIncomeTracking,
} from './earnings';
import { playSound } from '../utils/audio';
import {
  resolveBrickDamageBatch,
  type BrickDamageOperation,
  type BrickDamageResult,
} from '../game/model/damage';

/**
 * Interface defining the entire state and actions of the game store.
 */
interface GameStore {
  // State
  /** Current amount of coins available to the player. */
  coins: Decimal;
  /** Number of bricks broken in the current prestige run. */
  bricksBroken: Decimal;
  /** Total number of bricks broken across all runs (lifetime stats). */
  totalBricksBroken: Decimal;
  /** Current prestige level, granting global bonuses. */
  prestigeLevel: number;
  /** Current levels of all purchased upgrades. */
  upgrades: Upgrades;
  /** Current cost to purchase the next ball of each type. */
  ballCosts: Record<BallType, Decimal>;
  /** Current cost to purchase the next level of each upgrade. */
  upgradeCosts: Record<keyof Upgrades, Decimal>;
  /** Current difficulty tier for new bricks. */
  currentTier: number;
  /** List of all active balls. */
  balls: BallData[];
  /** List of all active bricks. */
  bricks: BrickData[];
  /** List of active explosion effects. */
  explosions: Explosion[];
  /** The dimensions of the game canvas. */
  canvasSize: { width: number; height: number };
  /** Whether the game simulation is currently paused. */
  isPaused: boolean;
  /**
   * Offline-earnings message set by `load()` to be surfaced as a toast by the UI.
   * Cleared after the UI reads it.
   */
  pendingOfflineMessage: string | null;
  /**
   * Set when storage is unavailable or a write fails. The UI shows one toast
   * per distinct message; a later successful save clears it.
   */
  pendingSaveError: string | null;
  /** Map of achievement id → unlock timestamp (ms). Persisted in the save. */
  unlockedAchievements: UnlockedAchievements;
  /** Queue of achievement ids that have just been unlocked but not yet shown. */
  pendingAchievementUnlocks: string[];
  /** Seed/state for deterministic board RNG across saves. */
  boardSeed: number;
  /** Timestamp of the last save or update, used for offline earnings. */
  timestamp: number;

  // Actions
  /**
   * Updates the canvas dimensions and initializes the first ball if needed.
   * @param width - The new width of the canvas.
   * @param height - The new height of the canvas.
   */
  setCanvasSize: (width: number, height: number) => void;

  /**
   * Adds coins to the player's balance, applying prestige bonuses.
   * @param amount - The base amount of coins to add.
   */
  addCoins: (amount: Decimal) => void;

  /**
   * Applies capped idle earnings using the supplied live rate, or the current
   * measured-or-fallback rate when none is supplied.
   * @param seconds - Seconds spent hidden or away.
   * @param liveIncomePerSecond - Rate captured when the tab was hidden.
   */
  applyIdleEarnings: (seconds: number, liveIncomePerSecond?: Decimal) => void;

  /**
   * Increments the count of broken bricks and updates the tier if necessary.
   */
  incrementBricksBroken: () => void;

  /**
   * Applies batched board rewards, progression, achievement checks, and an
   * optional board mirror snapshot in a single store update.
   */
  applyBoardRewards: (batch: BoardRewardBatch) => void;

  /**
   * Attempts to purchase a new ball of the specified type.
   * @param type - The type of ball to buy.
   * @returns {boolean} True if the purchase was successful, false otherwise.
   */
  buyBall: (type: BallType) => boolean;

  /**
   * Attempts to purchase an upgrade.
   * @param type - The type of upgrade to buy.
   * @returns {boolean} True if the purchase was successful, false otherwise.
   */
  buyUpgrade: (type: keyof Upgrades) => boolean;

  /**
   * Attempts to purchase as many levels of an upgrade as possible.
   * @param type - The type of upgrade to buy.
   * @returns {number} The number of levels purchased.
   */
  buyMaxUpgrade: (type: keyof Upgrades) => number;

  /**
   * Checks if the player meets the requirements to prestige.
   * @returns {boolean} True if prestige is available.
   */
  canPrestige: () => boolean;

  /**
   * Resets the game progress to gain prestige levels and bonuses.
   * @returns {boolean} True if prestige was successful.
   */
  prestige: () => boolean;

  /**
   * Updates the list of active bricks (e.g., from the game loop).
   * @param bricks - The new list of bricks.
   */
  setBricks: (bricks: BrickData[]) => void;

  /**
   * Removes a specific brick by ID.
   * @param id - The ID of the brick to remove.
   */
  removeBrick: (id: string) => void;

  /**
   * Applies damage to a specific brick and handles its potential destruction.
   * @param id - The ID of the brick to damage.
   * @param damage - The amount of damage to deal.
   * @returns {{ destroyed: boolean; value: Decimal } | null} The result of the damage (destroyed status and coin value), or null if brick not found.
   */
  damageBrick: (id: string, damage: Decimal) => { destroyed: boolean; value: Decimal } | null;

  /**
   * Applies multiple brick damage operations in a single state update.
   * Returns per-brick results for rewards and effects.
   */
  applyBrickDamageBatch: (operations: BrickDamageOperation[]) => BrickDamageResult[];

  /**
   * Spawns an explosion effect at the specified location.
   * @param x - The X coordinate.
   * @param y - The Y coordinate.
   * @param radius - The radius of the explosion.
   */
  addExplosion: (x: number, y: number, radius: number) => void;

  /**
   * Updates the state of all active explosions (reduces life).
   * @param deltaTime - Time elapsed since last frame.
   */
  updateExplosions: (deltaTime: number) => void;

  /**
   * Persists the current game state to local storage.
   * @returns {boolean} True when the write succeeded.
   */
  save: () => boolean;

  /**
   * Loads the game state from local storage and handles offline progress.
   */
  load: () => void;

  /**
   * Resets the entire game state to default (hard reset).
   */
  reset: () => void;

  /**
   * Exports the current save data as a JSON string.
   * @returns {string} The exported save string.
   */
  exportSave: () => string;

  /**
   * Imports a save from a string.
   * @param data - The save data string to import.
   * @returns {boolean} True if import was successful.
   */
  importSave: (data: string) => boolean;

  /**
   * Clears the pending offline notification after it has been shown.
   */
  clearOfflineMessage: () => void;

  /**
   * Pauses or unpauses the game.
   * @param paused - True to pause, false to unpause.
   */
  setPaused: (paused: boolean) => void;

  /**
   * Re-evaluates all achievement conditions against the current state and
   * queues up toasts for any newly-unlocked achievements. Idempotent — calling
   * this repeatedly is safe and only unlocks once per achievement.
   * @returns {string[]} The ids of any newly-unlocked achievements.
   */
  checkAchievements: () => string[];

  /**
   * Removes the achievement unlock queue after the UI has shown toasts. The
   * achievements remain unlocked in `unlockedAchievements`; this only clears
   * the transient notification queue.
   * @param ids - Unlocks that were actually shown. Omit to clear the whole queue.
   */
  drainPendingAchievementUnlocks: (ids?: string[]) => void;

  /**
   * Calculates the current global damage multiplier.
   * @returns {number} The damage multiplier.
   */
  getDamageMult: () => number;

  /**
   * Calculates the current global coin multiplier.
   * @returns {number} The coin multiplier.
   */
  getCoinMult: () => number;

  /**
   * Calculates the current global speed multiplier.
   * @returns {number} The speed multiplier.
   */
  getSpeedMult: () => number;

  /**
   * Estimates current coins per second from live measurements when available.
   * @returns {Decimal} Measured or calibrated nominal income.
   */
  getIncomePerSecond: () => Decimal;
}

const ZERO_DECIMAL = new Decimal(0);
const SAVE_STORAGE_KEY = 'idleBricksSave';

/** Current persisted save schema. Version 0 means a pre-versioning legacy save. */
export const SAVE_VERSION = 2;

export interface BoardSnapshotPatch {
  balls: BallData[];
  bricks: BrickData[];
  explosions: Explosion[];
  seed?: number;
}

export interface BoardRewardBatch {
  coins?: Decimal;
  bricksBroken?: number | Decimal;
  board?: BoardSnapshotPatch;
}

export interface BoardSyncHandlers {
  flush: () => void;
  discard: () => void;
}

let activeBoardSyncHandlers: BoardSyncHandlers | null = null;

/** Registers the active BoardSimulation flush/discard callbacks for lifecycle boundaries. */
export const registerBoardSyncHandlers = (handlers: BoardSyncHandlers): (() => void) => {
  activeBoardSyncHandlers = handlers;
  return () => {
    if (activeBoardSyncHandlers === handlers) {
      activeBoardSyncHandlers = null;
    }
  };
};

const flushActiveBoard = (): void => {
  activeBoardSyncHandlers?.flush();
};

const discardActiveBoard = (): void => {
  activeBoardSyncHandlers?.discard();
};

const nextBoardSeed = (): number => (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;

const SAVE_UNAVAILABLE_MESSAGE =
  'Saving is unavailable in this browser. Progress will be lost when the tab closes.';
const SAVE_FAILED_MESSAGE =
  'Could not save your progress. Check browser storage and try again.';
const SAVE_UNREADABLE_MESSAGE =
  'Your save could not be read. It may have been created by a newer version of the game.';

/**
 * break_infinity represents NaN/Infinity as special Decimal values that do not
 * throw during construction, so validate the rendered form explicitly.
 */
const isFiniteDecimal = (value: Decimal): boolean => {
  const rendered = value.toString();
  return rendered !== 'NaN' && rendered !== 'Infinity' && rendered !== '-Infinity';
};

/**
 * Parses a non-negative Decimal. Malformed, negative, NaN, and Infinity values
 * fall back instead of poisoning state: a NaN balance makes every purchase
 * comparison false and permanently soft-locks the game.
 */
const parseDecimal = (value: unknown, fallback: Decimal = ZERO_DECIMAL): Decimal => {
  try {
    const parsed = new Decimal(value as string | number);
    return isFiniteDecimal(parsed) && parsed.gte(0) ? parsed : new Decimal(fallback);
  } catch {
    return new Decimal(fallback);
  }
};

const parseInteger = (value: unknown, fallback = 0, max?: number): number => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  const normalizedValue = Math.max(fallback, Math.floor(numericValue));

  if (typeof max === 'number') {
    return Math.min(max, normalizedValue);
  }

  return normalizedValue;
};

const parseTimestamp = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : Date.now();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Missing/non-numeric versions are legacy (0); future versions are rejected. */
const toSaveVersion = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue >= 0 ? numericValue : 0;
};

const isValidBallType = (value: unknown): value is BallType => {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BALL_TYPES, value);
};

const parseStrictDecimal = (value: unknown): Decimal | null => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
  } else if (typeof value === 'string') {
    if (value.trim() === '') return null;
  } else {
    return null;
  }

  try {
    const parsed = new Decimal(value);
    return isFiniteDecimal(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const parseSavedBrick = (
  raw: unknown,
  maxWidth: number,
  maxHeight: number,
  seenIds: Set<string>
): BrickData | null => {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string') return null;
  const id = raw.id.trim();
  if (id.length === 0 || seenIds.has(id)) return null;

  const { x, y, width, height, tier } = raw;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }
  if (width <= 0 || height <= 0 || x < 0 || y < 0) return null;
  if (x + width > maxWidth || y + height > maxHeight) return null;

  if (typeof tier !== 'number' || !Number.isFinite(tier) || tier < 1) {
    return null;
  }
  const normalizedTier = Math.min(MAX_TIER, Math.floor(tier));

  const health = parseStrictDecimal(raw.health);
  const maxHealth = parseStrictDecimal(raw.maxHealth);
  const value = parseStrictDecimal(raw.value);
  if (!health || !maxHealth || !value) return null;
  if (health.lte(0) || maxHealth.lte(0) || value.lt(0)) return null;
  if (health.gt(maxHealth)) return null;

  seenIds.add(id);
  return {
    id,
    x,
    y,
    width,
    height,
    tier: normalizedTier,
    health,
    maxHealth,
    value,
  };
};

const parseSavedBoard = (
  rawBoard: unknown,
  canvasWidth: number,
  canvasHeight: number,
  fallbackSeed: number
): { bricks: BrickData[]; boardSeed: number } => {
  if (!isRecord(rawBoard)) {
    return { bricks: [], boardSeed: fallbackSeed };
  }

  const boardSeed =
    typeof rawBoard.seed === 'number' && Number.isFinite(rawBoard.seed)
      ? (Math.floor(rawBoard.seed) >>> 0) || fallbackSeed
      : fallbackSeed;

  const { width: boardWidth, height: boardHeight } = rawBoard;
  if (
    typeof boardWidth !== 'number' ||
    typeof boardHeight !== 'number' ||
    !Number.isFinite(boardWidth) ||
    !Number.isFinite(boardHeight) ||
    boardWidth <= 0 ||
    boardHeight <= 0
  ) {
    return { bricks: [], boardSeed };
  }

  if (!Array.isArray(rawBoard.bricks)) {
    return { bricks: [], boardSeed };
  }

  const maxWidth = canvasWidth > 0 ? Math.min(boardWidth, canvasWidth) : boardWidth;
  const maxHeight = canvasHeight > 0 ? Math.min(boardHeight, canvasHeight) : boardHeight;
  const seenIds = new Set<string>();
  const bricks: BrickData[] = [];

  for (const item of rawBoard.bricks) {
    const brick = parseSavedBrick(item, maxWidth, maxHeight, seenIds);
    if (!brick) {
      // Any invalid brick rejects the snapshot so callers fall back to fresh setup.
      return { bricks: [], boardSeed };
    }
    bricks.push(brick);
  }

  return { bricks, boardSeed };
};

interface SaveDataBuilderState {
  coins: Decimal;
  bricksBroken: Decimal;
  totalBricksBroken: Decimal;
  prestigeLevel: number;
  upgrades: Upgrades;
  ballCosts: Record<BallType, Decimal>;
  upgradeCosts: Record<keyof Upgrades, Decimal>;
  currentTier: number;
  balls: BallData[];
  bricks: BrickData[];
  canvasSize: { width: number; height: number };
  boardSeed: number;
  unlockedAchievements: UnlockedAchievements;
}

const serializeBrick = (brick: BrickData): SavedBrickData => ({
  id: brick.id,
  x: brick.x,
  y: brick.y,
  width: brick.width,
  height: brick.height,
  tier: brick.tier,
  health: brick.health.toString(),
  maxHealth: brick.maxHealth.toString(),
  value: brick.value.toString(),
});

const buildSaveData = (state: SaveDataBuilderState): SaveData => ({
  coins: state.coins.toString(),
  bricksBroken: state.bricksBroken.toString(),
  totalBricksBroken: state.totalBricksBroken.toString(),
  prestigeLevel: state.prestigeLevel,
  upgrades: state.upgrades,
  ballCosts: Object.fromEntries(
    Object.entries(state.ballCosts).map(([k, v]) => [k, v.toString()])
  ),
  upgradeCosts: Object.fromEntries(
    Object.entries(state.upgradeCosts).map(([k, v]) => [k, v.toString()])
  ),
  currentTier: state.currentTier,
  balls: state.balls.map((b) => b.type),
  board: {
    width: state.canvasSize.width,
    height: state.canvasSize.height,
    seed: state.boardSeed,
    bricks: state.bricks.filter((brick) => brick.health.gt(0)).map(serializeBrick),
  },
  unlockedAchievements: state.unlockedAchievements,
  timestamp: Date.now(),
  version: SAVE_VERSION,
});

/**
 * Returns the default costs for all ball types.
 * @returns {Record<BallType, Decimal>} A map of ball types to their initial costs.
 */
const getDefaultBallCosts = (): Record<BallType, Decimal> => ({
  basic: new Decimal(BALL_TYPES.basic.baseCost),
  fast: new Decimal(BALL_TYPES.fast.baseCost),
  heavy: new Decimal(BALL_TYPES.heavy.baseCost),
  plasma: new Decimal(BALL_TYPES.plasma.baseCost),
  explosive: new Decimal(BALL_TYPES.explosive.baseCost),
  sniper: new Decimal(BALL_TYPES.sniper.baseCost),
});

/** Highest cost reachable by buying the ball cap from its base price. */
const getMaxBallCost = (type: BallType): Decimal =>
  new Decimal(BALL_TYPES[type].baseCost)
    .mul(new Decimal(COST_MULTIPLIER).pow(MAX_BALLS))
    .ceil();

/** Keeps a hydrated cost inside the range the purchase curve can produce. */
const clampBallCost = (type: BallType, value: unknown): Decimal => {
  const minimum = new Decimal(BALL_TYPES[type].baseCost);
  const parsed = parseDecimal(value, minimum);
  const maximum = getMaxBallCost(type);

  if (parsed.lt(minimum)) return minimum;
  return parsed.gt(maximum) ? maximum : parsed;
};

/**
 * Returns the default costs for all upgrades.
 * @returns {Record<keyof Upgrades, Decimal>} A map of upgrades to their initial costs.
 */
const UPGRADE_BASE_COSTS: Record<keyof Upgrades, number> = {
  speed: 50,
  damage: 75,
  coinMult: 100,
};

const getDefaultUpgradeCosts = (): Record<keyof Upgrades, Decimal> => ({
  speed: new Decimal(UPGRADE_BASE_COSTS.speed),
  damage: new Decimal(UPGRADE_BASE_COSTS.damage),
  coinMult: new Decimal(UPGRADE_BASE_COSTS.coinMult),
});

/** Costs are derived from level, so a curve change applies to existing saves. */
const calculateUpgradeCost = (type: keyof Upgrades, level: number): Decimal => {
  const base = new Decimal(UPGRADE_BASE_COSTS[type]);
  // Large levels come from crafted saves; a per-level loop would freeze load.
  if (level > 100) return base.mul(new Decimal(UPGRADE_COST_MULTIPLIER).pow(level)).ceil();
  let cost = base;
  for (let i = 0; i < level; i++) cost = cost.mul(UPGRADE_COST_MULTIPLIER).ceil();
  return cost;
};

export interface MaxUpgradePlan {
  /** Number of levels the current coins can buy. */
  levels: number;
  /** Total coins spent by those levels. */
  totalCost: Decimal;
  /** Coins left afterwards. */
  remainingCoins: Decimal;
  /** Cost of the next level after the purchase. */
  nextCost: Decimal;
}

/** Plans a "Max" purchase without mutating state. */
export const planMaxUpgrade = (
  type: keyof Upgrades,
  level: number,
  cost: Decimal,
  coins: Decimal
): MaxUpgradePlan => {
  let remainingCoins = coins;
  let currentLevel = level;
  let currentCost = cost;
  let totalCost = new Decimal(0);
  let levels = 0;

  // Crafted saves can contain a zero/negative cost; never grant free levels.
  if (cost.lte(0)) {
    return { levels: 0, totalCost, remainingCoins, nextCost: cost };
  }

  while (
    remainingCoins.gte(currentCost) &&
    (type !== 'speed' || currentLevel < MAX_SPEED_UPGRADE)
  ) {
    remainingCoins = remainingCoins.sub(currentCost);
    totalCost = totalCost.add(currentCost);
    currentLevel++;
    currentCost = calculateUpgradeCost(type, currentLevel);
    levels++;
  }

  return { levels, totalCost, remainingCoins, nextCost: currentCost };
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isStorageLike = (value: unknown): value is StorageLike => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<StorageLike>;
  return (
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function'
  );
};

const getLocalStorage = (): StorageLike | undefined => {
  if (typeof window !== 'undefined') {
    try {
      const storage = window.localStorage;
      if (isStorageLike(storage)) return storage;
    } catch {
      // Access can throw in private mode or when storage is disabled.
    }
  }

  try {
    const maybeLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
    if (isStorageLike(maybeLocalStorage)) {
      return maybeLocalStorage;
    }
  } catch {
    // Ignore access failures on the global fallback.
  }

  return undefined;
};

/**
 * Migrates a raw save object to the current schema.
 * - v0 (unversioned) -> v1: promotes schema version while keeping fields.
 * - v1 -> v2: adds optional versioned board snapshot (legacy saves omit board
 *   so BoardSimulation generates a fresh board on load).
 */
const migrateSaveData = (raw: Record<string, unknown>, fromVersion: number): SaveData => {
  let migrated: Record<string, unknown> = { ...raw };
  if (fromVersion < 1) {
    migrated = { ...migrated, version: 1 };
  }
  if (fromVersion < 2) {
    migrated = { ...migrated, version: SAVE_VERSION };
  }
  return { ...(migrated as SaveData), version: SAVE_VERSION };
};

/**
 * Validates the save envelope and migrates old versions to the current shape.
 * Returns null for non-objects and future versions so callers can reject them
 * instead of hydrating an unknown format.
 */
const normalizeSaveData = (raw: unknown): SaveData | null => {
  if (!isRecord(raw)) return null;

  const version = toSaveVersion(raw.version);
  if (version > SAVE_VERSION) return null;

  return migrateSaveData(raw, version);
};

/**
 * Parses save data and reconstructs the game state.
 * @param saveData - The raw JSON object from storage.
 * @param canvasWidth - Current canvas width.
 * @param canvasHeight - Current canvas height.
 * @returns {Partial<GameStore>} The partial state to merge.
 */
const parseSaveData = (saveData: SaveData, canvasWidth: number, canvasHeight: number) => {
  // Recreate balls, ignoring invalid values from malformed saves.
  const savedBallTypes = Array.isArray(saveData.balls)
    ? saveData.balls.filter(isValidBallType)
    : [];
  const defaultBallTypes: BallType[] = ['basic'];
  const ballTypes = savedBallTypes.length > 0 ? savedBallTypes.slice(0, MAX_BALLS) : defaultBallTypes;
  const balls: BallData[] = ballTypes.map((type) => {
    return createBall(type, canvasWidth, canvasHeight);
  });

  const ballCosts = getDefaultBallCosts();
  if (isRecord(saveData.ballCosts)) {
    for (const [key, value] of Object.entries(saveData.ballCosts)) {
      if (isValidBallType(key)) {
        ballCosts[key] = clampBallCost(key, value);
      }
    }
  }

  const savedUpgrades: Record<string, unknown> = isRecord(saveData.upgrades)
    ? saveData.upgrades
    : {};
  // Parse once: costs must use the same clamped level the game will use.
  const upgrades = {
    speed: parseInteger(savedUpgrades.speed, 0, MAX_SPEED_UPGRADE),
    damage: parseInteger(savedUpgrades.damage),
    coinMult: parseInteger(savedUpgrades.coinMult),
  };
  const upgradeCosts = getDefaultUpgradeCosts();
  for (const key of Object.keys(upgradeCosts) as (keyof Upgrades)[]) {
    upgradeCosts[key] = calculateUpgradeCost(key, upgrades[key]);
  }

  // Validate the unlocked-achievements map. Older saves will not have this
  // field, in which case we start with an empty map.
  const unlockedAchievements: UnlockedAchievements = {};
  if (isRecord(saveData.unlockedAchievements)) {
    for (const [id, ts] of Object.entries(saveData.unlockedAchievements)) {
      if (typeof id === 'string' && Number.isFinite(ts)) {
        unlockedAchievements[id] = Number(ts);
      }
    }
  }

  const parsedBoard = parseSavedBoard(
    saveData.board,
    canvasWidth,
    canvasHeight,
    nextBoardSeed()
  );

  return {
    coins: parseDecimal(saveData.coins),
    bricksBroken: parseDecimal(saveData.bricksBroken),
    totalBricksBroken: parseDecimal(saveData.totalBricksBroken),
    prestigeLevel: parseInteger(saveData.prestigeLevel, 0, MAX_PRESTIGE_LEVEL),
    upgrades,
    ballCosts,
    upgradeCosts,
    currentTier: parseInteger(saveData.currentTier, 1, MAX_TIER),
    balls: balls.length > 0 ? balls : [createBall('basic', canvasWidth, canvasHeight)],
    bricks: parsedBoard.bricks,
    boardSeed: parsedBoard.boardSeed,
    unlockedAchievements,
    timestamp: parseTimestamp(saveData.timestamp),
  };
};

/**
 * The main Zustand store hook for managing game state.
 * Uses `subscribeWithSelector` middleware for reactive updates.
 */
export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    coins: new Decimal(STARTING_COINS),
    bricksBroken: new Decimal(0),
    totalBricksBroken: new Decimal(0),
    prestigeLevel: 0,
    upgrades: { speed: 0, damage: 0, coinMult: 0 },
    ballCosts: getDefaultBallCosts(),
    upgradeCosts: getDefaultUpgradeCosts(),
    currentTier: 1,
    balls: [],
    bricks: [],
    explosions: [],
    canvasSize: { width: 800, height: 500 },
    isPaused: false,
    pendingOfflineMessage: null,
    pendingSaveError: null,
    unlockedAchievements: getEmptyUnlocks(),
    pendingAchievementUnlocks: [],
    boardSeed: nextBoardSeed(),
    timestamp: Date.now(),

    setCanvasSize: (width, height) => {
      set({ canvasSize: { width, height } });
      // Initialize first ball if none exist
      const state = get();
      if (state.balls.length === 0) {
        set({ balls: [createBall('basic', width, height)] });
      }
    },

    addCoins: (amount) => {
      const state = get();
      const prestigeBonus = getPrestigeMultiplier(state.prestigeLevel);
      const creditedCoins = amount.mul(prestigeBonus);
      const newCoins = state.coins.add(creditedCoins);
      set({ coins: newCoins });
      recordIncome(creditedCoins);
      // Only play the "coin" sound for small, non-coin-spam additions
      // (bricks award 1–10 coins, prestige awards large sums, etc.)
      if (amount.gt(0) && amount.lt(1000)) {
        playSound('coin');
      }
    },

    applyIdleEarnings: (seconds, liveIncomePerSecond) => {
      const state = get();
      const liveRate = liveIncomePerSecond ?? state.getIncomePerSecond();
      const { coins, message } = calculateOfflineEarnings(liveRate, seconds);
      set({
        coins: state.coins.add(coins),
        pendingOfflineMessage: message,
        timestamp: Date.now(),
      });
    },

    incrementBricksBroken: () => {
      const state = get();
      set({
        bricksBroken: state.bricksBroken.add(1),
        totalBricksBroken: state.totalBricksBroken.add(1),
      });

      // Check if we need to increase tier
      const newTier = Math.min(MAX_TIER, 1 + state.bricksBroken.add(1).div(100).floor().toNumber());
      if (newTier > state.currentTier) {
        set({ currentTier: newTier });
      }

      get().checkAchievements();
    },

    applyBoardRewards: (batch) => {
      const state = get();
      const rawCoins = batch.coins ?? ZERO_DECIMAL;
      const hasCoins = rawCoins.gt(0) && isFiniteDecimal(rawCoins);
      let nextCoins = state.coins;
      if (hasCoins) {
        const prestigeBonus = getPrestigeMultiplier(state.prestigeLevel);
        const creditedCoins = rawCoins.mul(prestigeBonus);
        nextCoins = state.coins.add(creditedCoins);
        recordIncome(creditedCoins);
        if (rawCoins.lt(1000)) {
          playSound('coin');
        }
      }

      const brokenDelta =
        batch.bricksBroken instanceof Decimal
          ? batch.bricksBroken
          : new Decimal(batch.bricksBroken ?? 0);
      const hasBroken = brokenDelta.gt(0) && isFiniteDecimal(brokenDelta);
      const nextBricksBroken = hasBroken ? state.bricksBroken.add(brokenDelta) : state.bricksBroken;
      const nextTotalBricksBroken = hasBroken
        ? state.totalBricksBroken.add(brokenDelta)
        : state.totalBricksBroken;
      const nextTier = hasBroken
        ? Math.max(
            state.currentTier,
            Math.min(MAX_TIER, 1 + nextBricksBroken.div(100).floor().toNumber())
          )
        : state.currentTier;

      const nextBalls = batch.board ? batch.board.balls : state.balls;

      let nextUnlocked = state.unlockedAchievements;
      let nextPendingUnlocks = state.pendingAchievementUnlocks;
      if (hasCoins || hasBroken || batch.board) {
        const achievementState: AchievementGameState = {
          totalBricksBroken: nextTotalBricksBroken,
          bricksBroken: nextBricksBroken,
          coins: nextCoins,
          prestigeLevel: state.prestigeLevel,
          currentTier: nextTier,
          balls: nextBalls,
          upgrades: state.upgrades,
        };
        const newlyUnlocked = evaluateAchievements(achievementState, state.unlockedAchievements);
        if (newlyUnlocked.length > 0) {
          const unlockedAt = Date.now();
          nextUnlocked = { ...state.unlockedAchievements };
          for (const id of newlyUnlocked) {
            nextUnlocked[id] = unlockedAt;
          }
          nextPendingUnlocks = [...state.pendingAchievementUnlocks, ...newlyUnlocked];
        }
      }

      const patch: Partial<GameStore> = {};
      if (hasCoins) patch.coins = nextCoins;
      if (hasBroken) {
        patch.bricksBroken = nextBricksBroken;
        patch.totalBricksBroken = nextTotalBricksBroken;
        if (nextTier !== state.currentTier) {
          patch.currentTier = nextTier;
        }
      }
      if (nextUnlocked !== state.unlockedAchievements) {
        patch.unlockedAchievements = nextUnlocked;
        patch.pendingAchievementUnlocks = nextPendingUnlocks;
      }
      if (batch.board) {
        patch.balls = batch.board.balls;
        patch.bricks = batch.board.bricks;
        patch.explosions = batch.board.explosions;
        if (typeof batch.board.seed === 'number' && batch.board.seed !== state.boardSeed) {
          patch.boardSeed = batch.board.seed;
        }
      }

      if (Object.keys(patch).length > 0) {
        set(patch);
      }
    },

    buyBall: (type) => {
      const state = get();
      if (state.balls.length >= MAX_BALLS) return false;

      const cost = state.ballCosts[type];

      if (state.coins.gte(cost)) {
        const { width, height } = state.canvasSize;
        const newBall = createBall(type, width, height);

        set({
          coins: state.coins.sub(cost),
          balls: [...state.balls, newBall],
          ballCosts: {
            ...state.ballCosts,
            [type]: cost.mul(COST_MULTIPLIER).ceil(),
          },
        });
        playSound('purchase');
        get().checkAchievements();
        return true;
      }
      return false;
    },

    buyUpgrade: (type) => {
      const state = get();
      if (type === 'speed' && state.upgrades.speed >= MAX_SPEED_UPGRADE) return false;

      const cost = state.upgradeCosts[type];

      if (state.coins.gte(cost)) {
        set({
          coins: state.coins.sub(cost),
          upgrades: {
            ...state.upgrades,
            [type]: state.upgrades[type] + 1,
          },
          upgradeCosts: {
            ...state.upgradeCosts,
            [type]: calculateUpgradeCost(type, state.upgrades[type] + 1),
          },
        });
        playSound('purchase');
        get().checkAchievements();
        return true;
      }
      return false;
    },

    buyMaxUpgrade: (type) => {
      const state = get();
      if (type === 'speed' && state.upgrades.speed >= MAX_SPEED_UPGRADE) return 0;

      const plan = planMaxUpgrade(
        type,
        state.upgrades[type],
        state.upgradeCosts[type],
        state.coins
      );

      if (plan.levels > 0) {
        set({
          coins: plan.remainingCoins,
          upgrades: {
            ...state.upgrades,
            [type]: state.upgrades[type] + plan.levels,
          },
          upgradeCosts: {
            ...state.upgradeCosts,
            [type]: plan.nextCost,
          },
        });
        get().checkAchievements();
      }
      return plan.levels;
    },

    canPrestige: () => {
      const state = get();
      return state.bricksBroken.gte(PRESTIGE_THRESHOLD);
    },

    prestige: () => {
      flushActiveBoard();
      const state = get();
      if (!get().canPrestige()) return false;
      if (state.prestigeLevel >= MAX_PRESTIGE_LEVEL) return false;

      const { width, height } = state.canvasSize;
      discardActiveBoard();

      set({
        prestigeLevel: state.prestigeLevel + 1,
        // A fresh run starts empty; kept upgrades and the multiplier already
        // make income higher than a new game's 35 starting coins.
        coins: new Decimal(0),
        bricksBroken: new Decimal(0),
        currentTier: 1,
        // Upgrades and their costs are permanent; only the ball board resets.
        ballCosts: getDefaultBallCosts(),
        balls: [createBall('basic', width, height)],
        bricks: [],
        explosions: [],
        boardSeed: nextBoardSeed(),
        timestamp: Date.now(),
      });

      playSound('prestige');
      resetIncomeTracking();
      get().checkAchievements();
      return true;
    },

    setBricks: (bricks) => set({ bricks }),

    removeBrick: (id) => {
      const state = get();
      set({ bricks: state.bricks.filter((b) => b.id !== id) });
    },

    applyBrickDamageBatch: (operations) => {
      const state = get();
      const nextState = resolveBrickDamageBatch(state.bricks, operations, performance.now());
      if (nextState.results.length > 0) {
        set({ bricks: nextState.bricks });
      }
      return nextState.results;
    },

    damageBrick: (id, damage) => {
      const [result] = get().applyBrickDamageBatch([{ id, damage }]);
      if (!result) return null;

      // Play a hit sound on every successful contact and a shatter on destroy.
      playSound('ballBounce');
      if (result.destroyed) {
        playSound('brickBreak');
      }

      return {
        destroyed: result.destroyed,
        value: result.value,
      };
    },

    addExplosion: (x, y, radius) => {
      const state = get();
      set({
        explosions: [
          ...state.explosions,
          { x, y, radius, life: 300, maxLife: 300 },
        ],
      });
    },

    updateExplosions: (deltaTime) => {
      const state = get();
      const nextExplosions: Explosion[] = [];

      for (const explosion of state.explosions) {
        const nextLife = explosion.life - deltaTime;
        if (nextLife > 0) {
          nextExplosions.push({ ...explosion, life: nextLife });
        }
      }

      set({ explosions: nextExplosions });
    },

    save: () => {
      flushActiveBoard();
      const storage = getLocalStorage();
      const state = get();

      if (!storage) {
        if (typeof window !== 'undefined' && !state.pendingSaveError) {
          set({ pendingSaveError: SAVE_UNAVAILABLE_MESSAGE });
        }
        return false;
      }

      try {
        storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(buildSaveData(state)));
        if (state.pendingSaveError) set({ pendingSaveError: null });
        return true;
      } catch (error) {
        console.error('Failed to save game:', error);
        if (!state.pendingSaveError) set({ pendingSaveError: SAVE_FAILED_MESSAGE });
        return false;
      }
    },

    exportSave: () => {
      flushActiveBoard();
      const state = get();
      return JSON.stringify(buildSaveData(state));
    },

    importSave: (data: string) => {
      try {
        const parsed: unknown = JSON.parse(data);
        if (!isRecord(parsed)) return false;

        // Imports must carry the core fields; partial legacy saves are only
        // accepted through the load path.
        if (typeof parsed.coins === 'undefined' || typeof parsed.prestigeLevel === 'undefined') {
          return false;
        }

        const saveData = normalizeSaveData(parsed);
        if (!saveData) return false;

        const state = get();
        const { width, height } = state.canvasSize;
        const partialState = parseSaveData(saveData, width, height);
        discardActiveBoard();

        set({
          ...partialState,
          explosions: [],
          // Importing replaces the in-memory state entirely, so we discard
          // any queued toasts from the previous run.
          pendingAchievementUnlocks: [],
          pendingSaveError: null,
        });

        resetIncomeTracking();
        return true;
      } catch (e) {
        console.error('Failed to import save:', e);
        return false;
      }
    },

    load: () => {
      resetIncomeTracking();
      const storage = getLocalStorage();
      if (!storage) return;

      let saveStr: string | null;
      try {
        saveStr = storage.getItem(SAVE_STORAGE_KEY);
      } catch (error) {
        console.error('Failed to read save:', error);
        return;
      }
      if (!saveStr) return;

      try {
        const parsed: unknown = JSON.parse(saveStr);
        const saveData = normalizeSaveData(parsed);
        if (!saveData) {
          console.error('Unsupported or invalid save data');
          set({ pendingSaveError: SAVE_UNREADABLE_MESSAGE });
          return;
        }

        const state = get();
        const { width, height } = state.canvasSize;

        const partialState = parseSaveData(saveData, width, height);
        discardActiveBoard();

        // Remove timestamp from partialState before setting to conform to GameStore if necessary,
        // but now timestamp IS in GameStore interface.
        set({
          ...(partialState as Partial<GameStore>),
          explosions: [],
          // Loading a save replaces the in-memory state; clear any queued
          // toasts so we don't replay the previous session's unlocks.
          pendingAchievementUnlocks: [],
        });

        // Calculate offline progress
        const loadedTimestamp = partialState.timestamp;
        if (loadedTimestamp) {
          const offlineTime = Date.now() - loadedTimestamp;
          const seconds = offlineTime / 1000;

          if (seconds >= 60) {
            get().applyIdleEarnings(seconds);
          }
        }

        // Persist immediately so a repeated load (StrictMode, second owner)
        // cannot re-apply the same offline earnings.
        get().save();
      } catch (e) {
        console.error('Failed to load save:', e);
      }
    },

    reset: () => {
      discardActiveBoard();
      resetIncomeTracking();
      const storage = getLocalStorage();
      if (storage) {
        try {
          storage.removeItem(SAVE_STORAGE_KEY);
        } catch (error) {
          console.error('Failed to remove save:', error);
        }
      }
      const state = get();
      const { width, height } = state.canvasSize;

      set({
        coins: new Decimal(STARTING_COINS),
        bricksBroken: new Decimal(0),
        totalBricksBroken: new Decimal(0),
        prestigeLevel: 0,
        currentTier: 1,
        upgrades: { speed: 0, damage: 0, coinMult: 0 },
        ballCosts: getDefaultBallCosts(),
        upgradeCosts: getDefaultUpgradeCosts(),
        balls: [createBall('basic', width, height)],
        bricks: [],
        explosions: [],
        boardSeed: nextBoardSeed(),
        unlockedAchievements: getEmptyUnlocks(),
        pendingAchievementUnlocks: [],
        pendingSaveError: null,
        timestamp: Date.now(),
      });
    },

    setPaused: (paused) => {
      if (paused) {
        flushActiveBoard();
      }
      set({ isPaused: paused });
    },

    clearOfflineMessage: () => set({ pendingOfflineMessage: null }),

    checkAchievements: () => {
      const state = get();
      const achievementState: AchievementGameState = {
        totalBricksBroken: state.totalBricksBroken,
        bricksBroken: state.bricksBroken,
        coins: state.coins,
        prestigeLevel: state.prestigeLevel,
        currentTier: state.currentTier,
        balls: state.balls,
        upgrades: state.upgrades,
      };

      const newlyUnlocked = evaluateAchievements(
        achievementState,
        state.unlockedAchievements,
      );

      if (newlyUnlocked.length === 0) return [];

      const unlockedAt = Date.now();
      const nextUnlocked = { ...state.unlockedAchievements };
      for (const id of newlyUnlocked) {
        nextUnlocked[id] = unlockedAt;
      }

      set({
        unlockedAchievements: nextUnlocked,
        pendingAchievementUnlocks: [
          ...state.pendingAchievementUnlocks,
          ...newlyUnlocked,
        ],
      });

      return newlyUnlocked;
    },

    drainPendingAchievementUnlocks: (ids) => {
      const pending = get().pendingAchievementUnlocks;
      if (pending.length === 0) return;
      set({
        pendingAchievementUnlocks: ids
          ? pending.filter((id) => !ids.includes(id))
          : [],
      });
    },

    getDamageMult: () => {
      const state = get();
      // Prestige also strengthens balls, otherwise thresholds (bricks) would
      // outgrow the damage needed to break them.
      return (
        (1 + state.upgrades.damage * UPGRADE_MULTIPLIER) *
        getPrestigeMultiplier(state.prestigeLevel)
      );
    },

    getCoinMult: () => {
      const state = get();
      return 1 + state.upgrades.coinMult * UPGRADE_MULTIPLIER;
    },

    getSpeedMult: () => {
      const state = get();
      return 1 + state.upgrades.speed * UPGRADE_MULTIPLIER;
    },

    getIncomePerSecond: () => {
      const state = get();
      const measured = getMeasuredIncomePerSecond();
      if (measured.gt(0)) return measured;

      return calculateIncomePerSecond(
        state.balls,
        state.getSpeedMult(),
        state.getDamageMult(),
        state.getCoinMult(),
        state.prestigeLevel,
        state.currentTier
      ).mul(LIVE_INCOME_CALIBRATION);
    },
  }))
);
