import Decimal from 'break_infinity.js';
import type { BallData, BrickData } from '../../types';
import { BALL_RADIUS, SPEED_STEER_STRENGTH } from '../constants';

export const applyBallMovement = (
  ball: BallData,
  step: number,
  width: number,
  height: number
): { x: number; y: number; dx: number; dy: number } => {
  let x = ball.x + ball.dx * (step / 16);
  let y = ball.y + ball.dy * (step / 16);
  let dx = ball.dx;
  let dy = ball.dy;

  if (x - BALL_RADIUS < 0) {
    x = BALL_RADIUS;
    dx = Math.abs(dx);
  }
  if (x + BALL_RADIUS > width) {
    x = width - BALL_RADIUS;
    dx = -Math.abs(dx);
  }
  if (y - BALL_RADIUS < 0) {
    y = BALL_RADIUS;
    dy = Math.abs(dy);
  }
  if (y + BALL_RADIUS > height) {
    y = height - BALL_RADIUS;
    dy = -Math.abs(dy);
  }

  return { x, y, dx, dy };
};

export const normalizeVelocity = (
  dx: number,
  dy: number,
  speed: number
): { dx: number; dy: number } => {
  const speedSq = dx * dx + dy * dy;
  if (speedSq === 0) return { dx: 0, dy: 0 };
  const currentSpeed = Math.sqrt(speedSq);
  return { dx: (dx / currentSpeed) * speed, dy: (dy / currentSpeed) * speed };
};

export const seekTarget = (
  ball: BallData,
  dx: number,
  dy: number,
  target: BrickData | null
): [number, number] => {
  if (!target) return [dx, dy];

  const deltaX = target.x + target.width / 2 - ball.x;
  const deltaY = target.y + target.height / 2 - ball.y;
  const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  if (dist === 0) return [dx, dy];
  return [
    dx + (deltaX / dist) * SPEED_STEER_STRENGTH,
    dy + (deltaY / dist) * SPEED_STEER_STRENGTH,
  ];
};

export const findWeakestBrick = (bricks: BrickData[]): BrickData | null => {
  let weakest: BrickData | null = null;
  let minHealth = new Decimal(Infinity);
  for (const brick of bricks) {
    if (brick.health.lt(minHealth)) {
      minHealth = brick.health;
      weakest = brick;
    }
  }
  return weakest;
};

export const calculateBounce = (
  ball: BallData,
  brick: BrickData
): { dx: number; dy: number } => {
  const deltaX = ball.x - (brick.x + brick.width / 2);
  const deltaY = ball.y - (brick.y + brick.height / 2);
  const normalizedX = deltaX / (brick.width / 2);
  const normalizedY = deltaY / (brick.height / 2);

  if (Math.abs(normalizedX) > Math.abs(normalizedY)) {
    const direction = Math.sign(deltaX) || Math.sign(ball.dx) || 1;
    return { dx: Math.abs(ball.dx) * direction, dy: ball.dy };
  }

  const direction = Math.sign(deltaY) || Math.sign(ball.dy) || 1;
  return { dx: ball.dx, dy: Math.abs(ball.dy) * direction };
};

export const ballCollidesWithBrick = (ball: BallData, brick: BrickData): boolean => {
  const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
  const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));
  const distX = ball.x - closestX;
  const distY = ball.y - closestY;
  return distX * distX + distY * distY < BALL_RADIUS * BALL_RADIUS;
};

export const isBrickWithinRadius = (
  x: number,
  y: number,
  radius: number,
  brick: BrickData
): boolean => {
  const deltaX = x - (brick.x + brick.width / 2);
  const deltaY = y - (brick.y + brick.height / 2);
  return deltaX * deltaX + deltaY * deltaY < radius * radius;
};
