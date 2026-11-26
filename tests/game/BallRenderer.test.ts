import { describe, it, expect, vi } from 'vitest';

// Only colour parsing touches Phaser in this path.
vi.mock('phaser', () => ({
  default: {},
  Display: {
    Color: {
      HexStringToColor: (hex: string) => ({
        color: parseInt(hex.replace('#', ''), 16),
      }),
    },
  },
}));

import { BallRenderer } from '../../src/game/GameRenderers';
import type { BallData, BallType } from '../../src/types/game';

class RecordingGraphics {
  calls: string[] = [];
  fills: number[] = [];
  pointCounts: number[] = [];

  clear() {
    this.calls = [];
    this.fills = [];
    this.pointCounts = [];
  }

  fillStyle(color: number) {
    this.calls.push('fillStyle');
    this.fills.push(color);
  }

  lineStyle() {
    this.calls.push('lineStyle');
  }

  fillCircle() {
    this.calls.push('fillCircle');
  }

  strokeCircle() {
    this.calls.push('strokeCircle');
  }

  fillPoints(points: unknown[]) {
    this.calls.push('fillPoints');
    this.pointCounts.push(points.length);
  }

  fillTriangle() {
    this.calls.push('fillTriangle');
  }

  lineBetween() {
    this.calls.push('lineBetween');
  }

  beginPath() {
    this.calls.push('beginPath');
  }

  moveTo() {
    this.calls.push('moveTo');
  }

  lineTo() {
    this.calls.push('lineTo');
  }

  strokePath() {
    this.calls.push('strokePath');
  }

  destroy() {}
}

const createRenderer = () => {
  const graphics: RecordingGraphics[] = [];
  const scene = {
    add: {
      graphics: () => {
        const item = new RecordingGraphics();
        graphics.push(item);
        return item;
      },
    },
  } as unknown as ConstructorParameters<typeof BallRenderer>[0];

  return { renderer: new BallRenderer(scene), graphics };
};

const renderBall = (type: BallType) => {
  const { renderer, graphics } = createRenderer();
  const ball: BallData = {
    id: 'ball-1',
    type,
    x: 100,
    y: 100,
    dx: 1,
    dy: -1,
  };
  renderer.render([ball]);
  return graphics[0];
};

describe('BallRenderer silhouettes', () => {
  it('keeps basic as a plain circle', () => {
    const graphics = renderBall('basic');
    expect(graphics.calls).toContain('fillCircle');
    expect(graphics.calls).not.toContain('fillPoints');
    expect(graphics.calls).not.toContain('fillTriangle');
  });

  it('draws a hexagon for heavy balls', () => {
    const graphics = renderBall('heavy');
    expect(graphics.pointCounts).toContain(6);
  });

  it('draws an eight-point star for plasma balls', () => {
    const graphics = renderBall('plasma');
    expect(graphics.pointCounts).toContain(8);
  });

  it('adds spikes to explosive balls', () => {
    const graphics = renderBall('explosive');
    expect(graphics.calls.filter((call) => call === 'fillTriangle')).toHaveLength(4);
  });

  it('draws a crosshair for sniper balls', () => {
    const graphics = renderBall('sniper');
    expect(graphics.calls).toContain('strokeCircle');
    expect(graphics.calls.filter((call) => call === 'lineBetween')).toHaveLength(4);
  });

  it('rings fast balls so they differ from basic in monochrome', () => {
    const graphics = renderBall('fast');
    expect(graphics.calls).toContain('strokeCircle');
    expect(graphics.calls).not.toContain('fillPoints');
  });
});
