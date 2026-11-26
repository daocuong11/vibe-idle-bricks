import Decimal from 'break_infinity.js';
import { useGameStore } from '../store';
import { BALL_TYPES } from '../types';
import type { BallData, BrickData } from '../types';
import { formatNumber } from '../utils';
import { BallPhysics } from './BallPhysics';
import { BrickManager } from './BrickManager';
import { SpatialGrid } from './SpatialGrid';
import {
  BALL_RADIUS,
  FIXED_STEP,
  clampAccumulator,
  clampFrameDelta,
  MIN_BRICKS_ON_SCREEN,
  EXPLOSION_DAMAGE_MULTIPLIER,
  EXPLOSION_HIT_PARTICLE_COUNT,
  BALL_HIT_PARTICLE_COUNT,
  CLICK_DAMAGE_BASE,
  CLICK_PARTICLE_COUNT,
} from './constants';

type BallConfig = (typeof BALL_TYPES)[keyof typeof BALL_TYPES];

export interface BoardEffects {
  showFloatingText(x: number, y: number, text: string, kind: 'damage' | 'coin'): void;
  emitBrickBreakParticles(brick: BrickData, count: number): void;
  shakeExplosion(): void;
}

export class BoardSimulation {
  private readonly effects: BoardEffects;
  private readonly brickManager: BrickManager;
  private ballPhysics: BallPhysics;
  private spatialGrid: SpatialGrid = new SpatialGrid(100);
  private physicsAccumulator: number = 0;
  private weakestBrick: BrickData | null = null;

  constructor(size: { width: number; height: number }, effects: BoardEffects) {
    this.effects = effects;
    this.brickManager = new BrickManager(size);
    this.ballPhysics = new BallPhysics(size.width, size.height);
    const store = useGameStore.getState();
    store.setCanvasSize(size.width, size.height);
    store.setBricks(this.brickManager.generateBricks(50, store.currentTier));
  }

  resize(width: number, height: number) {
    this.ballPhysics = new BallPhysics(width, height);
    this.brickManager.resize(width, height);
    useGameStore.getState().setCanvasSize(width, height);
  }

  step(delta: number) {
    const initialState = useGameStore.getState();
    if (initialState.isPaused) {
      return;
    }

    const frameDelta = clampFrameDelta(delta);
    this.physicsAccumulator = clampAccumulator(this.physicsAccumulator, frameDelta);
    while (this.physicsAccumulator >= FIXED_STEP) {
      this.updateBalls(FIXED_STEP);
      this.physicsAccumulator -= FIXED_STEP;
    }

    // Keep visuals on the same clock as the clamped simulation.
    useGameStore.getState().updateExplosions(frameDelta);

    const stateAfterSimulation = useGameStore.getState();
    const refillTarget = Math.min(MIN_BRICKS_ON_SCREEN, this.brickManager.getCapacity());
    if (stateAfterSimulation.bricks.length < refillTarget) {
      const newBricks = this.brickManager.addBricksToFillScreen(
        stateAfterSimulation.bricks,
        stateAfterSimulation.currentTier
      );

      if (newBricks.length > 0) {
        stateAfterSimulation.setBricks([...stateAfterSimulation.bricks, ...newBricks]);
      }
    }

    // Rebuild spatial grid and update targeting once per frame — after all brick mutations
    // are settled — rather than on every individual bricks state change.
    this.spatialGrid.rebuild(stateAfterSimulation.bricks);
    this.weakestBrick = this.ballPhysics.findWeakestBrick(stateAfterSimulation.bricks);

    return frameDelta;
  }

  /**
   * Updates the physics and position of all balls.
   * Handles movement, wall collisions, and interaction with bricks.
   */
  private updateBalls(step: number) {
    const store = useGameStore.getState();
    const speedMult = store.getSpeedMult();
    const damageMult = store.getDamageMult();
    const coinMult = store.getCoinMult();
    const updatedBalls = store.balls.slice();

    for (const ball of updatedBalls) {
      this.simulateBall(ball, step, speedMult, damageMult, coinMult);
    }

    useGameStore.setState({ balls: updatedBalls });
  }

  /**
   * Checks for collisions between a ball and any brick.
   * Handles damage application, bouncing, and effects.
   */
  private checkBrickCollisions(
    ball: BallData,
    damageMult: number,
    coinMult: number,
    config: BallConfig
  ): { dx: number; dy: number } | null {
    const store = useGameStore.getState();
    const actualDamage = new Decimal(config.damage).mul(damageMult);
    const potentialBricks = this.spatialGrid.query(ball, BALL_RADIUS);
    const physics = this.ballPhysics;

    for (const brick of potentialBricks) {
      if (!physics.ballCollidesWithBrick(ball, brick)) {
        continue;
      }

      const result = store.damageBrick(brick.id, actualDamage);

      if (result) {
        // The killing hit is followed by a coin popup in the same spot; showing
        // both just stacks two numbers.
        if (
          !result.destroyed &&
          (config.damage > 1 || config.explosive || ball.type === 'sniper')
        ) {
          this.effects.showFloatingText(
            brick.x + brick.width / 2,
            brick.y,
            `-${formatNumber(actualDamage)}`,
            'damage'
          );
        }

        if (result.destroyed) {
          this.handleBrickDestroyed(brick, coinMult, BALL_HIT_PARTICLE_COUNT, true);
        }
      }

      if (config.explosive && config.explosionRadius) {
        this.explode(ball.x, ball.y, config.explosionRadius, actualDamage, coinMult);
        this.effects.shakeExplosion();
      }

      if (!config.pierce) {
        return physics.calculateBounce(ball, brick);
      }
    }

    return null;
  }

