import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider } from '../../src/components/Toast';
import { useRunGoalToasts } from '../../src/hooks/useRunGoalToasts';
import { useGameStore } from '../../src/store/gameStore';

function Harness() {
  useRunGoalToasts();
  return null;
}

describe('useRunGoalToasts', () => {
  it('shows and drains a newly claimed run goal', () => {
    useGameStore.setState({ pendingRunGoalUnlocks: [] });
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    act(() => {
      useGameStore.setState({ pendingRunGoalUnlocks: ['run_100'] });
    });

    expect(screen.getByText(/Warm-up/)).toBeInTheDocument();
    expect(screen.getByText(/1 Blueprints/)).toBeInTheDocument();
    expect(useGameStore.getState().pendingRunGoalUnlocks).toEqual([]);
  });
});
