import { useEffect, useRef } from 'react';
import { useGameStore } from '../store';
import { RUN_GOALS_BY_ID } from '../types/game';
import { useToast } from '../components/Toast';

/** Shows one toast per newly-claimed run goal and drains the queue. */
export function useRunGoalToasts(): void {
  const pending = useGameStore((state) => state.pendingRunGoalUnlocks);
  const drain = useGameStore((state) => state.drainPendingRunGoalUnlocks);
  const { showToast } = useToast();
  const handledRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (pending.length === 0) return;
    if (handledRef.current === pending) return;
    handledRef.current = pending;

    for (const id of pending) {
      const def = RUN_GOALS_BY_ID[id];
      if (!def) continue;
      showToast(
        `🎯 Run goal: ${def.name} (+ ${def.rewardBlueprints} Blueprints)`,
        'success'
      );
    }
    drain(pending);
  }, [pending, showToast, drain]);
}
