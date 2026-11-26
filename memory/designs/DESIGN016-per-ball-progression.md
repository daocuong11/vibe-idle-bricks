# DESIGN016 — Per-Ball Progression (Batch 7e, #83)

Date: 2026-11-27
Issue: #83
Branch: `feat/per-ball-progression`

## EARS Requirements

- **EARS-1:** When the player buys a per-type level, the system shall spend coins using `ceil(base × 1.4^level)` and increment only that type.
- **EARS-2:** While levels are active, the system shall apply per-type damage (`1 + damagePerLevel × level`) and Fast-only speed (`1 + 0.04 × level`, capped at 3×) to the board and offline simulation.
- **EARS-3:** When a ball type is upgraded, the Shop shall show its level, damage/speed effect, next cost, and an enabled/disabled Upgrade control.
- **EARS-4:** When the player prestiges, per-type levels shall persist; a full reset shall clear them.
- **EARS-5:** When a v5 save is loaded, the system shall migrate to v6 with zeroed per-type levels and clamp crafted levels to 1,000.
- **EARS-6:** At least two distinct investments shall be viable: cheap Basic damage, Fast speed, Heavy damage, Plasma pierce, Explosive AoE, or Sniper damage.

## Design

- Definitions live in `src/types/game.ts`: `BallLevels`, base costs, per-type damage/speed gains, cost curve, and multipliers.
- `gameStore` owns `ballLevels`, `upgradeBall(type)`, and per-type getters.
- `BoardWorld` accepts per-type damage/speed maps; `BoardSimulation` refreshes them when `ballLevels` changes; the offline simulator receives the same maps.
- Shop ball rows include a second line with level/effect and an Upgrade button.
- Save v6 persists levels; v5→v6 migration defaults to zero.

## Validation

- Store tests cover cost curve, affordability, max level, prestige persistence, reset, save/import, v5 migration, and the speed cap.
- Core tests cover per-type damage and speed.
- Shop tests cover level/effect rendering and upgrade purchase.
- Full suite: 532 tests across 46 files; lint, typecheck, production build, and Canvas build pass.

## Risks / Limits

- Levels are permanent through prestige, so early investment compounds across runs.
- Per-type speed is capped at 3× to avoid physics tunneling; damage remains unbounded `Decimal`.
