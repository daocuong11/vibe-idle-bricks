import { Trophy } from 'lucide-react';
import { useGameStore } from '../store';
import { formatNumber } from '../utils';
import { Modal } from './Modal';

interface RecordsModalProps {
  open: boolean;
  onClose: () => void;
}

const formatPlayTime = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

/** Read-only lifetime records, separate from the prestige shop and achievements. */
export function RecordsModal({ open, onClose }: RecordsModalProps) {
  const lifetimeCoins = useGameStore((state) => state.lifetimeCoins);
  const totalBricksBroken = useGameStore((state) => state.totalBricksBroken);
  const bestTier = useGameStore((state) => state.bestTier);
  const currentTier = useGameStore((state) => state.currentTier);
  const bricksBroken = useGameStore((state) => state.bricksBroken);
  const prestigeLevel = useGameStore((state) => state.prestigeLevel);
  const blueprints = useGameStore((state) => state.blueprints);
  const playTimeMs = useGameStore((state) => state.playTimeMs);

  return (
    <Modal
      open={open}
      title="Records"
      confirmLabel="Done"
      cancelLabel={null}
      initialFocus="confirm"
      onConfirm={onClose}
      onCancel={onClose}
    >
      <dl className="records-list">
        <div><dt>Lifetime coins</dt><dd data-testid="records-lifetime-coins">{formatNumber(lifetimeCoins)}</dd></div>
        <div><dt>Total bricks broken</dt><dd data-testid="records-total-bricks">{formatNumber(totalBricksBroken)}</dd></div>
        <div><dt>Best tier</dt><dd data-testid="records-best-tier">{bestTier}</dd></div>
        <div><dt>Current tier</dt><dd data-testid="records-current-tier">{currentTier}</dd></div>
        <div><dt>Bricks this run</dt><dd data-testid="records-run-bricks">{formatNumber(bricksBroken)}</dd></div>
        <div><dt>Prestiges</dt><dd data-testid="records-prestiges">{prestigeLevel}</dd></div>
        <div><dt>Blueprints</dt><dd data-testid="records-blueprints">{formatNumber(blueprints)}</dd></div>
        <div><dt>Time played</dt><dd data-testid="records-play-time">{formatPlayTime(playTimeMs)}</dd></div>
      </dl>
      <p className="records-note">
        <Trophy size={16} aria-hidden="true" /> Records update as you play and are saved with your game.
      </p>
    </Modal>
  );
}
