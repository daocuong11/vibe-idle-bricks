import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import Decimal from 'break_infinity.js';
import { useAutoBuy } from '../../src/hooks/useAutoBuy';
import { useGameStore } from '../../src/store/gameStore';
import { useSettingsStore } from '../../src/store/settingsStore';

describe('useAutoBuy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettingsStore.setState({ autoBuyEnabled: true });
    useGameStore.getState().reset();
    useGameStore.setState({
      coins: new Decimal(1000),
      upgrades: { speed: 0, damage: 0, coinMult: 0 },
      upgradeCosts: {
        speed: new Decimal(50),
        damage: new Decimal(75),
        coinMult: new Decimal(100),
      },
      balls: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useSettingsStore.setState({ autoBuyEnabled: false });
    useGameStore.getState().reset();
  });

  it('ticks once per second while enabled and stops on unmount', () => {
    const { unmount } = renderHook(() => useAutoBuy());
    vi.advanceTimersByTime(1000);
    expect(useGameStore.getState().upgrades.speed).toBe(1);
    unmount();
    vi.advanceTimersByTime(3000);
    expect(useGameStore.getState().upgrades.speed).toBe(1);
  });
});
