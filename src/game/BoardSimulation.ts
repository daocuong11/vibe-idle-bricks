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
    this.world.balls = store.balls;
    this.world.bricks = store.bricks;
    this.world.explosions = store.explosions;
    this.world.speedMultiplier = store.getSpeedMult();
    this.world.damageMultiplier = store.getDamageMult();
    this.world.coinMultiplier = store.getCoinMult();
    refreshBoardWorld(this.world);
  }

  resize(width: number, height: number) {
    this.brickManager.resize(width, height);
    useGameStore.getState().setCanvasSize(width, height);
    this.syncWorld();
  }

  step(delta: number) {
    if (useGameStore.getState().isPaused) return;

    this.syncWorld();
    const frameDelta = advanceBoardWorld(this.world, delta, performance.now());
    useGameStore.setState({
      balls: this.world.balls,
      bricks: this.world.bricks,
      explosions: this.world.explosions,
    });
    this.applyEvents(takeBoardEvents(this.world), frameDelta);

    const store = useGameStore.getState();
    const refillTarget = Math.min(MIN_BRICKS_ON_SCREEN, this.brickManager.getCapacity());
    if (store.bricks.length < refillTarget) {
      const newBricks = this.brickManager.addBricksToFillScreen(store.bricks, store.currentTier);
      if (newBricks.length > 0) {
        store.setBricks([...store.bricks, ...newBricks]);
      }
    }

    this.syncWorld();
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
        useGameStore.setState((state) => ({
          explosions: [
            ...state.explosions,
            { x: event.x, y: event.y, radius: event.radius, life: 300 - frameDelta, maxLife: 300 },
          ],
        }));
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
    if (!applyBoardClickDamage(this.world, x, y)) return;

    useGameStore.setState({ bricks: this.world.bricks });
    this.applyEvents(takeBoardEvents(this.world));
    refreshBoardWorld(this.world);
  }
}
