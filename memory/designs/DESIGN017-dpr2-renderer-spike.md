# DESIGN017 — DPR-2 Renderer Spike: Canvas2D vs Phaser

Date: 2026-11-27
Issue: #56
Branch: `spike/canvas-dpr2`

## Goal

Determine whether a two-layer Canvas2D renderer with cached brick/glyph/ball
sprites can reach Phaser parity at DPR 2, and whether Phaser can itself render a
DPR-2 backing store without losing its existing visuals.

## What Was Built

### Canvas2D variant

- Static canvas: background, bricks, and tier labels.
- Transparent dynamic canvas: balls, explosions, priority ring, floating text,
  and particles.
- Cached brick tiles (fill + tier glyph) keyed by tier/color/scale.
- Dirty per-brick updates: only added, removed, or changed bricks are repainted.
- Cached ball sprites drawn with `drawImage`; dynamic canvas cleared per frame.
- DPR capped at 2; tile/ball caches invalidated on resize or palette change.
- Optional `?noeffects` query flag for profiling.

### Phaser DPR-2 variant

- 1760x1100 backing store for the same 800x500 logical board.
- Camera zoom 2.2 with `centerOn(400, 250)`.
- Pointer input uses `worldX/worldY`.
- Background, resizing, and simulation all use logical 800x500 coordinates.
- Normal 800x500 Phaser remains the default; this variant is opt-in.

## Measurements

Headless Chrome 144, 1280x900 viewport, DPR 2, 50 balls, 180–360 rAF samples.
Frame times include simulation and rendering; run order varied.

| Variant | Backing store | Mean frame | Median | Notes |
| --- | ---: | ---: | ---: | --- |
| Phaser, normal | 800x500 | 84–87 ms | 83.3 ms | Blurry; CSS-upscaled |
| Phaser, DPR 2 | 1760x1100 | 105–108 ms | 100 ms | Crisp; full production visuals |
| Canvas, two-layer | 1760x1100 | 98–100 ms | 100 ms | Crisp; simple spike visuals |
| Canvas, DPR 1 | 880x550 | 83 ms | 83.3 ms | Same pixels as normal Phaser |
| Canvas, original | 1760x1100 | 97.6 ms | 100 ms | No material difference |
| Canvas, no effects | 1760x1100 | 97.2 ms | 99.9 ms | Effects are not the bottleneck |

The earlier “Canvas is slower” result compared a 4.84× larger backing store with
Phaser’s 800x500 buffer. At equal DPR-2 pixels, Canvas is roughly 5–8% faster
than Phaser in this environment.

## Interpretation

- The dominant cost is pixel fill/compositing at 1760x1100, not tier text. The
  static tile layer removed text work but did not materially change frame time.
- Canvas at DPR 1 matches normal Phaser; at DPR 2 it matches/slightly beats
  Phaser DPR 2, but neither is near 60 FPS in this headless environment.
- Phaser DPR 2 is now demonstrated to work with a camera zoom and keeps all
  production visuals (grid, health bars, gold/armored bricks, effects).
- Canvas currently lacks those production visuals; adding them would raise its
  cost. Visual parity must be measured before a renderer switch.

## Recommendation

1. **Adopt Phaser DPR 2** as the lower-risk #56 fix: it retains visuals and is
   only ~5–8% slower than the optimized Canvas at equal pixels.
2. Keep Canvas as a candidate only if bundle size becomes the priority and a
   production-parity Canvas spike stays at or below Phaser DPR 2.
3. Do not claim 60 FPS at DPR 2 from this headless data; validate on real target
   hardware.

## Reproduce

```bash
npm run build
npx vite build --config vite.canvas.config.ts --outDir dist/canvas
npx vite build --config vite.phaser-dpr2.config.ts --outDir dist/phaser-dpr2
npx vite preview --port 4173 --strictPort
npx vite preview --outDir dist/canvas --port 4174 --strictPort
npx vite preview --outDir dist/phaser-dpr2 --port 4175 --strictPort
node scripts/compare-renderers.cjs \
  http://localhost:4173/vibe-idle-bricks/ \
  http://localhost:4174/vibe-idle-bricks/ \
  http://localhost:4175/vibe-idle-bricks/
```

`scripts/compare-renderers.cjs` requires Playwright and the Chrome channel.
