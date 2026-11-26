# DESIGN010 — Lifecycle and measured income (#100, #76, #101)

## Requirements

- The app shall save progress on `pagehide` and whenever the document becomes
  hidden.
- When the document becomes visible after at least 60 seconds, the app shall
  grant idle income once for that hidden interval.
- Idle income shall use the same live production rate as the Stats and Shop
  displays, with a 24-hour cap and the existing 50% offline rate.
- Before gameplay samples exist, live income shall fall back to nominal
  production multiplied by `LIVE_INCOME_CALIBRATION`.
- Loading, importing, resetting, and prestiging shall clear old live samples.

## Design

`useLifecyclePersistence` owns only browser events. It saves and records the
hidden timestamp and the current live rate on `visibilitychange`, clears both
before handling a visible transition, and calls the store's shared
`applyIdleEarnings(seconds, rate)` only when the interval reaches 60 seconds.
The rate snapshot matters because the 60-second tracker is pruned while the tab
is hidden. `pagehide` saves but does not grant income. Listener cleanup follows
React's effect lifecycle.

`src/store/earnings.ts` retains positive coin credits reported after prestige
bonuses. The measured rate is their sum over a rolling 60-second window divided
by 60 seconds. Idle grants are deliberately not recorded as gameplay samples.

The store chooses the rate once:

```text
measured = positive actual coin credits in the last 60 seconds / 60
live     = measured, when positive; otherwise nominal * 0.1
idle     = live * clamp(elapsed seconds, 0, 86400) * 0.5
```

`calculateOfflineEarnings(liveIncomePerSecond, offlineSeconds)` performs the
elapsed clamp and offline multiplier. Both `load()` and the visibility hook call
`applyIdleEarnings`, which updates coins, the welcome-back message, and the save
timestamp together. Saving after that action prevents the same interval from
being applied again. The tracker is in memory only, so the save schema does not
change.

Stats and Shop call the shared getter during render rather than maintaining a
second income calculation or timer. Their existing coin/store subscriptions
keep measured values current as coins are credited.

## Validation

- Rolling window expiry/reset and one-time offline multiplier.
- Measured-rate precedence, prestige-adjusted credits, 24-hour cap, and tracker
  reset boundaries.
- Hidden/pagehide saves, 59-second no-op, exact 60-second grant, five-minute
  grant, repeated visible events, and listener cleanup.
- Existing load/import tests cover close-and-reopen behavior; UI tests cover
  the same measured rate in Stats and Shop ETA.
- `npm run lint`, `npm run typecheck`, `npm run test:run`, and `npm run build`.

## Deferred

The fixed 60-second denominator makes a single recent coin event a temporarily
low rate until the window fills. This is the intended rolling measurement for
the current game loop; Batch 5's simulation can compare it with a simulated
production model before further balance tuning.
