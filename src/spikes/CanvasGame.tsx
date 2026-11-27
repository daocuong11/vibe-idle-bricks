import { useEffect, useRef } from 'react';
import { BoardSimulation, type BoardEffects } from '../game/BoardSimulation';
import { BALL_RADIUS } from '../game/constants';
import { useGameStore } from '../store';
import { useSettingsStore, type ColorblindMode } from '../store/settingsStore';
import { BALL_TYPES, type BrickData } from '../types';
import { getAccessibleTierColor, getContrastTextColor } from '../utils';

const board = { width: 800, height: 500 };
const BRICK_WIDTH = 60;
const BRICK_HEIGHT = 25;

interface Effect {
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
  color: string;
  text?: string;
}

interface RenderedBrick {
  x: number;
  y: number;
  tier: number;
  color: string;
}

function mount(staticCanvas: HTMLCanvasElement, dynamicCanvas: HTMLCanvasElement, parent: HTMLDivElement) {
  const staticContext = staticCanvas.getContext('2d', { alpha: false });
  const context = dynamicCanvas.getContext('2d');
  if (!staticContext || !context) throw new Error('Canvas2D is unavailable');

  const effects: Effect[] = [];
  const effectsEnabled = !window.location.search.includes('noeffects');
  const sink: BoardEffects = {
    showFloatingText(x, y, text, kind) {
      if (!effectsEnabled) return;
      effects.push({ x, y, dx: 0, dy: -0.04, life: 650, color: kind === 'coin' ? '#ffd54f' : '#fff', text });
    },
    emitBrickBreakParticles(brick, count) {
      if (!effectsEnabled || useSettingsStore.getState().reducedMotion) return;
      for (let i = 0; i < count; i++) {
        const angle = 2 * Math.PI * i / count;
        effects.push({
          x: brick.x + brick.width / 2,
          y: brick.y + brick.height / 2,
          dx: Math.cos(angle) * 0.07,
          dy: Math.sin(angle) * 0.07,
          life: 250,
          color: '#ffca80',
        });
      }
    },
    shakeExplosion() { /* The spike benchmarks rings without camera shake. */ },
  };
  const simulation = new BoardSimulation(board, sink);

  const tileCache = new Map<string, HTMLCanvasElement>();
  const ballCache = new Map<string, HTMLCanvasElement>();
  const renderedBricks = new Map<string, RenderedBrick>();
  let lastColorblind: ColorblindMode | '' = '';
  let staticDirty = true;

  const getBrickTile = (tier: number, color: string, scale: number): HTMLCanvasElement => {
    const key = tier + ':' + color + ':' + scale.toFixed(3);
    const cached = tileCache.get(key);
    if (cached) return cached;

    const tile = document.createElement('canvas');
    tile.width = Math.max(1, Math.round(BRICK_WIDTH * scale));
    tile.height = Math.max(1, Math.round(BRICK_HEIGHT * scale));
    const tileContext = tile.getContext('2d');
    if (!tileContext) return tile;
    tileContext.setTransform(scale, 0, 0, scale, 0, 0);
    tileContext.fillStyle = color;
    tileContext.fillRect(0, 0, BRICK_WIDTH, BRICK_HEIGHT);
    if (tier > 1) {
      tileContext.fillStyle = getContrastTextColor(color);
      tileContext.font = 'bold 12px sans-serif';
      tileContext.textAlign = 'center';
      tileContext.textBaseline = 'middle';
      tileContext.fillText(String(tier), BRICK_WIDTH / 2, BRICK_HEIGHT / 2);
    }
    tileCache.set(key, tile);
    return tile;
  };

  const getBallSprite = (type: string, scale: number): HTMLCanvasElement => {
    const key = type + ':' + scale.toFixed(3);
    const cached = ballCache.get(key);
    if (cached) return cached;

    const size = Math.max(2, Math.round(BALL_RADIUS * 2 * scale));
    const sprite = document.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    const spriteContext = sprite.getContext('2d');
    if (!spriteContext) return sprite;
    spriteContext.setTransform(scale, 0, 0, scale, 0, 0);
    spriteContext.fillStyle = BALL_TYPES[type as keyof typeof BALL_TYPES].color;
    spriteContext.beginPath();
    spriteContext.arc(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS, 0, 2 * Math.PI);
    spriteContext.fill();
    ballCache.set(key, sprite);
    return sprite;
  };

  const clearBrick = (brick: RenderedBrick, scale: number) => {
    staticContext.fillStyle = '#0f0f1a';
    staticContext.fillRect(
      Math.floor(brick.x * scale) - 1,
      Math.floor(brick.y * scale) - 1,
      Math.ceil(BRICK_WIDTH * scale) + 2,
      Math.ceil(BRICK_HEIGHT * scale) + 2
    );
  };

  const syncStaticBricks = (bricks: BrickData[], colorblindMode: ColorblindMode, scale: number) => {
    const seen = new Set<string>();
    for (const brick of bricks) {
      seen.add(brick.id);
      const color = getAccessibleTierColor(brick.tier, colorblindMode);
      const previous = renderedBricks.get(brick.id);
      if (previous && previous.tier === brick.tier && previous.color === color && previous.x === brick.x && previous.y === brick.y) {
        continue;
      }
      if (previous) clearBrick(previous, scale);
      staticContext.drawImage(
        getBrickTile(brick.tier, color, scale),
        Math.floor(brick.x * scale),
        Math.floor(brick.y * scale)
      );
      renderedBricks.set(brick.id, { x: brick.x, y: brick.y, tier: brick.tier, color });
    }

    for (const [id, brick] of renderedBricks) {
      if (!seen.has(id)) {
        clearBrick(brick, scale);
        renderedBricks.delete(id);
      }
    }
  };

  const sizeCanvases = () => {
    const scale = Math.min(parent.clientWidth / board.width, parent.clientHeight / board.height);
    const width = board.width * scale;
    const height = board.height * scale;
    const cssWidth = width + 'px';
    const cssHeight = height + 'px';
    staticCanvas.style.width = cssWidth;
    staticCanvas.style.height = cssHeight;
    dynamicCanvas.style.width = cssWidth;
    dynamicCanvas.style.height = cssHeight;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const target of [staticCanvas, dynamicCanvas]) {
      target.width = Math.max(1, Math.round(width * dpr));
      target.height = Math.max(1, Math.round(height * dpr));
    }
    tileCache.clear();
    ballCache.clear();
    renderedBricks.clear();
    staticDirty = true;
    lastColorblind = '';
    draw(0);
  };

  const draw = (dt: number) => {
    const { balls, bricks, explosions, priorityBrickId } = simulation.getRenderState();
    const { colorblindMode } = useSettingsStore.getState();
    const scaleX = staticCanvas.width / board.width;
    const scaleY = staticCanvas.height / board.height;

    if (staticDirty || lastColorblind !== colorblindMode) {
      staticContext.setTransform(1, 0, 0, 1, 0, 0);
      staticContext.fillStyle = '#0f0f1a';
      staticContext.fillRect(0, 0, staticCanvas.width, staticCanvas.height);
      renderedBricks.clear();
      lastColorblind = colorblindMode;
      staticDirty = false;
    }
    syncStaticBricks(bricks, colorblindMode, scaleX);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, dynamicCanvas.width, dynamicCanvas.height);
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.font = 'bold 12px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    if (priorityBrickId) {
      const marked = bricks.find((brick) => brick.id === priorityBrickId);
      if (marked) {
        context.strokeStyle = '#facc15';
        context.lineWidth = 3;
        context.strokeRect(marked.x - 3, marked.y - 3, marked.width + 6, marked.height + 6);
        context.lineWidth = 1;
      }
    }

    for (const ball of balls) {
      const sprite = getBallSprite(ball.type, scaleX);
      if (ball.type === 'sniper' || ball.type === 'plasma') {
        context.strokeStyle = BALL_TYPES[ball.type].color;
        context.beginPath();
        context.moveTo(ball.x, ball.y);
        context.lineTo(ball.x - 3 * ball.dx, ball.y - 3 * ball.dy);
        context.stroke();
      }
      context.drawImage(sprite, ball.x - BALL_RADIUS, ball.y - BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);
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
    const bounds = dynamicCanvas.getBoundingClientRect();
    simulation.handleBrickClick((event.clientX - bounds.left) * board.width / bounds.width,
      (event.clientY - bounds.top) * board.height / bounds.height);
  }
  const observer = new ResizeObserver(sizeCanvases);
  observer.observe(parent);
  sizeCanvases();
  visibilityChanged();
  dynamicCanvas.addEventListener('pointerdown', pointerDown);
  document.addEventListener('visibilitychange', visibilityChanged);
  const saveTimer = window.setInterval(() => {
    if (!document.hidden) useGameStore.getState().save();
  }, 30000);
  return () => {
    clearInterval(saveTimer);
    cancelAnimationFrame(frame);
    observer.disconnect();
    dynamicCanvas.removeEventListener('pointerdown', pointerDown);
    document.removeEventListener('visibilitychange', visibilityChanged);
    simulation.destroy();
    useGameStore.getState().save();
  };
}

export function CanvasGame() {
  const staticCanvas = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const parent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (staticCanvas.current && canvas.current && parent.current) {
      return mount(staticCanvas.current, canvas.current, parent.current);
    }
  }, []);
  return (
    <div ref={parent} className="game-canvas" style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
      <canvas ref={staticCanvas} aria-hidden="true" style={{ position: 'absolute', inset: 0, margin: 'auto' }} />
      <canvas
        ref={canvas}
        role="img"
        aria-label="Brick game board"
        aria-describedby="game-instructions"
        style={{ position: 'relative' }}
      />
    </div>
  );
}

// The spike build substitutes this module at the existing lazy board boundary.
export { CanvasGame as PhaserGame };
