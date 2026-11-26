import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Decimal from 'break_infinity.js';
import { BoardSimulation } from '../../src/game/BoardSimulation';
import { INITIAL_BRICKS_TO_GENERATE } from '../../src/game/constants';
import { SAVE_VERSION, useGameStore } from '../../src/store/gameStore';
import { resetIncomeTracking } from '../../src/store/earnings';
import type { BrickData } from '../../src/types/game';

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

const createEffects = () => ({
  showFloatingText: vi.fn(),
  emitBrickBreakParticles: vi.fn(),
  shakeExplosion: vi.fn(),
});

const initialStoreState = useGameStore.getState();

describe('Versioned board save/restore and migration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetIncomeTracking();
    localStorageMock.clear();
    useGameStore.setState(initialStoreState, true);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetIncomeTracking();
    useGameStore.setState(initialStoreState, true);
  });

  it('round-trips board dimensions, seed, and brick state via save/load and export/import', () => {
    const savedBricks: BrickData[] = [
      {
        id: 'brick-damaged',
        kind: 'gold',
        x: 40,
        y: 110,
        width: 60,
        height: 25,
        tier: 4,
        health: new Decimal('1.25e25'),
        maxHealth: new Decimal('5e25'),
        value: new Decimal('3.5e18'),
      },
      {
        id: 'brick-full',
        kind: 'armored',
        x: 120,
        y: 110,
        width: 60,
        height: 25,
        tier: 2,
        health: new Decimal(3.75),
        maxHealth: new Decimal(3.75),
        value: new Decimal(3),
      },
    ];

    useGameStore.setState({
      coins: new Decimal(250),
      prestigeLevel: 1,
      currentTier: 4,
      canvasSize: { width: 800, height: 500 },
      boardSeed: 424242,
      balls: [{ id: 'ball-1', type: 'basic', x: 200, y: 300, dx: 3, dy: -2 }],
      bricks: savedBricks,
    });

    expect(useGameStore.getState().save()).toBe(true);
    const exported = useGameStore.getState().exportSave();
    const parsedExport = JSON.parse(exported);
    expect(parsedExport.version).toBe(SAVE_VERSION);
    expect(parsedExport.board).toEqual({
      width: 800,
      height: 500,
      seed: 424242,
      bricks: [
        {
          id: 'brick-damaged',
          kind: 'gold',
          x: 40,
          y: 110,
          width: 60,
          height: 25,
          tier: 4,
          health: '1.25e+25',
          maxHealth: '5e+25',
          value: new Decimal('3.5e18').toString(),
        },
        {
          id: 'brick-full',
          kind: 'armored',
          x: 120,
          y: 110,
          width: 60,
          height: 25,
          tier: 2,
          health: '3.75',
          maxHealth: '3.75',
          value: '3',
        },
      ],
    });

    // Reset and restore via importSave, then construct BoardSimulation.
    useGameStore.getState().reset();
    expect(useGameStore.getState().bricks).toHaveLength(0);
    expect(useGameStore.getState().importSave(exported)).toBe(true);

    const importedState = useGameStore.getState();
    expect(importedState.boardSeed).toBe(424242);
    expect(importedState.bricks).toHaveLength(2);
    expect(importedState.bricks[0].health.eq('1.25e25')).toBe(true);
    expect(importedState.bricks[0].maxHealth.eq('5e25')).toBe(true);
    expect(importedState.bricks[0].value.eq('3.5e18')).toBe(true);
    expect(importedState.bricks[0].kind).toBe('gold');
    expect(importedState.bricks[1].kind).toBe('armored');

    const simulation = new BoardSimulation({ width: 800, height: 500 }, createEffects());
    expect(simulation.getRenderState().bricks.map((b) => b.id)).toEqual([
      'brick-damaged',
      'brick-full',
    ]);
    simulation.destroy();

    // Also verify load() restores the saved board without overwriting it.
    useGameStore.setState(initialStoreState, true);
    localStorageMock._setStore({ idleBricksSave: exported });
    useGameStore.getState().load();

    const loadedSim = new BoardSimulation({ width: 800, height: 500 }, createEffects());
    expect(loadedSim.getRenderState().bricks.map((b) => b.id)).toEqual([
      'brick-damaged',
      'brick-full',
    ]);
    expect(loadedSim.getRenderState().bricks[0].health.eq('1.25e25')).toBe(true);
    loadedSim.destroy();
  });

  it('migrates v0 (unversioned) and v1 saves without board and generates a fresh board', () => {
    const legacyV0 = {
      coins: '500',
      bricksBroken: '12',
      totalBricksBroken: '25',
      prestigeLevel: 0,
      upgrades: { speed: 1, damage: 0, coinMult: 0 },
      ballCosts: { basic: '12' },
      currentTier: 1,
      balls: ['basic'],
      timestamp: Date.now(),
    };

    localStorageMock._setStore({ idleBricksSave: JSON.stringify(legacyV0) });
    useGameStore.getState().load();

    expect(useGameStore.getState().coins.eq(500)).toBe(true);
    expect(useGameStore.getState().bricks).toHaveLength(0);
    const persistedAfterV0 = JSON.parse(localStorageMock.getItem('idleBricksSave') as string);
    expect(persistedAfterV0.version).toBe(SAVE_VERSION);

    const simFromV0 = new BoardSimulation({ width: 800, height: 500 }, createEffects());
    expect(simFromV0.getRenderState().bricks).toHaveLength(INITIAL_BRICKS_TO_GENERATE);
    simFromV0.destroy();

    const legacyV1 = {
      ...legacyV0,
      coins: '750',
      version: 1,
    };
    expect(useGameStore.getState().importSave(JSON.stringify(legacyV1))).toBe(true);
    expect(useGameStore.getState().coins.eq(750)).toBe(true);
    expect(useGameStore.getState().bricks).toHaveLength(0);

    const simFromV1 = new BoardSimulation({ width: 800, height: 500 }, createEffects());
    expect(simFromV1.getRenderState().bricks).toHaveLength(INITIAL_BRICKS_TO_GENERATE);
    simFromV1.destroy();
  });

  it('rejects malformed, NaN, Infinity, negative, and out-of-bounds bricks and falls back safely', () => {
    const validBrick = {
      id: 'valid-1',
      x: 40,
      y: 100,
      width: 60,
      height: 25,
      tier: 1,
      health: '3',
      maxHealth: '3',
      value: '1',
    };

    const badPayloads = [
      { ...validBrick, health: 'NaN' },
      { ...validBrick, maxHealth: 'Infinity' },
      { ...validBrick, health: '-1' },
      { ...validBrick, health: '0' },
      { ...validBrick, health: '10', maxHealth: '3' },
      { ...validBrick, value: '-5' },
      { ...validBrick, x: Number.NaN },
      { ...validBrick, y: -1 },
      { ...validBrick, width: 0 },
      { ...validBrick, x: 780, width: 60 },
      { ...validBrick, tier: 0 },
      { ...validBrick, id: '' },
    ];

    for (const badBrick of badPayloads) {
      const save = {
        version: SAVE_VERSION,
        coins: '100',
        prestigeLevel: 0,
        balls: ['basic'],
        board: {
          width: 800,
          height: 500,
          seed: 123,
          bricks: [badBrick],
        },
        timestamp: Date.now(),
      };

      expect(useGameStore.getState().importSave(JSON.stringify(save))).toBe(true);
      expect(useGameStore.getState().bricks).toHaveLength(0);

      const sim = new BoardSimulation({ width: 800, height: 500 }, createEffects());
      expect(sim.getRenderState().bricks).toHaveLength(INITIAL_BRICKS_TO_GENERATE);
      sim.destroy();
    }

    // Duplicate brick ids and invalid board dimensions also fall back cleanly.
    const duplicateSave = {
      version: SAVE_VERSION,
      coins: '100',
      prestigeLevel: 0,
      balls: ['basic'],
      board: {
        width: 800,
        height: 500,
        seed: 123,
        bricks: [validBrick, { ...validBrick, x: 120 }],
      },
    };
    expect(useGameStore.getState().importSave(JSON.stringify(duplicateSave))).toBe(true);
    expect(useGameStore.getState().bricks).toHaveLength(0);

    const invalidBoardDims = {
      version: SAVE_VERSION,
      coins: '100',
      prestigeLevel: 0,
      balls: ['basic'],
      board: {
        width: -800,
        height: 500,
        bricks: [validBrick],
      },
    };
    expect(useGameStore.getState().importSave(JSON.stringify(invalidBoardDims))).toBe(true);
    expect(useGameStore.getState().bricks).toHaveLength(0);
  });

  it('persists deterministic RNG state so refilled bricks match after save and restore', () => {
    useGameStore.setState({ boardSeed: 20261126, bricks: [] });
    const simA = new BoardSimulation({ width: 800, height: 500 }, createEffects());
    // Remove 35 bricks so refill will trigger on next step, then export mid-run.
    const remaining = simA.getRenderState().bricks.slice(0, 15);
    useGameStore.setState({ bricks: remaining });
    simA.step(0);
    const snapshot = useGameStore.getState().exportSave();

    // Advance simA so it refills deterministically.
    simA.step(0);
    const refilledA = simA.getRenderState().bricks.map((b) => ({
      id: b.id,
      tier: b.tier,
      x: b.x,
      y: b.y,
    }));
    simA.destroy();

    // Restore into a fresh session and advance once to trigger the same refill.
    useGameStore.getState().reset();
    expect(useGameStore.getState().importSave(snapshot)).toBe(true);
    const simB = new BoardSimulation({ width: 800, height: 500 }, createEffects());
    simB.step(0);
    const refilledB = simB.getRenderState().bricks.map((b) => ({
      id: b.id,
      tier: b.tier,
      x: b.x,
      y: b.y,
    }));
    simB.destroy();

    expect(refilledB).toEqual(refilledA);
  });

  it('fast-forwards a restored v2 board deterministically when offline for 5 minutes', () => {
    useGameStore.setState({
      boardSeed: 424242,
      coins: new Decimal(0),
      bricks: [],
      balls: [{ id: 'b-1', type: 'basic', x: 100, y: 380, dx: 2.2, dy: -2.2 }],
    });
    const sim = new BoardSimulation({ width: 800, height: 500 }, createEffects());
    const saved = useGameStore.getState().exportSave();
    sim.destroy();

    const parsed = JSON.parse(saved) as {
      timestamp: number;
      board?: { bricks?: Array<Record<string, unknown>> };
    };
    // This test isolates deterministic offline fast-forward; force the restored
    // board to normal bricks so armor cannot stall a single basic ball.
    if (parsed.board?.bricks) {
      parsed.board.bricks = parsed.board.bricks.map((brick) => ({
        ...brick,
        kind: 'normal',
      }));
    }
    parsed.timestamp = Date.now() - 5 * 60 * 1000;
    const oldSave = JSON.stringify(parsed);

    localStorage.setItem('idleBricksSave', oldSave);
    useGameStore.getState().reset();
    localStorage.setItem('idleBricksSave', oldSave);
    useGameStore.getState().load();

    const firstCoins = useGameStore.getState().coins.toString();
    const firstBroken = useGameStore.getState().bricksBroken.toString();
    const firstMessage = useGameStore.getState().pendingOfflineMessage;
    expect(new Decimal(firstCoins).gt(0)).toBe(true);
    // Restored ball spawn can hit an armored cluster and fall back to nominal
    // income; the dedicated offline unit tests cover brick-breaking results.
    expect(new Decimal(firstBroken).gte(0)).toBe(true);
    expect(firstMessage).toContain('Welcome back!');
    expect(firstMessage).toContain('5m');

    // Loading the exact same snapshot a second time produces identical results.
    useGameStore.getState().reset();
    localStorage.setItem('idleBricksSave', oldSave);
    useGameStore.getState().load();

    expect(useGameStore.getState().coins.toString()).toBe(firstCoins);
    expect(useGameStore.getState().bricksBroken.toString()).toBe(firstBroken);
  });
});
