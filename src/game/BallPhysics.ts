import type { BallData, BrickData } from '../types';
import {
  applyBallMovement,
  ballCollidesWithBrick,
  calculateBounce,
  findWeakestBrick,
  isBrickWithinRadius,
  normalizeVelocity,
  seekTarget,
} from './model/physics';

/** Compatibility wrapper; board rules live in the platform-free model. */
export class BallPhysics {
  private readonly width: number;
  private readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  applyBallMovement(
    ball: BallData,
    step: number
  ): { x: number; y: number; dx: number; dy: number } {
    return applyBallMovement(ball, step, this.width, this.height);
  }

  normalizeVelocity(dx: number, dy: number, speed: number): { dx: number; dy: number } {
    return normalizeVelocity(dx, dy, speed);
  }

  seekTarget(
    ball: BallData,
    dx: number,
    dy: number,
    target: BrickData | null
  ): [number, number] {
    return seekTarget(ball, dx, dy, target);
  }

  findWeakestBrick(bricks: BrickData[]): BrickData | null {
    return findWeakestBrick(bricks);
  }

  calculateBounce(ball: BallData, brick: BrickData): { dx: number; dy: number } {
    return calculateBounce(ball, brick);
  }

  ballCollidesWithBrick(ball: BallData, brick: BrickData): boolean {
    return ballCollidesWithBrick(ball, brick);
  }

  isBrickWithinRadius(x: number, y: number, radius: number, brick: BrickData): boolean {
    return isBrickWithinRadius(x, y, radius, brick);
  }
}