  /**
   * Triggers an area-of-effect explosion.
   */
  private explode(x: number, y: number, radius: number, damage: Decimal, coinMult: number) {
    const store = useGameStore.getState();
    const explosionDamage = damage.mul(EXPLOSION_DAMAGE_MULTIPLIER);
    const candidateBricks = this.spatialGrid.queryBounds(
      x - radius,
      y - radius,
      x + radius,
      y + radius
    );
    const impactedBricks = candidateBricks.filter((brick) => this.ballPhysics.isBrickWithinRadius(x, y, radius, brick));

    const results = store.applyBrickDamageBatch(
      impactedBricks.map((brick) => ({
        id: brick.id,
        damage: explosionDamage,
      }))
    );

    for (const result of results) {
      if (result.destroyed) {
        this.handleBrickDestroyed(result.brick, coinMult, EXPLOSION_HIT_PARTICLE_COUNT, false);
      }
    }

    store.addExplosion(x, y, radius);
  }

  private handleBrickDestroyed(
    brick: BrickData,
    coinMult: number,
    particleCount: number,
    showCoinText: boolean
  ) {
    const store = useGameStore.getState();
    const coinsEarned = brick.value.mul(coinMult);

    store.addCoins(coinsEarned);
    store.incrementBricksBroken();

    this.effects.emitBrickBreakParticles(brick, particleCount);
    if (showCoinText) {
      this.effects.showFloatingText(
        brick.x + brick.width / 2,
        brick.y,
        `+${formatNumber(coinsEarned)}¢`,
        'coin'
      );
    }
  }

  private simulateBall(
    ball: BallData,
    step: number,
    speedMult: number,
    damageMult: number,
    coinMult: number
  ) {
    const physics = this.ballPhysics;
    const config = BALL_TYPES[ball.type];
    const actualSpeed = config.speed * speedMult;
    const currentSpeedSquared = ball.dx * ball.dx + ball.dy * ball.dy;

    let dx = ball.dx;
    let dy = ball.dy;

    if (currentSpeedSquared > 0) {
      const currentSpeed = Math.sqrt(currentSpeedSquared);
      dx = (ball.dx / currentSpeed) * actualSpeed;
      dy = (ball.dy / currentSpeed) * actualSpeed;
    }

    if (config.targeting) {
      const bricks = useGameStore.getState().bricks;
      if (bricks.length > 0) {
        const target = this.weakestBrick ?? physics.findWeakestBrick(bricks);
        [dx, dy] = physics.seekTarget(ball, dx, dy, target);
      }
    }

    ball.dx = dx;
    ball.dy = dy;

    const movedBall = physics.applyBallMovement(ball, step);
    ball.x = movedBall.x;
    ball.y = movedBall.y;
    ball.dx = movedBall.dx;
    ball.dy = movedBall.dy;

    const bounceResult = this.checkBrickCollisions(ball, damageMult, coinMult, config);
    if (bounceResult) {
      ball.dx = bounceResult.dx;
      ball.dy = bounceResult.dy;
    }

    const normalizedVelocity = physics.normalizeVelocity(ball.dx, ball.dy, actualSpeed);
    ball.dx = normalizedVelocity.dx;
    ball.dy = normalizedVelocity.dy;
  }

  findBrickAt(x: number, y: number): BrickData | undefined {
    const potentialBricks = this.spatialGrid.queryBounds(x - 5, y - 5, x + 5, y + 5);
    return potentialBricks.find(
      (brick) => x >= brick.x && x <= brick.x + brick.width && y >= brick.y && y <= brick.y + brick.height
    );
  }

  handleBrickClick(x: number, y: number) {
    const store = useGameStore.getState();
    const brick = this.findBrickAt(x, y);
    if (!brick) return;

    const damageMult = store.getDamageMult();
    const coinMult = store.getCoinMult();
    const clickDamage = new Decimal(damageMult).mul(CLICK_DAMAGE_BASE);

    const result = store.damageBrick(brick.id, clickDamage);
    if (result) {
      this.effects.showFloatingText(x, y, `-${formatNumber(clickDamage)}`, 'damage');
      if (result.destroyed) {
        this.handleBrickDestroyed(brick, coinMult, CLICK_PARTICLE_COUNT, true);
      }
    }
  }
}
