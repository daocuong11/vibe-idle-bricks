import Decimal from 'break_infinity.js';

/**
 * Represents the available types of balls in the game.
 * Each type has unique properties and abilities.
 */
export type BallType = 'basic' | 'fast' | 'heavy' | 'plasma' | 'explosive' | 'sniper';

/**
 * Configuration for a specific ball type.
 * Defines the base stats and behavior of the ball.
 */
export interface BallTypeConfig {
  /** The movement speed of the ball. Higher is faster. */
  speed: number;
  /** The amount of damage the ball deals to a brick on impact. */
  damage: number;
  /** The color of the ball in hex format. */
  color: string;
  /** Whether the ball can pass through bricks without bouncing off. */
  pierce: boolean;
  /** Whether the ball creates an explosion on impact. */
  explosive: boolean;
  /** The radius of the explosion if the ball is explosive. */
  explosionRadius?: number;
  /** Whether the ball actively targets specific bricks (e.g., weakest). */
  targeting: boolean;
  /** The base cost to purchase the first ball of this type. */
  baseCost: number;
  /** A human-readable description of the ball's special ability. */
  description: string;
}

/**
 * Represents an instance of a ball in the game world.
 */
export interface BallData {
  /** Unique identifier for the ball. */
  id: string;
  /** The type of the ball (e.g., 'basic', 'fast'). */
  type: BallType;
  /** The current X coordinate of the ball. */
  x: number;
  /** The current Y coordinate of the ball. */
  y: number;
  /** The velocity vector's X component. */
  dx: number;
  /** The velocity vector's Y component. */
  dy: number;
}

/**
 * Represents a brick in the game world.
 */
/** Optional gameplay role for a brick. */
export type BrickKind = 'normal' | 'gold' | 'armored';

export interface BrickData {
  /** Unique identifier for the brick. */
  id: string;
  /** Gameplay role; missing legacy values are treated as normal. */
  kind?: BrickKind;
  /** The X coordinate of the top-left corner of the brick. */
  x: number;
  /** The Y coordinate of the top-left corner of the brick. */
  y: number;
  /** The width of the brick. */
  width: number;
  /** The height of the brick. */
  height: number;
  /** The tier of the brick, determining its color and difficulty. */
  tier: number;
  /** The current health of the brick. */
  health: Decimal;
  /** The maximum health of the brick. */
  maxHealth: Decimal;
  /** The coin value awarded when the brick is destroyed. */
  value: Decimal;
  /** Timestamp of the last time the brick was hit, for visual effects. */
  lastHitTime?: number;
}

/**
 * Tracks the levels of global upgrades purchased by the player.
 */
export interface Upgrades {
  /** Level of the global speed upgrade. */
  speed: number;
  /** Level of the global damage upgrade. */
  damage: number;
  /** Level of the coin multiplier upgrade. */
  coinMult: number;
}

/** Permanent progression nodes purchased with Blueprints after prestige. */
export type PrestigeUpgradeType = 'might' | 'fortune' | 'insight';

/** Levels of permanent prestige-tree nodes; there is no level cap. */
export interface PrestigeUpgrades {
  might: number;
  fortune: number;
  insight: number;
}

/** Static balance configuration for a permanent prestige-tree node. */
export interface PrestigeUpgradeConfig {
  name: string;
  description: string;
  baseCost: number;
}

export const PRESTIGE_UPGRADE_COST_MULTIPLIER = 1.6;
export const PRESTIGE_UPGRADE_EFFECT_MULTIPLIER = 1.1;
/** Hydration/UI guard against absurd crafted node levels. */
export const MAX_PRESTIGE_UPGRADE_LEVEL = 10_000;

export const PRESTIGE_UPGRADES: Record<PrestigeUpgradeType, PrestigeUpgradeConfig> = {
  might: {
    name: 'Might',
    description: '+10% damage per level',
    baseCost: 2,
  },
  fortune: {
    name: 'Fortune',
    description: '+10% live and simulated coins per level',
    baseCost: 2,
  },
  insight: {
    name: 'Insight',
    description: '+10% idle and offline coins per level',
    baseCost: 3,
  },
};

/** Creates the zero-level prestige tree. */
export const getDefaultPrestigeUpgrades = (): PrestigeUpgrades => ({
  might: 0,
  fortune: 0,
  insight: 0,
});

/** Cost of the next node level: ceil(baseCost × 1.6^level). */
export const getPrestigeUpgradeCost = (type: PrestigeUpgradeType, level: number): Decimal => {
  const safeLevel = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  return new Decimal(PRESTIGE_UPGRADES[type].baseCost)
    .mul(new Decimal(PRESTIGE_UPGRADE_COST_MULTIPLIER).pow(safeLevel))
    .ceil();
};

