import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import { GameScene } from '../game/GameScene';

class Dpr2GameScene extends GameScene {
  constructor() {
    super({ pixelRatio: 1760 / 800, logicalWidth: 800, logicalHeight: 500 });
  }
}

const dpr2GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0f0f1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1760,
    height: 1100,
  },
  scene: [Dpr2GameScene],
};

/** DPR-2 Phaser spike: 1760x1100 backing store for an 800x500 logical board. */
export function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && !gameRef.current) {
      const game = new Phaser.Game({ ...dpr2GameConfig, parent: containerRef.current });
      game.canvas.setAttribute('role', 'img');
      game.canvas.setAttribute('aria-label', 'Brick game board');
      game.canvas.setAttribute('aria-describedby', 'game-instructions');
      gameRef.current = game;
    }
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="game-canvas"
      role="group"
      aria-label="Brick game board"
      aria-describedby="game-instructions"
    />
  );
}
