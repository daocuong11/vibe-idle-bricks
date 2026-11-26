# DESIGN012 — Pure Board Simulation Core (Batch 5, Stage 1)

Date: 2026-11-26  
Branch: `feat/simulation-core`  
Scope: pure core, platform adapter, deterministic brick setup, and tests only.

## Requirements

- **EARS-1:** When the board advances, the system shall use the existing 8 ms fixed step and five-step frame clamp without consulting React, Zustand, Phaser, or browser APIs.
- **EARS-2:** When identical initial worlds receive identical seeds and step sequences, the system shall produce identical balls, bricks, explosion state, and events.
- **EARS-3:** When a ball, explosion, or click damages a brick, the core shall resolve health with `Decimal` and emit reward/effect intent as data, with each destroyed brick rewarded once.
- **EARS-4:** When a seed is supplied to `BrickManager`, the system shall reproduce brick tiers, positions, stats, and entity IDs; without a seed it shall retain random production setup.
- **EARS-5:** While UI snapshots are deferred, the adapter shall preserve the existing `GameScene`/`CanvasGame` interfaces and store-driven effects without claiming a store-write budget has been met.

## What moved

`src/game/model/` now owns board rules:

- `src/game/model/rng.ts`: `RandomSource { next(): number }` and deterministic 32-bit LCG `createSeededRandom(seed)`.
- `src/game/model/types.ts`: `BoardWorld` and discriminated `BoardEvent` data. The world contains balls, bricks, explosions, multipliers, accumulator, explicit time, spatial index, cached target, and pending events.
- `src/game/model/damage.ts`: `resolveBrickDamageBatch(bricks, operations, now = 0)`, aggregating duplicate damage IDs and returning board-ordered results. `src/store/gameStore.ts` delegates to this function and supplies the render timestamp.
- `src/game/model/physics.ts`: movement, wall response, velocity normalization, target seeking, weakest-brick selection, circle/brick collision, bounce, and explosion-distance checks.
- `src/game/model/simulation.ts`: world creation/refresh, batched damage events, ball collisions, explosions, targeting, fixed-step advancement, explosion aging, brick lookup, click damage, and event draining.
- `src/game/model/index.ts`: public core surface.

`src/game/BallPhysics.ts` remains as a compatibility wrapper over the extracted physics functions. `src/game/BrickManager.ts` defaults to `{ next: Math.random }` outside the core; both tier variation and `generateId(random)` use it. `src/utils/helpers.ts` preserves its zero-argument default while allowing an injected ID source.

## Adapter boundary

`src/game/BoardSimulation.ts` keeps its constructor, `resize`, `step`, `findBrickAt`, and `handleBrickClick` surface. It synchronizes the store into `BoardWorld`, supplies `performance.now()` as the visual clock, delegates rules, commits board arrays, and translates events into:

- coin and brick-break progression through existing store actions;
- ball/brick sounds;
- floating text and particle effects;
- screen shake and explosion effects;
- post-frame minimum-brick refill and spatial-index refresh.

The core mutates its passed world for performance but performs no I/O. Adapter pause, refill tier, prestige coin bonus, achievements, audio, and renderer effects remain outside it.

## What remains coupled

- `BoardSimulation` still reads and writes Zustand on every frame and per reward event.
- Shop/upgrade/prestige actions still mutate the same store.
- Phaser and Canvas renderers still consume store arrays rather than immutable snapshots.
- Brick refill/layout remains in `BrickManager`; only its randomness is injectable.
- Board state is not yet serialized or restored.
- Offline progression still uses the measured-income estimate, not board fast-forward.

**The store-write budget is not solved in Stage 1.** Extracting rules does not reduce frame-by-frame store notifications.

## Staged follow-up

### Stage 2 — 10 Hz UI snapshot bus

1. Define a versioned immutable snapshot containing balls, bricks, explosions, and visual timestamps.
2. Let the adapter publish at most one snapshot every 100 ms; keep fixed-step simulation at 8 ms.
3. Move renderer reads to snapshots. Keep immediate store writes for purchases, pause, prestige, saves, achievements, and error state.
4. Coalesce transient audio/particles/float requests by frame without delaying rewards.
5. Add notification-count tests proving a sustained frame burst produces no more than ten board publications per second. Do not apply this cadence to the save timer.

### Stage 3 — board save/restore

1. Extend the versioned save schema with seed, board identity/version, balls, brick IDs/tiers/health/positions, and explosion state.
2. Validate every field and define a safe migration/default for missing board data.
3. Rehydrate through the core and rebuild the spatial index/target cache.
4. Test malformed, old, and round-tripped saves without changing existing economy fields.

### Stage 4 — deterministic offline fast-forward

1. Capture seed, initial board, upgrades, elapsed time, and the last fixed-step accumulator at hide/save.
2. Advance the same core in bounded batches using explicit time; no rendering, audio, or store writes inside the loop.
3. Apply net rewards/progression once and cap work/time using the existing offline policy.
4. Test identical checkpoints and elapsed durations for identical outcomes, including pause, large gaps, and multi-tier brick generation.

## Validation

Focused Stage 1 suite: 139 tests passed across five files. Core coverage: **99.41% statements (170/171), 100% lines/functions, 87.34% branches**. Full suite: 444 tests across 37 files. Lint, typecheck, production build, and Canvas build pass. Generated `coverage/` artifacts were removed before the final lint run.
