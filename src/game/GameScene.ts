import * as Phaser from 'phaser';
import { useGameStore } from '../store';
import { BoardSimulation } from './BoardSimulation';
import { GameEffects } from './GameEffects';
import { BallRenderer, BrickRenderer } from './GameRenderers';
import { ARENA_FLOOR_HEIGHT, getSpawnZoneHeight } from './constants';

export class GameScene extends Phaser.Scene {
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private simulation!: BoardSimulation;
  private ballRenderer!: BallRenderer;
  private brickRenderer!: BrickRenderer;
  private effects!: GameEffects;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  /**
   * Initializes the scene, sets up graphics, inputs, and the game loop.
   * Called once when the scene starts.
   */
  create() {
    this.backgroundGraphics = this.add.graphics();
    this.drawBackground();
    this.ballRenderer = new BallRenderer(this);
    this.brickRenderer = new BrickRenderer(this);
    this.effects = new GameEffects(this);
    this.effects.initialize();
    this.simulation = new BoardSimulation(this.cameras.main, this.effects);

    this.time.addEvent({
      delay: 30000,
      callback: () => useGameStore.getState().save(),
      loop: true,
    });

    this.scale.on('resize', this.handleResize, this);
    this.handleResize(this.scale.gameSize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.simulation.handleBrickClick(pointer.x, pointer.y);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.game.canvas.style.cursor = this.simulation.findBrickAt(pointer.x, pointer.y) ? 'pointer' : 'default';
    });
    this.input.on('gameout', () => {
      this.game.canvas.style.cursor = 'default';
    });
  }

  /**
   * Handles the window resize event to update canvas size in the store.
   */
  handleResize(gameSize: Phaser.Structs.Size) {
    // Debounce resize to avoid recreating BallPhysics and redrawing on every pixel of drag.
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      // The scene may have been destroyed while the debounce was pending.
      if (!this.cameras?.main) return;
      const { width, height } = gameSize;
      this.simulation.resize(width, height);
      this.drawBackground();
    }, 100);
  }

  /**
   * Draws the background grid and background color.
   */
  drawBackground() {
    const camera = this.cameras?.main;
    if (!camera || !this.backgroundGraphics) return;
    const { width, height } = camera;
    this.backgroundGraphics.clear();

    this.backgroundGraphics.fillStyle(0x0f0f1a);
    this.backgroundGraphics.fillRect(0, 0, width, height);

    this.backgroundGraphics.lineStyle(1, 0xffffff, 0.03);

    for (let x = 0; x < width; x += 50) {
      this.backgroundGraphics.beginPath();
      this.backgroundGraphics.moveTo(x, 0);
      this.backgroundGraphics.lineTo(x, height);
      this.backgroundGraphics.strokePath();
    }

    for (let y = 0; y < height; y += 50) {
      this.backgroundGraphics.beginPath();
      this.backgroundGraphics.moveTo(0, y);
      this.backgroundGraphics.lineTo(width, y);
      this.backgroundGraphics.strokePath();
    }

    // Frame the arena so the lower half reads as play space, not empty canvas.
    const floorY = height - ARENA_FLOOR_HEIGHT;
    this.backgroundGraphics.fillStyle(0x1e293b, 0.9);
    this.backgroundGraphics.fillRect(0, floorY, width, ARENA_FLOOR_HEIGHT);
    this.backgroundGraphics.lineStyle(2, 0x38bdf8, 0.45);
    this.backgroundGraphics.lineBetween(0, floorY, width, floorY);

    this.backgroundGraphics.lineStyle(2, 0x38bdf8, 0.12);
    this.backgroundGraphics.lineBetween(1, 0, 1, floorY);
    this.backgroundGraphics.lineBetween(width - 1, 0, width - 1, floorY);

    // Launch zone: gives the otherwise empty lower half a purpose.
    const spawnZoneHeight = getSpawnZoneHeight(height);
    const spawnY = floorY - spawnZoneHeight;
    this.backgroundGraphics.fillStyle(0x38bdf8, 0.06);
    this.backgroundGraphics.fillRect(0, spawnY, width, spawnZoneHeight);
    this.backgroundGraphics.lineStyle(1, 0x38bdf8, 0.25);
    for (let x = 8; x < width; x += 20) {
      this.backgroundGraphics.lineBetween(x, spawnY, Math.min(x + 12, width), spawnY);
    }
    this.backgroundGraphics.lineStyle(2, 0x38bdf8, 0.2);
    for (let i = 1; i <= 3; i++) {
      this.backgroundGraphics.strokeCircle((width * i) / 4, spawnY + spawnZoneHeight / 2, 7);
    }
  }

  update(_time: number, delta: number) {
    const frameDelta = this.simulation.step(delta);
    if (frameDelta === undefined) return;
    const state = this.simulation.getRenderState();
    this.ballRenderer.render(state.balls);
    this.brickRenderer.render(state.bricks);
    this.effects.renderExplosions(state.explosions);
    this.effects.updateFloatingTexts(frameDelta);
  }

  /**
   * Cleanup when the scene is shut down.
   */
  shutdown() {
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }

    this.scale.off('resize', this.handleResize, this);
    this.ballRenderer?.destroy();
    this.brickRenderer?.destroy();
    this.effects?.destroy();
    useGameStore.getState().save();
  }
}