/** Permanent node effect: 1.1^level, uncapped. */
export const getPrestigeUpgradeMultiplier = (_type: PrestigeUpgradeType, level: number): Decimal => {
  const safeLevel = Number.isFinite(level)
    ? Math.min(MAX_PRESTIGE_UPGRADE_LEVEL, Math.max(0, Math.floor(level)))
    : 0;
  return new Decimal(PRESTIGE_UPGRADE_EFFECT_MULTIPLIER).pow(safeLevel);
};

/**
 * The core state of the game, managed by the store.
 */
export interface GameState {
  /** The current amount of coins the player possesses. */
  coins: Decimal;
  /** The number of bricks broken in the current prestige run. */
  bricksBroken: Decimal;
  /** The total number of bricks broken across all runs. */
  totalBricksBroken: Decimal;
  /** The current prestige level, which grants permanent bonuses. */
  prestigeLevel: number;
  /** Persistent prestige currency earned on prestige. */
  blueprints: Decimal;
  /** Permanent levels of the prestige tree. */
  prestigeUpgrades: PrestigeUpgrades;
  /** Total coins actually credited across all runs, excluding starting/imported balances. */
  lifetimeCoins: Decimal;
  /** Highest tier reached across all runs. */
  bestTier: number;
  /** Active play time in milliseconds, persisted on save. */
  playTimeMs: number;
  /** Current levels of purchased upgrades. */
  upgrades: Upgrades;
  /** Current cost to purchase the next ball of each type. */
  ballCosts: Record<BallType, Decimal>;
  /** Current cost to purchase the next level of each upgrade. */
  upgradeCosts: Record<keyof Upgrades, Decimal>;
  /** The current difficulty tier for newly spawned bricks. */
  currentTier: number;
  /** List of all active balls in the game. */
  balls: BallData[];
  /** Timestamp of the last save or update, used for offline earnings. */
  timestamp: number;
}

/**
 * Represents an active explosion effect in the game.
 */
export interface Explosion {
  /** The X coordinate of the explosion center. */
  x: number;
  /** The Y coordinate of the explosion center. */
  y: number;
  /** The maximum radius of the explosion effect. */
  radius: number;
  /** The remaining duration of the explosion in frames or time units. */
  life: number;
  /** The initial duration of the explosion. */
  maxLife: number;
}

/**
 * Serialized representation of a brick in persisted save data.
 */
export interface SavedBrickData {
  id: string;
  kind?: BrickKind;
  x: number;
  y: number;
  width: number;
  height: number;
  tier: number;
  health: string;
  maxHealth: string;
  value: string;
}

/**
 * Serialized representation of the board snapshot in persisted save data.
 */
export interface SavedBoardData {
  width: number;
  height: number;
  seed?: number;
  bricks: SavedBrickData[];
}

/**
 * Interface representing the structure of the game save data.
 */
export interface SaveData {
  coins?: string;
  bricksBroken?: string;
  totalBricksBroken?: string;
  prestigeLevel?: number;
  blueprints?: string;
  prestigeUpgrades?: Partial<PrestigeUpgrades>;
  lifetimeCoins?: string;
  bestTier?: number;
  playTimeMs?: number;
  upgrades?: Upgrades;
  ballCosts?: Record<string, string>;
  upgradeCosts?: Record<string, string>;
  currentTier?: number;
  balls?: BallType[];
  board?: SavedBoardData;
  unlockedAchievements?: Record<string, number>;
  timestamp?: number;
  version?: number;
}

/**
 * Static configuration for all ball types.
 * Defines the stats and abilities for each ball type.
 */
export const BALL_TYPES: Record<BallType, BallTypeConfig> = {
  basic: {
    speed: 3,
    damage: 1,
    color: '#9ca3af',
    pierce: false,
    explosive: false,
    targeting: false,
    baseCost: 10,
    description: 'Standard ball',
  },
  fast: {
    speed: 6,
    damage: 1,
    color: '#60a5fa',
    pierce: false,
    explosive: false,
    targeting: false,
    baseCost: 30,
    description: '2x speed',
  },
  heavy: {
    speed: 2.5,
    damage: 3,
    color: '#f97316',
    pierce: false,
    explosive: false,
    targeting: false,
    baseCost: 100,
    description: '3x damage',
  },
  plasma: {
    speed: 4,
    damage: 2,
    color: '#a855f7',
    pierce: true,
    explosive: false,
    targeting: false,
    baseCost: 500,
    description: 'Pierces through bricks',
  },
  explosive: {
    speed: 3,
    damage: 2,
    color: '#ef4444',
    pierce: false,
    explosive: true,
    explosionRadius: 70,
    targeting: false,
    baseCost: 1000,
    description: 'Damages nearby bricks',
  },
  sniper: {
    speed: 5,
    damage: 5,
    color: '#10b981',
    pierce: false,
    explosive: false,
    targeting: true,
    baseCost: 3500,
    description: 'Targets weakest bricks',
  },
};

