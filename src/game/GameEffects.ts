import * as Phaser from 'phaser';
import type { BrickData, Explosion } from '../types';
import { getAccessibleTierColor, type ColorblindMode } from '../utils';
import { getParsedColor } from './color';
import { FLOATING_TEXT_LIFE_MS } from './constants';
import { useSettingsStore } from '../store/settingsStore';

export type FloatingTextKind = 'damage' | 'coin';

interface FloatingTextEntry {
  life: number;
  text: Phaser.GameObjects.Text;
  kind: FloatingTextKind;
}

/**
 * Past this many popups the board turns into noise. New damage popups are
 * dropped; a coin popup evicts the oldest damage popup, or is dropped when the
 * board is all coins.
 */
export const MAX_ACTIVE_FLOATING_TEXTS = 8;

// Near-white vs gold stays distinguishable under red-green colour blindness;
// the '-' and '¢' markers are the second cue.
const FLOATING_TEXT_COLORS: Record<FloatingTextKind, string> = {
  damage: '#f8fafc',
  coin: '#fbbf24',
};

/**
 * Manages transient visual effects used by the gameplay loop.
 */
export class GameEffects {
  private particleEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private explosionGraphics!: Phaser.GameObjects.Graphics;
  private readonly activeFloatingTexts: FloatingTextEntry[] = [];
  private readonly floatingTextPool: Phaser.GameObjects.Text[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Initializes graphics-backed effect objects.
   */
  initialize() {
    if (!this.scene.textures.exists('particle')) {
      const graphics = this.scene.make.graphics({ x: 0, y: 0 });
      graphics.fillStyle(0xffffff);
      graphics.fillRect(0, 0, 4, 4);
      graphics.generateTexture('particle', 4, 4);
      graphics.destroy();
    }

    this.particleEmitter = this.scene.add.particles(0, 0, 'particle', {
      lifespan: 600,
      speed: { min: 50, max: 150 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      emitting: false,
    });
    this.explosionGraphics = this.scene.add.graphics();
  }

  /**
   * Displays a floating text indicator.
   */
  showFloatingText(x: number, y: number, text: string, kind: FloatingTextKind = 'damage') {
    if (this.activeFloatingTexts.length >= MAX_ACTIVE_FLOATING_TEXTS) {
      if (kind === 'damage') return;
      const oldestDamage = this.activeFloatingTexts.findIndex((entry) => entry.kind === 'damage');
      if (oldestDamage === -1) return;
      this.releaseAt(oldestDamage);
    }

    const floatingText = this.getFloatingText();
    // Small jitter keeps simultaneous popups on the same brick readable.
    floatingText
      .setPosition(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 8)
      .setText(text)
      .setColor(FLOATING_TEXT_COLORS[kind])
      .setAlpha(1)
      .setVisible(true);

    this.activeFloatingTexts.push({
      life: FLOATING_TEXT_LIFE_MS,
      text: floatingText,
      kind,
    });
  }

  /**
   * Updates active floating text objects and returns expired ones to the pool.
   */
  updateFloatingTexts(delta: number) {
    const reduceMotion = useSettingsStore.getState().reducedMotion;
    for (let index = this.activeFloatingTexts.length - 1; index >= 0; index--) {
      const entry = this.activeFloatingTexts[index];
      entry.life -= delta;

      if (entry.life <= 0) {
        this.releaseAt(index);
        continue;
      }

      if (!reduceMotion) entry.text.y -= 0.05 * delta;
      entry.text.setAlpha(entry.life / FLOATING_TEXT_LIFE_MS);
    }
  }

  /**
   * Emits particles for a destroyed brick.
   *
   * When the user has reduced-motion enabled the particle burst is suppressed
   * entirely so the playfield stays visually calm.
   */
  emitBrickBreakParticles(brick: BrickData, count: number) {
    if (useSettingsStore.getState().reducedMotion) return;
    const color = this.getTierColorNumber(brick.tier);
    this.particleEmitter.setPosition(brick.x + brick.width / 2, brick.y + brick.height / 2);
    this.particleEmitter.setParticleTint(color);
    this.particleEmitter.explode(count);
  }

  /**
   * Draws all active explosion overlays using a shared graphics object.
   */
  renderExplosions(explosions: Explosion[]) {
    this.explosionGraphics.clear();

    for (const explosion of explosions) {
      const progress = 1 - explosion.life / explosion.maxLife;
      const radius = explosion.radius * (0.35 + progress * 0.65);
      const alpha = 1 - progress;

      // A faint core plus a bright rim keeps the bricks underneath readable.
      this.explosionGraphics.fillStyle(0xffa94d, alpha * 0.08);
      this.explosionGraphics.fillCircle(explosion.x, explosion.y, radius * 0.75);
      this.explosionGraphics.lineStyle(3, 0xffd166, alpha * 0.85);
      this.explosionGraphics.strokeCircle(explosion.x, explosion.y, radius);
      this.explosionGraphics.lineStyle(1, 0xffffff, alpha * 0.3);
      this.explosionGraphics.strokeCircle(explosion.x, explosion.y, radius * 0.7);
    }
  }

  /**
   * Applies the configured explosion screen shake.
   *
   * No-op when reduced-motion is enabled so the game remains calm.
   */
  shakeExplosion() {
    if (useSettingsStore.getState().reducedMotion) return;
    this.scene.cameras.main.shake(100, 0.005);
  }

  /**
   * Cleans up effect objects.
   */
  destroy() {
    this.particleEmitter?.destroy();
    this.explosionGraphics?.destroy();

    for (const entry of this.activeFloatingTexts) {
      entry.text.destroy();
    }
    for (const text of this.floatingTextPool) {
      text.destroy();
    }

    this.activeFloatingTexts.length = 0;
    this.floatingTextPool.length = 0;
  }

  private releaseAt(index: number) {
    const [entry] = this.activeFloatingTexts.splice(index, 1);
    entry.text.setVisible(false);
    this.floatingTextPool.push(entry.text);
  }

  private getFloatingText() {
    const pooledText = this.floatingTextPool.pop();
    if (pooledText) {
      return pooledText;
    }

    const text = this.scene.add.text(0, 0, '', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    });
    text.setOrigin(0.5);
    text.setVisible(false);
    return text;
  }

  private getTierColorNumber(tier: number) {
    const mode: ColorblindMode = useSettingsStore.getState().colorblindMode;
    return getParsedColor(getAccessibleTierColor(tier, mode));
  }
}
