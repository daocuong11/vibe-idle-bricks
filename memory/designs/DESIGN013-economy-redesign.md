# DESIGN013 — Economy Redesign & Headless Balance Harness (Batch 6)

Date: 2026-11-26  
Issues: `#106` (supersedes `#50`)  
Source of truth: `src/types/game.ts`, `src/store/gameStore.ts`, `src/store/earnings.ts`, `src/game/model/balanceHarness.ts`

## Requirements

- **EARS-1:** When brick tiers exceed 20, the system shall scale brick health and coin value with unbounded `Decimal` exponential curves (`1.18^(tier - 20)` health vs. `1.12^(tier - 20)` value) so late-run progression creates a natural wall without hard tier caps.
- **EARS-2:** When upgrading `damage` or `coinMult`, the system shall apply multiplicative scaling (`1.08^level` as `Decimal`); when upgrading `speed`, the system shall keep additive scaling (`1 + 0.1 * level`) capped at `MAX_SPEED_UPGRADE = 50` to prevent physics tunneling.
- **EARS-3:** When prestiging (`bricksBroken >= PRESTIGE_THRESHOLD`), the system shall award persistent **Blueprints** (`Decimal`) alongside a smaller unbounded prestige multiplier (`1.25^prestigeLevel` as `Decimal`), setting up Batch 7's prestige tree (`#86`).
- **EARS-4:** When evaluating ball purchases or hydrating saves, the system shall enforce `MAX_BALLS = 100` as a performance guard, with no hard `MAX_TIER` or `MAX_PRESTIGE_LEVEL` caps.
- **EARS-5:** When migrating v0/v1/v2 saves to `SAVE_VERSION = 3`, the system shall default missing `blueprints` to `'0'` and reject non-finite or negative values safely.

## Authoritative Economy Formulas

| Mechanic | Formula | Notes |
| --- | --- | --- |
| Tier progression | `tier = 1 + floor(bricksBroken / 100)` | Unbounded (`calculateTierForBricks`), no `MAX_TIER` cap |
| Brick health (`tier <= 20`) | `3 * (1 + 0.25 * (tier - 1))` | Smooth early curve (3 → 17.25) |
| Brick health (`tier > 20`) | `17.25 * 1.18^(tier - 20)` | Unbounded `Decimal` exponential wall |
| Brick value (`tier <= 20`) | `floor(tier^1.6)` | Smooth early curve (1 → 120) |
| Brick value (`tier > 20`) | `floor(120 * 1.12^(tier - 20))` | Slower exponential growth than health |
| Damage upgrade | `1.08^level` (`Decimal`) | Multiplicative (`UPGRADE_MULT_BASE = 1.08`), combined with prestige multiplier |
| Coin multiplier upgrade | `1.08^level` (`Decimal`) | Multiplicative (`UPGRADE_MULT_BASE = 1.08`) |
| Speed upgrade | `1 + 0.1 * level` | Additive, capped at `MAX_SPEED_UPGRADE = 50` (6× speed) |
| Upgrade costs | `baseCost * 1.10^level` (ceil) | Base costs: speed 50, damage 75, coinMult 100 |
| Ball costs | `baseCost * 1.15^count` (ceil) | `MAX_BALLS = 100` performance guard |
| Prestige multiplier | `1.25^prestigeLevel` (`Decimal`) | Unbounded (`PRESTIGE_MULTIPLIER = 1.25`), applies to damage and coin income |
| Blueprints earned on prestige | `floor(sqrt(bricksBroken / 10000) * (1 + currentTier * 0.05))` (min `1`) | Awarded when `bricksBroken >= 10000`; persists across prestige (`blueprints` in save v3) |
| Offline earnings | `50%` (`OFFLINE_EARNINGS_RATE = 0.5`), capped at 24h | Uses deterministic board fast-forward (`simulateOfflineBoard`) for restored boards |

## Headless Balance Harness (`scripts/balance-report.ts`)

`src/game/model/balanceHarness.ts` simulates a full run with a greedy ROI/payback buyer across balls and upgrades:

- **Pre-Batch 6 Baseline** (`maxBalls=50`, `additive`, `maxTier=20`, `prestigeMult=1.75`):
  - Time to Prestige: `16m 9s`, capped at Tier `20`, `50/50` balls, `speed=50, damage=12, coinMult=95`, Final Income/s `24,488`.
  - Uncapping tiers under additive upgrades stalls at Tier `85` (never reaches prestige in 24h).
- **Batch 6 Live Economy** (`maxBalls=100`, `multiplicative 1.08^L`, unbounded tiers with `1.18^t / 1.12^t` wall, `prestigeMult=1.25`):
  - Time to Prestige: `12m 9s`, Final Tier `101`, `100/100` balls, `speed=50, damage=178, coinMult=653`, Final Income/s `2.37e+29`.
  - Multiplicative upgrades cleanly overcome the post-Tier-20 exponential wall while keeping `speed` safely capped at 50.

## Issue #50 / #106 Follow-up

- `#106` is complete with this design and implementation.
- `#50` can be closed with a link to this document and `src/types/game.ts` as the single formula reference.

## Validation

- Full suite: **483 tests across 40 files** (all passing).
- Lint (`eslint .`), typecheck (`tsc -b`), and production build (`vite build`) pass.