/** Additive speed boost applied per level (10% per level). */
export const UPGRADE_MULTIPLIER = 0.1;
/** Multiplicative base applied per level for damage and coinMult upgrades (8% compounding). */
export const UPGRADE_MULT_BASE = 1.08;
/** Coins granted on a fresh game so the first purchase is minutes away. */
export const STARTING_COINS = 35;
/** Upgrade cost growth; value per coin still decays ~9%/level, but slower than balls. */
export const UPGRADE_COST_MULTIPLIER = 1.10;
/** Damage and coin income are multiplied by this for every prestige level. */
export const PRESTIGE_MULTIPLIER = 1.25;
/** The fraction of theoretical earnings awarded for offline time (50%). */
export const OFFLINE_EARNINGS_RATE = 0.5;
/** The base threshold for the first prestige. */
export const PRESTIGE_THRESHOLD = 10000;

/**
 * Calculates the multiplicative bonus for damage or coinMult upgrade levels.
 * @param level - The current upgrade level.
 * @returns {Decimal} The upgrade multiplier.
 */
export const getUpgradeMultiplier = (level: number): Decimal => {
  const safeLevel = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  return new Decimal(UPGRADE_MULT_BASE).pow(safeLevel);
};

/**
 * Calculates the permanent prestige multiplier for a prestige level.
 * Each level multiplies income and damage, compounding without cap.
 * @param prestigeLevel - The current prestige level.
 * @returns {Decimal} The current prestige multiplier.
 */
export const getPrestigeMultiplier = (prestigeLevel: number): Decimal => {
  const safeLevel = Number.isFinite(prestigeLevel) ? Math.max(0, Math.floor(prestigeLevel)) : 0;
  return new Decimal(PRESTIGE_MULTIPLIER).pow(safeLevel);
};

/**
 * Calculates the Blueprints awarded upon prestiging.
 * Returns 0 below PRESTIGE_THRESHOLD, and scales with sqrt(bricks / threshold)
 * and current tier (at least 1 Blueprint at threshold).
 */
export const calculateBlueprintsEarned = (
  bricksBroken: Decimal,
  currentTier: number
): Decimal => {
  const rendered = bricksBroken.toString();
  if (
    rendered === 'NaN' ||
    rendered === 'Infinity' ||
    rendered === '-Infinity' ||
    !bricksBroken.gte(PRESTIGE_THRESHOLD)
  ) {
    return new Decimal(0);
  }
  const safeTier = Number.isFinite(currentTier) ? Math.max(0, Math.floor(currentTier)) : 1;
  return bricksBroken
    .div(PRESTIGE_THRESHOLD)
    .sqrt()
    .mul(1 + safeTier * 0.05)
    .floor()
    .max(1);
};

/**
 * Calculates the progression tier reached for a given run's bricksBroken count.
 * Advances 1 tier per 100 bricks without a hard tier cap.
 */
export const calculateTierForBricks = (bricksBroken: Decimal): number => {
  const rendered = bricksBroken.toString();
  if (rendered === 'NaN' || rendered === 'Infinity' || rendered === '-Infinity' || bricksBroken.lt(0)) {
    return 1;
  }
  const tier = bricksBroken.div(100).floor().add(1);
  if (tier.gte(Number.MAX_SAFE_INTEGER)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(1, tier.toNumber());
};

/** Maximum number of balls allowed in the game to prevent performance issues. */
export const MAX_BALLS = 100;

/** Maximum level for the speed upgrade to prevent physics tunneling. */
export const MAX_SPEED_UPGRADE = 50;

/** Cost scaling multiplier when purchasing balls. */
export const COST_MULTIPLIER = 1.15;

const TIER_WALL_START = 20;
const BASE_HEALTH_TIER_20 = new Decimal(3 * (1 + 0.25 * (TIER_WALL_START - 1)));
const BASE_VALUE_TIER_20 = new Decimal(Math.floor(Math.pow(TIER_WALL_START, 1.6)));

/**
 * Calculates brick health and value based on tier using unbounded Decimal math.
 * Tiers 1-20 use a gentle early curve; tiers > 20 scale exponentially where
 * health (1.18^(tier-20)) outpaces value (1.12^(tier-20)) to reward upgrades & prestige.
 */
export const calculateBrickStats = (tier: number): { maxHealth: Decimal; value: Decimal } => {
  const safeTier = Number.isFinite(tier) ? Math.max(1, Math.floor(tier)) : 1;
  if (safeTier <= TIER_WALL_START) {
    const maxHealth = new Decimal(3 * (1 + 0.25 * (safeTier - 1)));
    const value = new Decimal(Math.floor(Math.pow(safeTier, 1.6)));
    return { maxHealth, value };
  }

  const excessTiers = safeTier - TIER_WALL_START;
  const maxHealth = BASE_HEALTH_TIER_20.mul(new Decimal(1.18).pow(excessTiers));
  const value = BASE_VALUE_TIER_20.mul(new Decimal(1.12).pow(excessTiers)).floor();
  return { maxHealth, value };
};
