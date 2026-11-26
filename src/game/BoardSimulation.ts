import Decimal from 'break_infinity.js';
import { registerBoardSyncHandlers, useGameStore } from '../store';
import {
  BALL_TYPES,
  calculateTierForBricks,
  type BallLevels,
  type BallType,
  type BrickData,
} from '../types';
import { formatNumber } from '../utils';
import { playSound } from '../utils/audio';
import { BrickManager } from './BrickManager';
import { INITIAL_BRICKS_TO_GENERATE, MIN_BRICKS_ON_SCREEN } from './constants';
import {
  advanceBoardWorld,
  applyBoardClickDamage,
  createBoardWorld,
  createSeededRandom,
  findBrickAt,
  refreshBoardWorld,
  takeBoardEvents,
  type BoardEvent,
  type BoardWorld,
  type RandomSource,
  type SeededRandomSource,
} from './model';

const ZERO_DECIMAL = new Decimal(0);

const hasSeedState = (source: RandomSource): source is SeededRandomSource =>
  typeof (source as Partial<SeededRandomSource>).getState === 'function' &&
  typeof (source as Partial<SeededRandomSource>).setState === 'function';

export type BoardRenderState = Pick<
  BoardWorld,
  'balls' | 'bricks' | 'explosions' | 'priorityBrickId'
>;

export interface BoardEffects {
  showFloatingText(x: number, y: number, text: string, kind: 'damage' | 'coin'): void;
  emitBrickBreakParticles(brick: BrickData, count: number): void;
  shakeExplosion(): void;
}

const buildBallMultipliers = (
  store: ReturnType<typeof useGameStore.getState>
): {
  damage: Partial<Record<BallType, Decimal>>;
  speed: Partial<Record<BallType, Decimal>>;
} => {
  const damage: Partial<Record<BallType, Decimal>> = {};
  const speed: Partial<Record<BallType, Decimal>> = {};
  for (const type of Object.keys(BALL_TYPES) as BallType[]) {
    damage[type] = store.getBallDamageMult(type);
    speed[type] = store.getBallSpeedMult(type);
  }
  return { damage, speed };
};

/** Platform adapter: synchronizes the store and turns core events into effects. */
export class BoardSimulation {
  private readonly effects: BoardEffects;
  private readonly brickManager: BrickManager;
  private readonly randomSource: RandomSource;
  private readonly hasExternalRandom: boolean;
  private readonly unregisterSyncHandlers: () => void;
  private world: BoardWorld;
  // References last published or adopted from an external store update.
  private publishedBalls: BoardRenderState['balls'] | null = null;
  private publishedBricks: BoardRenderState['bricks'] | null = null;
  private publishedExplosions: BoardRenderState['explosions'] | null = null;
  private publishedSeed: number | undefined;
  private lastPublishedAt = 0;
  private pendingCoins: Decimal = ZERO_DECIMAL;
  private pendingBricksBroken = 0;
  private boardDirty = false;
  private syncedBallLevels: BallLevels | null = null;

  constructor(
    size: { width: number; height: number },
    effects: BoardEffects,
    random?: RandomSource
  ) {
    this.effects = effects;
    this.hasExternalRandom = random !== undefined;
    const initialStore = useGameStore.getState();
    this.randomSource = random ?? createSeededRandom(initialStore.boardSeed);
    this.brickManager = new BrickManager(size, this.randomSource);
    initialStore.setCanvasSize(size.width, size.height);

    const store = useGameStore.getState();
    const restoredBricks = store.bricks.filter(
      (brick) =>
        brick.x >= 0 &&
        brick.y >= 0 &&
        brick.width > 0 &&
        brick.height > 0 &&
        brick.x + brick.width <= size.width &&
        brick.y + brick.height <= size.height &&
        brick.health.gt(0)
    );
    const initialBricks =
      restoredBricks.length > 0
        ? restoredBricks
        : this.brickManager.generateBricks(INITIAL_BRICKS_TO_GENERATE, store.currentTier);

    this.publishedBalls = store.balls;
    this.publishedBricks = store.bricks;
    this.publishedExplosions = store.explosions;
    this.publishedSeed = store.boardSeed;

    const ballMultipliers = buildBallMultipliers(store);
    this.syncedBallLevels = store.ballLevels;
    this.world = createBoardWorld({
      width: store.canvasSize.width,
      height: store.canvasSize.height,
      balls: store.balls,
      bricks: initialBricks,
      explosions: store.explosions,
      speedMultiplier: store.getSpeedMult(),
      damageMultiplier: store.getDamageMult(),
      coinMultiplier: store.getCoinMult(),
      ballDamageMultipliers: ballMultipliers.damage,
      ballSpeedMultipliers: ballMultipliers.speed,
      time: performance.now(),
    });

    this.boardDirty = true;
    this.unregisterSyncHandlers = registerBoardSyncHandlers({
      flush: () => this.flush(),
      discard: () => this.discardPendingRewards(),
    });
    this.publishBoard(true);
  }

