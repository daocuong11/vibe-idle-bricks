import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Decimal from 'break_infinity.js';
import { RecordsModal } from '../../src/components/RecordsModal';
import { useGameStore } from '../../src/store/gameStore';

describe('RecordsModal', () => {
  it('displays lifetime and current-run records and closes with Done', async () => {
    const onClose = vi.fn();
    useGameStore.setState({
      lifetimeCoins: new Decimal('1e12'),
      totalBricksBroken: new Decimal(50000),
      bestTier: 12,
      currentTier: 3,
      bricksBroken: new Decimal(250),
      prestigeLevel: 4,
      blueprints: new Decimal(17),
      playTimeMs: 3_723_000,
    });
    const user = userEvent.setup();

    render(<RecordsModal open onClose={onClose} />);

    expect(screen.getByTestId('records-lifetime-coins')).toBeInTheDocument();
    expect(screen.getByTestId('records-total-bricks')).toBeInTheDocument();
    expect(screen.getByTestId('records-best-tier')).toHaveTextContent('12');
    expect(screen.getByTestId('records-current-tier')).toHaveTextContent('3');
    expect(screen.getByTestId('records-run-bricks')).toHaveTextContent('250');
    expect(screen.getByTestId('records-prestiges')).toHaveTextContent('4');
    expect(screen.getByTestId('records-blueprints')).toHaveTextContent('17');
    expect(screen.getByTestId('records-play-time')).toHaveTextContent('1h 2m');

    await user.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
