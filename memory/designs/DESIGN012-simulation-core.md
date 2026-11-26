# DESIGN012 — Pure Board Simulation Core (Batch 5, Stages 1–2)

Date: 2026-11-26  
Branch: `feat/board-snapshots`  
Scope: pure core, store/effects adapter, 10 Hz board mirror, live renderer reads, deterministic brick setup, and tests.

## Requirements

- **EARS-1:** When the board advances, the system shall use the existing 8 ms fixed step and five-step frame clamp without consulting React, Zustand, Phaser, or browser APIs in the core.
- **EARS-2:** When identical initial worlds receive identical seeds and step sequences, the system shall produce identical balls, bricks, explosion state, and events.
- **EARS-3:** When a ball, explosion, or click damages a brick, the core shall resolve health with `Decimal` and emit reward/effect intent as data, with each destroyed brick rewarded once.
- **EARS-4:** When a seed is supplied to `BrickManager`, the system shall reproduce brick tiers, positions, stats, and entity IDs; without a seed it shall retain random production setup.
- **EARS-5:** While UI snapshots are deferred, the adapter shall preserve the existing `GameScene`/`CanvasGame` interfaces and store-driven effects.
- **EARS-6:** When the board is simulated at 60 fps, the system shall publish the board mirror to the store at most once per 100 ms, shall render from live runtime state, and shall adopt external ball/brick/explosion replacements independently.

## What moved

`src/game/model/` owns board rules:

- `rng.ts`: `RandomSource` and deterministic 32-bit LCG.
- `types.ts`: `BoardWorld` and discriminated `BoardEvent` data.
- `damage.ts`: board-ordered batched `Decimal` damage with an explicit timestamp.
- `physics.ts`: movement, wall response, velocity normalization, targeting, collision, bounce, and radius checks.
- `simulation.ts`: world creation/refresh, damage events, explosions, fixed-step advancement, explosion aging, brick lookup, click damage, and event draining.
- `index.ts`: public core surface.

`src/game/BallPhysics.ts` remains a compatibility wrapper. `BrickManager` and `generateId` accept an injected random source while retaining their zero-argument defaults.

## Adapter boundary

`src/game/BoardSimulation.ts` owns the live `BoardWorld` and exposes `getRenderState()` returning the current balls, bricks, and explosions. Stage 2 changed the boundary:

- `GameScene` and `CanvasGame` render `getRenderState()` every frame, so 60 fps motion does not depend on React or the store.
- The store board mirror is published at most once per 100 ms of wall-clock time; construction, `resize`, and every click force an immediate publication.
- `publishedBalls`, `publishedBricks`, and `publishedExplosions` track the last mirror references. Each store array is adopted independently when it was replaced externally, so a ball purchase cannot restore stale bricks that the live world has already damaged or refilled.
- Refill writes `world.bricks`; explosion events append to `world.explosions` with `life = 300 - frameDelta`. Both are render-visible immediately and reach the store on the normal cadence.
- Coins, brick-break progression, achievements, purchases, pause, prestige, saves, and errors remain immediate store writes. Rewards are not batched in this stage.

The store remains a mirror for saves and React ball counts; it is not the rendering source of truth. Reward-write batching is required if the `<=10 store writes/second` budget is interpreted beyond board publications.

## What remains coupled

- Reward/progression writes still happen per destroyed brick.
- Renderers consume live mutable arrays, not immutable versioned snapshots.
- Board state is not serialized or restored.
- Offline progression still uses the measured-income estimate, not board fast-forward.
- Brick refill/layout remains in `BrickManager`.

## Stage status

- **Stage 1 — complete:** pure core, adapter, seeded setup, deterministic tests.
- **Stage 2 — complete:** live render reads, 10 Hz board mirror, independent external adoption, immediate click/resize publication.
- **Stage 3 — complete:** versioned board save/restore (`SAVE_VERSION = 2`) with RNG seed/state, validated brick health/positions, v0/v1 migration, and fallback to fresh board generation on malformed board data.
- **Stage 4 — complete:** deterministic headless offline fast-forward (`src/game/model/offline.ts`) with bounded 60 s direct simulation + deterministic extrapolation up to `MAX_OFFLINE_SECONDS` (24h), wired into `applyIdleEarnings` for restored boards.
- **Reward-write batching — complete:** `BoardSimulation` accumulates destroyed-brick coins/counts in memory and flushes them with the 10 Hz board mirror via `applyBoardRewards` (`<= 10` total store writes/second), flushing immediately on click, resize, pause, save, export, prestige, and destroy.

## Validation

- Full suite: **468 tests across 39 files** (all passing).
- Lint, typecheck (`tsc -b`), and production build (`vite build`) pass.