  private syncWorld(): void {
    const store = useGameStore.getState();
    this.world.width = store.canvasSize.width;
    this.world.height = store.canvasSize.height;
    this.world.speedMultiplier = store.getSpeedMult();
    this.world.damageMultiplier = store.getDamageMult();
    this.world.coinMultiplier = store.getCoinMult();
    if (this.syncedBallLevels !== store.ballLevels) {
      const ballMultipliers = buildBallMultipliers(store);
      this.world.ballDamageMultipliers = ballMultipliers.damage;
      this.world.ballSpeedMultipliers = ballMultipliers.speed;
      this.syncedBallLevels = store.ballLevels;
    }

    if (this.publishedSeed !== store.boardSeed) {
      if (!this.hasExternalRandom && hasSeedState(this.randomSource)) {
        this.randomSource.setState(store.boardSeed);
      }
      this.publishedSeed = store.boardSeed;
    }

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
    return {
      balls: this.world.balls,
      bricks: this.world.bricks,
      explosions: this.world.explosions,
      priorityBrickId: this.world.priorityBrickId ?? null,
    };
  }

  private discardPendingRewards(): void {
    this.pendingCoins = ZERO_DECIMAL;
    this.pendingBricksBroken = 0;
    this.boardDirty = false;
  }

  private publishBoard(force = false): void {
    this.syncWorld();
    const now = performance.now();
    if (!force && now - this.lastPublishedAt < 100) return;

    const hasPendingRewards = this.pendingCoins.gt(0) || this.pendingBricksBroken > 0;
    const seed = hasSeedState(this.randomSource) ? this.randomSource.getState() : undefined;
    const boardChanged =
      this.boardDirty ||
      this.publishedBalls !== this.world.balls ||
      this.publishedBricks !== this.world.bricks ||
      this.publishedExplosions !== this.world.explosions ||
      (typeof seed === 'number' && this.publishedSeed !== seed);

    if (!hasPendingRewards && !boardChanged) return;

    const coinsToFlush = this.pendingCoins;
    const bricksToFlush = this.pendingBricksBroken;
    this.pendingCoins = ZERO_DECIMAL;
    this.pendingBricksBroken = 0;
    this.boardDirty = false;

    const board = this.getRenderState();
    this.publishedBalls = board.balls;
    this.publishedBricks = board.bricks;
    this.publishedExplosions = board.explosions;
    if (typeof seed === 'number') {
      this.publishedSeed = seed;
    }
    this.lastPublishedAt = now;

    useGameStore.getState().applyBoardRewards({
      coins: coinsToFlush,
      bricksBroken: bricksToFlush,
      board: {
        ...board,
        seed,
      },
    });
  }

  /** Immediately flushes any buffered rewards and live board state to the store. */
  flush(): void {
    this.publishBoard(true);
  }

  /** Flushes pending state and unregisters store lifecycle callbacks on unmount. */
  destroy(): void {
    this.flush();
    this.unregisterSyncHandlers();
  }

  resize(width: number, height: number) {
    this.brickManager.resize(width, height);
    useGameStore.getState().setCanvasSize(width, height);
    this.boardDirty = true;
    this.publishBoard(true);
  }

  step(delta: number) {
    if (useGameStore.getState().isPaused) return;

    this.syncWorld();
    const frameDelta = advanceBoardWorld(this.world, delta, performance.now());
    if (this.world.balls.length > 0 || this.world.explosions.length > 0) {
      this.boardDirty = true;
    }
    this.applyEvents(takeBoardEvents(this.world), frameDelta);

    const store = useGameStore.getState();
    const effectiveTier = Math.max(
      store.currentTier,
      calculateTierForBricks(store.bricksBroken.add(this.pendingBricksBroken))
    );
    const refillTarget = Math.min(MIN_BRICKS_ON_SCREEN, this.brickManager.getCapacity());
    if (this.world.bricks.length < refillTarget) {
      const newBricks = this.brickManager.addBricksToFillScreen(this.world.bricks, effectiveTier);
      if (newBricks.length > 0) {
        this.world.bricks = [...this.world.bricks, ...newBricks];
        this.boardDirty = true;
      }
    }

    refreshBoardWorld(this.world);
    this.publishBoard();
    return frameDelta;
  }

  private applyEvents(events: BoardEvent[], frameDelta: number = 0) {
    for (const event of events) {
      if (event.type === 'brickDamaged') {
        this.boardDirty = true;
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
        this.boardDirty = true;
        if (event.source !== 'explosion') playSound('brickBreak');
        this.pendingCoins = this.pendingCoins.add(event.coins);
        this.pendingBricksBroken += 1;
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
        this.boardDirty = true;
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
    const clicked = this.findBrickAt(x, y);
    if (clicked) {
      // Active play: a click chips the brick and focuses fire on it.
      this.world.priorityBrickId = clicked.id;
    }
    if (applyBoardClickDamage(this.world, x, y)) {
      this.applyEvents(takeBoardEvents(this.world));
      refreshBoardWorld(this.world);
      this.boardDirty = true;
    }
    this.publishBoard(true);
  }
}
