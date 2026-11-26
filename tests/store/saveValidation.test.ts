import { describe, it, expect, beforeEach, vi } from 'vitest';
import Decimal from 'break_infinity.js';
import { useGameStore, SAVE_VERSION } from '../../src/store/gameStore';
import {
  BALL_TYPES,
  getPrestigeMultiplier,
} from '../../src/types/game';

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
    _setStore: (next: Record<string, string>) => {
      store = next;
    },
  };
};

const localStorageMock = createLocalStorageMock();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

const resetStore = () => {
  useGameStore.setState({
    coins: new Decimal(0),
    bricksBroken: new Decimal(0),
    totalBricksBroken: new Decimal(0),
    prestigeLevel: 0,
    blueprints: new Decimal(0),
    upgrades: { speed: 0, damage: 0, coinMult: 0 },
    ballCosts: {
      basic: new Decimal(BALL_TYPES.basic.baseCost),
      fast: new Decimal(BALL_TYPES.fast.baseCost),
      heavy: new Decimal(BALL_TYPES.heavy.baseCost),
      plasma: new Decimal(BALL_TYPES.plasma.baseCost),
      explosive: new Decimal(BALL_TYPES.explosive.baseCost),
      sniper: new Decimal(BALL_TYPES.sniper.baseCost),
    },
    upgradeCosts: {
      speed: new Decimal(50),
      damage: new Decimal(75),
      coinMult: new Decimal(100),
    },
    currentTier: 1,
    balls: [],
    bricks: [],
    explosions: [],
    isPaused: false,
    pendingOfflineMessage: null,
    pendingSaveError: null,
    pendingAchievementUnlocks: [],
    timestamp: Date.now(),
  });
};

const importSave = (data: unknown) =>
  useGameStore.getState().importSave(JSON.stringify(data));

