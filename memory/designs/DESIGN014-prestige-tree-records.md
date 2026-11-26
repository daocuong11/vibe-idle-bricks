# DESIGN014 — Prestige Tree & Lifetime Records (Issue #86)

Date: 2026-11-26
Branch: `feat/prestige-tree`
Scope: GitHub issue #86 only; no additional progression systems.

## EARS Requirements

- **EARS-1:** When the player buys a permanent prestige node, the system shall spend Blueprints using `ceil(baseCost × 1.6^currentLevel)`, increment that node without a hard cap, and preserve it through prestige.
- **EARS-2:** While a node level is active, the system shall multiply damage (`might`), live and simulated coin income (`fortune`), or idle/offline income (`insight`) by `1.1^level` using `Decimal`.
- **EARS-3:** When a prestige purchase is unaffordable, the system shall reject it without changing Blueprints or node levels.
- **EARS-4:** When the player performs a full reset, the system shall clear prestige nodes and lifetime records along with existing progress.
- **EARS-5:** When gameplay or idle earnings credit coins, the system shall add the credited amount to `lifetimeCoins`; imported starting balances shall not be counted.
- **EARS-6:** When the run tier advances, the system shall raise `bestTier` without lowering it on prestige.
- **EARS-7:** When the game saves, the system shall accumulate bounded active-session elapsed time into `playTimeMs`; long offline gaps shall not inflate the record.
- **EARS-8:** When a v0–v3 save is loaded or imported, the system shall migrate to v4 with zeroed prestige nodes/lifetime coins/play time and `bestTier = currentTier` (or 1), preserving the board snapshot and Blueprints.
- **EARS-9:** When the Records dialog is open, the system shall expose lifetime coins, total bricks, best/current tier, run bricks, prestiges, Blueprints, and formatted play time through the shared accessible modal.
- **EARS-10:** When the Prestige shop tab is open, the system shall expose Blueprints and all three node levels, current effects, next costs, and enabled/disabled Buy controls without nested interactive elements.

## Design

- Extend `src/types/game.ts` with `PrestigeUpgradeType`, `PrestigeUpgrades`, node definitions, cost/effect helpers, and save fields.
- Extend `src/store/gameStore.ts` with `prestigeUpgrades`, `lifetimeCoins`, `bestTier`, `playTimeMs`, and `buyPrestigeUpgrade(type)`.
- Use existing store getters for live damage/coin multipliers. Board rewards already include `getCoinMult()` in `BoardSimulation`, so `applyBoardRewards` continues applying only the prestige bonus before crediting lifetime coins.
- Apply Insight after both offline paths calculate coins. Fortune flows through `getCoinMult()` into live board/offline simulation, and measured live rate already reflects credited coins.
- Track a module-level last-save timestamp and cap each save delta at 60 seconds (the auto-save cadence); reset the tracker on load/import/reset and after idle grants.
- Add `RecordsModal.tsx` and wire a Footer button; add node cards to the existing Prestige tab.
- Bump `SAVE_VERSION` to 4 and extend the existing migration chain.

## Validation

- Focused tests for cost curves, purchases, all three effects, lifetime records, playtime bounds, migration/malformed values, Shop UI, and Records modal.
- Existing suite plus lint, typecheck, production build, and Canvas Vite build.

## Constraints / Risks

- No new dependencies, no `any`, unbounded economy values remain `Decimal`.
- Playtime is save-bound and intentionally approximate; background/offline time is not counted, and gaps longer than 60 seconds are truncated.
- Reviewed in the working tree, then integrated via the feature branch/PR.
