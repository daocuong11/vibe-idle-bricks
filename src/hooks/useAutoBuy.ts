import { useEffect } from 'react';
import { useGameStore, useSettingsStore } from '../store';

/** Runs the opt-in auto-buy loop once per second while enabled. */
export function useAutoBuy(): void {
  const autoBuyEnabled = useSettingsStore((state) => state.autoBuyEnabled);

  useEffect(() => {
    if (!autoBuyEnabled) return;
    const timer = setInterval(() => {
      useGameStore.getState().autoBuyTick();
    }, 1000);
    return () => clearInterval(timer);
  }, [autoBuyEnabled]);
}
