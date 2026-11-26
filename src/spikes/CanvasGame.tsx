import { useEffect, useRef } from 'react';
import { BoardSimulation, type BoardEffects } from '../game/BoardSimulation';
import { BALL_RADIUS } from '../game/constants';
import { useGameStore } from '../store';
import { useSettingsStore } from '../store/settingsStore';
import { BALL_TYPES } from '../types';
import { getAccessibleTierColor, getContrastTextColor } from '../utils';

const board = { width: 800, height: 500 };

interface Effect {
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
  color: string;
  text?: string;
}

function mount(canvas: HTMLCanvasElement, parent: HTMLDivElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas2D is unavailable');
  const effects: Effect[] = [];
  const sink: BoardEffects = {
    showFloatingText(x, y, text, kind) {
      effects.push({ x, y, dx: 0, dy: -0.04, life: 650, color: kind === 'coin' ? '#ffd54f' : '#fff', text });
    },
    emitBrickBreakParticles(brick, count) {
      if (useSettingsStore.getState().reducedMotion) return;
      for (let i = 0; i < count; i++) {
        const angle = 2 * Math.PI * i / count;
        effects.push({ x: brick.x + brick.width / 2, y: brick.y + brick.height / 2,
          dx: Math.cos(angle) * 0.07, dy: Math.sin(angle) * 0.07, life: 250, color: '#ffca80' });
      }
    },
    shakeExplosion() { /* The spike benchmarks rings without camera shake. */ },
  };
  const simulation = new BoardSimulation(board, sink);

  const sizeCanvas = () => {
    const scale = Math.min(parent.clientWidth / board.width, parent.clientHeight / board.height);
    const width = board.width * scale;
    const height = board.height * scale;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.max(1, Math.round(width * window.devicePixelRatio));
    canvas.height = Math.max(1, Math.round(height * window.devicePixelRatio));
    draw(0);
  };

  const draw = (dt: number) => {
    context.setTransform(canvas.width / board.width, 0, 0, canvas.height / board.height, 0, 0);
    context.fillStyle = '#0f0f1a';
    context.fillRect(0, 0, board.width, board.height);
    context.font = 'bold 12px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const { balls, bricks, explosions } = useGameStore.getState();
    const { colorblindMode } = useSettingsStore.getState();
    for (const brick of bricks) {
      const color = getAccessibleTierColor(brick.tier, colorblindMode);
      context.fillStyle = color;
      context.fillRect(brick.x, brick.y, brick.width, brick.height);
      if (brick.tier > 1) {
        context.fillStyle = getContrastTextColor(color);
        context.fillText(String(brick.tier), brick.x + brick.width / 2, brick.y + brick.height / 2);
      }
    }
    for (const ball of balls) {
      context.fillStyle = BALL_TYPES[ball.type].color;
      if (ball.type === 'sniper' || ball.type === 'plasma') {
        context.strokeStyle = context.fillStyle;
        context.beginPath();
        context.moveTo(ball.x, ball.y);
        context.lineTo(ball.x - 3 * ball.dx, ball.y - 3 * ball.dy);
        context.stroke();
      }
      context.beginPath();
      context.arc(ball.x, ball.y, BALL_RADIUS, 0, 2 * Math.PI);
      context.fill();
    }
    context.strokeStyle = '#ffac4a';
    for (const explosion of explosions) {
      context.beginPath();
      context.arc(explosion.x, explosion.y, explosion.radius * (1 - explosion.life / explosion.maxLife), 0, 2 * Math.PI);
      context.stroke();
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.life -= dt;
      if (effect.life <= 0) {
        effects.splice(i, 1);
        continue;
      }
      effect.x += effect.dx * dt;
      effect.y += effect.dy * dt;
      context.fillStyle = effect.color;
      if (effect.text) context.fillText(effect.text, effect.x, effect.y);
      else context.fillRect(effect.x, effect.y, 3, 3);
    }
  };

  let previous: number | undefined;
  let frame: number;
  function tick(now: number) {
    const dt = simulation.step(previous === undefined ? 0 : now - previous);
    previous = now;
    if (dt !== undefined) draw(dt);
    frame = requestAnimationFrame(tick);
  }
  function visibilityChanged() {
    cancelAnimationFrame(frame);
    previous = undefined;
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }
  function pointerDown(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    simulation.handleBrickClick((event.clientX - bounds.left) * board.width / bounds.width,
      (event.clientY - bounds.top) * board.height / bounds.height);
  }
  const observer = new ResizeObserver(sizeCanvas);
  observer.observe(parent);
  sizeCanvas();
  visibilityChanged();
  canvas.addEventListener('pointerdown', pointerDown);
  document.addEventListener('visibilitychange', visibilityChanged);
  const saveTimer = window.setInterval(() => {
    if (!document.hidden) useGameStore.getState().save();
  }, 30000);
  return () => {
    clearInterval(saveTimer);
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', pointerDown);
    document.removeEventListener('visibilitychange', visibilityChanged);
    useGameStore.getState().save();
  };
}

export function CanvasGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const parent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (canvas.current && parent.current) return mount(canvas.current, parent.current);
  }, []);
  return <div ref={parent} className="game-canvas" style={{ display: 'grid', placeItems: 'center' }}>
    <canvas ref={canvas} role="img" aria-label="Brick game board" aria-describedby="game-instructions" />
  </div>;
}

// The spike build substitutes this module at the existing lazy board boundary.
export { CanvasGame as PhaserGame };
