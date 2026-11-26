import { useEffect, useRef } from 'react';
import type Decimal from 'break_infinity.js';
import { useGameStore } from '../store/gameStore';

const MIN_IDLE_MS = 60 * 1000;

/** Saves at tab close/background and grants idle progress after a short absence. */
export function useLifecyclePersistence(): void {
  const hiddenAtRef = useRef<number | null>(null);
  // The 60 s tracker is pruned while hidden, so snapshot the rate at hide time.
  const hiddenRateRef = useRef<Decimal | null>(null);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const state = useGameStore.getState();
        hiddenAtRef.current = Date.now();
        hiddenRateRef.current = state.getIncomePerSecond();
        state.save();
        return;
      }

      const hiddenAt = hiddenAtRef.current;
      const hiddenRate = hiddenRateRef.current;
      hiddenAtRef.current = null;
      hiddenRateRef.current = null;
      if (hiddenAt === null) return;

      const elapsedMs = Date.now() - hiddenAt;
      if (elapsedMs < MIN_IDLE_MS) return;

      const state = useGameStore.getState();
      state.applyIdleEarnings(elapsedMs / 1000, hiddenRate ?? undefined);
      state.save();
    };

    const onPageHide = () => useGameStore.getState().save();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);
}
