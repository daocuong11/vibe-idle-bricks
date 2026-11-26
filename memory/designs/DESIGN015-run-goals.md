# DESIGN015 — Run Goals (Batch 7d)

Date: 2026-11-27
Issue: #85 (final piece; offline multiplier is covered by the Insight prestige node)
Branch: `feat/run-goals`

## EARS Requirements

- **EARS-1:** When the current run crosses 100, 500, or 1,000 bricks, the system shall award 1/2/3 Blueprints respectively, once per run.
- **EARS-2:** When a goal is claimed, the system shall expose it in a toast and mark it claimed in the Stats panel.
- **EARS-3:** When the player prestiges or performs a full reset, the system shall clear run-goal claims so the next run can earn them again.
- **EARS-4:** When a v4 or older save is loaded, the system shall migrate to v5 with no claimed run goals.
- **EARS-5:** When the same save is reloaded, claimed run goals shall not award Blueprints again.
- **EARS-6:** When run goals are ignored, normal idle progression shall be unchanged.

## Design

- Definitions and thresholds live in `src/types/game.ts` (`RUN_GOALS`).
- `gameStore` owns `claimedRunGoals` and `pendingRunGoalUnlocks`; a helper awards crossed, unclaimed goals exactly once.
- Claims are applied in the batched `applyBoardRewards` path, the legacy brick increment path, and deterministic offline earnings.
- Stats renders progress bars, thresholds, reward amounts, and claimed state.
- `useRunGoalToasts` drains a small toast queue; claims persist in save v5.

## Validation

- Store tests cover thresholds, duplicate prevention, prestige reset, save/import, v4 migration, and queue draining.
- Stats and toast tests cover visibility and feedback.
- Full suite: 525 tests across 45 files; lint, typecheck, production build, and Canvas build pass.

## Risks / Limits

- Reward values are intentionally modest; balance can be tuned in `RUN_GOALS`.
- Claims are per-run and reset on prestige; they are not lifetime achievements.
