import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HowToPlay } from '../../src/components/HowToPlay';

describe('HowToPlay', () => {
  it('advertises click damage and focus in the always-visible summary', () => {
    render(<HowToPlay />);
    const summary = screen.getByText(/How to play/);
    expect(summary.closest('summary')).not.toBeNull();
    expect(summary).toHaveTextContent(/Click a brick to chip it/);
  });

  it('lists the controls and is collapsed by default', () => {
    const { container } = render(<HowToPlay />);
    const details = container.querySelector('details');
    expect(details?.open).toBe(false);
    expect(screen.getByText(/Space/)).toBeInTheDocument();
    expect(screen.getByText(/Esc/)).toBeInTheDocument();
    expect(screen.getByText(/10.00K bricks/)).toBeInTheDocument();
  });
});