describe('save validation and migration', () => {
  beforeEach(() => {
    resetStore();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('sanitizes NaN and Infinity balances instead of soft-locking the game', () => {
    expect(importSave({ coins: 'NaN', prestigeLevel: 0, balls: ['basic'] })).toBe(true);
    expect(useGameStore.getState().coins.toString()).toBe('0');

    expect(importSave({ coins: 'Infinity', prestigeLevel: 0, balls: ['basic'] })).toBe(true);
    expect(useGameStore.getState().coins.toString()).toBe('0');

    expect(importSave({ coins: '-50', prestigeLevel: 0, balls: ['basic'] })).toBe(true);
    expect(useGameStore.getState().coins.toString()).toBe('0');
  });

  it('clamps negative ball costs to the base price instead of minting coins', () => {
    expect(
      importSave({
        coins: 100,
        prestigeLevel: 0,
        ballCosts: { basic: -100 },
        balls: ['basic'],
      }),
    ).toBe(true);

    const state = useGameStore.getState();
    expect(state.ballCosts.basic.eq(BALL_TYPES.basic.baseCost)).toBe(true);
    expect(state.buyBall('basic')).toBe(true);
    expect(useGameStore.getState().coins.eq(90)).toBe(true);
    expect(useGameStore.getState().ballCosts.basic.eq(12)).toBe(true);
  });

  it('clamps ball costs above the reachable purchase curve', () => {
    expect(
      importSave({
        coins: 0,
        prestigeLevel: 0,
        ballCosts: { basic: '1e100' },
        balls: ['basic'],
      }),
    ).toBe(true);

    const cost = useGameStore.getState().ballCosts.basic;
    expect(cost.gte(BALL_TYPES.basic.baseCost)).toBe(true);
    expect(cost.lt(new Decimal('1e100'))).toBe(true);
  });

  it('preserves high prestige levels with finite Decimal multipliers and rejects unsafe integers', () => {
    expect(
      importSave({ coins: '0', prestigeLevel: 1500, balls: ['basic'] }),
    ).toBe(true);

    const state = useGameStore.getState();
    expect(state.prestigeLevel).toBe(1500);
    const mult = getPrestigeMultiplier(state.prestigeLevel);
    expect(mult.gt('1e140')).toBe(true);
    expect(mult.toString()).not.toBe('Infinity');

    expect(
      importSave({ coins: '0', prestigeLevel: 1e20, balls: ['basic'] }),
    ).toBe(true);
    expect(useGameStore.getState().prestigeLevel).toBe(0);

    expect(
      importSave({ coins: '0', prestigeLevel: -5, balls: ['basic'] }),
    ).toBe(true);
    expect(useGameStore.getState().prestigeLevel).toBe(0);
  });

  it('preserves high tiers without cap and rejects unsafe or negative tiers', () => {
    expect(
      importSave({ coins: '0', prestigeLevel: 0, currentTier: 250, balls: ['basic'] }),
    ).toBe(true);
    expect(useGameStore.getState().currentTier).toBe(250);

    expect(
      importSave({ coins: '0', prestigeLevel: 0, currentTier: 1e20, balls: ['basic'] }),
    ).toBe(true);
    expect(useGameStore.getState().currentTier).toBe(1);

    expect(
      importSave({ coins: '0', prestigeLevel: 0, currentTier: -3, balls: ['basic'] }),
    ).toBe(true);
    expect(useGameStore.getState().currentTier).toBe(1);
  });

  it('validates blueprints as finite non-negative Decimal', () => {
    expect(
      importSave({
        version: SAVE_VERSION,
        coins: '0',
        prestigeLevel: 1,
        blueprints: '1.5e25',
        balls: ['basic'],
      }),
    ).toBe(true);
    expect(useGameStore.getState().blueprints.eq('1.5e25')).toBe(true);

    for (const bad of ['NaN', 'Infinity', '-10', 'not-a-number']) {
      expect(
        importSave({
          version: SAVE_VERSION,
          coins: '0',
          prestigeLevel: 1,
          blueprints: bad,
          balls: ['basic'],
        }),
      ).toBe(true);
      expect(useGameStore.getState().blueprints.eq(0)).toBe(true);
    }
  });

  it('rejects a future save version without mutating state', () => {
    useGameStore.setState({ coins: new Decimal(42) });

    const result = importSave({
      coins: '0',
      prestigeLevel: 0,
      balls: ['basic'],
      version: SAVE_VERSION + 1,
    });

    expect(result).toBe(false);
    expect(useGameStore.getState().coins.eq(42)).toBe(true);
  });

  it('writes the current version into local saves', () => {
    expect(useGameStore.getState().save()).toBe(true);

    const saved = JSON.parse(localStorageMock.getItem('idleBricksSave') as string);
    expect(saved.version).toBe(SAVE_VERSION);
  });

  it('migrates an unversioned legacy save and persists it as version 1', () => {
    localStorageMock._setStore({
      idleBricksSave: JSON.stringify({
        coins: '123',
        bricksBroken: '4',
        totalBricksBroken: '9',
        prestigeLevel: 0,
        upgrades: { speed: 1, damage: 0, coinMult: 0 },
        ballCosts: { basic: '10' },
        currentTier: 1,
        balls: ['basic'],
        timestamp: Date.now(),
      }),
    });

    useGameStore.getState().load();

    expect(useGameStore.getState().coins.eq(123)).toBe(true);
    expect(useGameStore.getState().upgrades.speed).toBe(1);

    const persisted = JSON.parse(localStorageMock.getItem('idleBricksSave') as string);
    expect(persisted.version).toBe(SAVE_VERSION);
  });

  it('does not load a future save version', () => {
    useGameStore.setState({ coins: new Decimal(7) });
    localStorageMock._setStore({
      idleBricksSave: JSON.stringify({
        coins: '999',
        prestigeLevel: 0,
        balls: ['basic'],
        version: SAVE_VERSION + 1,
        timestamp: Date.now(),
      }),
    });

    useGameStore.getState().load();

    expect(useGameStore.getState().coins.eq(7)).toBe(true);
    expect(useGameStore.getState().pendingSaveError).toBeTruthy();
  });

  it('survives a storage write failure and clears the error after a successful save', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });

    let result = true;
    expect(() => {
      result = useGameStore.getState().save();
    }).not.toThrow();
    expect(result).toBe(false);
    expect(useGameStore.getState().pendingSaveError).toBeTruthy();

    expect(useGameStore.getState().save()).toBe(true);
    expect(useGameStore.getState().pendingSaveError).toBeNull();
  });

  it('survives a storage read failure', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });

    expect(() => useGameStore.getState().load()).not.toThrow();
  });
});
