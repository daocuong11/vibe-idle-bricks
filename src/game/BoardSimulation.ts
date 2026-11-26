import { useGameStore } from '../store';
import type { BrickData } from '../types';
import { formatNumber } from '../utils';
import { playSound } from '../utils/audio';
import { BrickManager } from './BrickManager';
import { INITIAL_BRICKS_TO_GENERATE, MIN_BRICKS_ON_SCREEN } from './constants';
import {
  advanceBoardWorld,
  applyBoardClickDamage,
  createBoardWorld,
  findBrickAt,
  refreshBoardWorld,
  takeBoardEvents,
  type BoardEvent,
  type BoardWorld,
  type RandomSource,
} from './model';

export type BoardRenderState = Pick<BoardWorld, 'balls' | 'bricks' | 'explosions'>;

export interface BoardEffects {
  showFloatingText(x: number, y: number, text: string, kind: 'damage' | 'coin'): void;
  emitBrickBreakParticles(brick: BrickData, count: number): void;
  shakeExplosion(): void;
}

/** Platform adapter: synchronizes the store and turns core events into effects. */
export class BoardSimulation {
  private readonly effects: BoardEffects;
  private readonly brickManager: BrickManager;
  private world: BoardWorld;
  // References last published or adopted from an external store update.
  private publishedBalls: BoardRenderState['balls'] | null = null;
  private publishedBricks: BoardRenderState['bricks'] | null = null;
  private publishedExplosions: BoardRenderState['explosions'] | null = null;
  private lastPublishedAt = 0;

  constructor(
    size: { width: number; height: number },
    effects: BoardEffects,
    random?: RandomSource
  ) {
    this.effects = effects;
    this.brickManager = new BrickManager(size, random);
    const store = useGameStore.getState();
    store.setCanvasSize(size.width, size.height);
    const bricks = this.brickManager.generateBricks(INITIAL_BRICKS_TO_GENERATE, store.currentTier);
    store.setBricks(bricks);
    this.world = this.createWorld();
    this.publishBoard(true);
  }

  private createWorld(): BoardWorld {
    const store = useGameStore.getState();
    return createBoardWorld({
      width: store.canvasSize.width,
      height: store.canvasSize.height,
      balls: store.balls,
      bricks: store.bricks,
      explosions: store.explosions,
      speedMultiplier: store.getSpeedMult(),
      damageMultiplier: store.getDamageMult(),
      coinMultiplier: store.getCoinMult(),
      time: performance.now(),
    });
  }

  private syncWorld(): void {
    const store = useGameStore.getState();
    this.world.width = store.canvasSize.width;
    this.world.height = store.canvasSize.height;
    this.world.speedMultiplier = store.getSpeedMult();
    this.world.damageMultiplier = store.getDamageMult();
    this.world.coinMultiplier = store.getCoinMult();

    // Adopt each array independently: a ball purchase must not restore stale
    // bricks that the live world has already damaged or refilled.
    let adopted = false;
    if (this.publishedBalls !== store.balls) {
      this.world.balls = store.balls;
      this.publishedBalls = store.balls;
      adopted = true;
    }
    if (this.publishedBricks !== store.bricks) {
      this.world.bricks = store.bricks;
      this.publishedBricks = store.bricks;
      adopted = true;
    }
    if (this.publishedExplosions !== store.explosions) {
      this.world.explosions = store.explosions;
      this.publishedExplosions = store.explosions;
      adopted = true;
    }
    if (adopted) refreshBoardWorld(this.world);
  }

  getRenderState(): BoardRenderState {
    return { balls: this.world.balls, bricks: this.world.bricks, explosions: this.world.explosions };
  }

  private publishBoard(force = false): void {
    this.syncWorld();
    const now = performance.now();
    if (!force && now - this.lastPublishedAt < 100) return;

    const board = this.getRenderState();
    this.publishedBalls = board.balls;
    this.publishedBricks = board.bricks;
    this.publishedExplosions = board.explosions;
    this.lastPublishedAt = now;
    useGameStore.setState(board);
  }

  resize(width: number, height: number) {
    this.brickManager.resize(width, height);
    useGameStore.getState().setCanvasSize(width, height);
    this.publishBoard(true);
  }

  step(delta: number) {
    if (useGameStore.getState().isPaused) return;

    this.syncWorld();
    const frameDelta = advanceBoardWorld(this.world, delta, performance.now());
    this.applyEvents(takeBoardEvents(this.world), frameDelta);

    const store = useGameStore.getState();
    const refillTarget = Math.min(MIN_BRICKS_ON_SCREEN, this.brickManager.getCapacity());
    if (this.world.bricks.length < refillTarget) {
      const newBricks = this.brickManager.addBricksToFillScreen(this.world.bricks, store.currentTier);
      if (newBricks.length > 0) {
        this.world.bricks = [...this.world.bricks, ...newBricks];
      }
    }

    refreshBoardWorld(this.world);
    this.publishBoard();
    return frameDelta;
  }

  private applyEvents(events: BoardEvent[], frameDelta: number = 0) {
    for (const event of events) {
      if (event.type === 'brickDamaged') {
        if (event.source !== 'explosion') playSound('ballBounce');
        if (event.showDamageText) {
          this.effects.showFloatingText(
            event.brick.x + event.brick.width / 2,
            event.brick.y,
            `-${formatNumber(event.damage)}`,
            'damage'
          );
        }
        continue;
      }

      if (event.type === 'brickDestroyed') {
        if (event.source !== 'explosion') playSound('brickBreak');
        const store = useGameStore.getState();
        store.addCoins(event.coins);
        store.incrementBricksBroken();
        this.effects.emitBrickBreakParticles(event.brick, event.particleCount);
        if (event.showCoinText) {
          this.effects.showFloatingText(
            event.brick.x + event.brick.width / 2,
            event.brick.y,
            `+${formatNumber(event.coins)}¢`,
            'coin'
          );
        }
        continue;
      }

      if (event.type === 'explosion') {
        this.world.explosions = [
          ...this.world.explosions,
          { x: event.x, y: event.y, radius: event.radius, life: 300 - frameDelta, maxLife: 300 },
        ];
      } else {
        this.effects.shakeExplosion();
      }
    }
  }

  findBrickAt(x: number, y: number): BrickData | undefined {
    return findBrickAt(this.world, x, y);
  }

  handleBrickClick(x: number, y: number) {
    this.syncWorld();
    if (applyBoardClickDamage(this.world, x, y)) {
      this.applyEvents(takeBoardEvents(this.world));
      refreshBoardWorld(this.world);
    }
    this.publishBoard(true);
  }
}
