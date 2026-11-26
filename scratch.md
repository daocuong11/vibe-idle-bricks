# Scratch: next issue batches

Working plan, last updated 2026-11-26. Issue references point at GitHub. Tick boxes as work lands; delete this file once the plan is absorbed into the epics.

## Ground rules

- One batch = one branch = one PR. Do not mix save/architecture work with balance tuning.
- Every batch: `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run build`.
- Every bug fix gets a regression test; every save change gets a legacy fixture.
- Do not tune balance against the stale text in [#50]/[#52]; both now carry status banners.
- No `any`; Decimal for every unbounded game value.

## Batch 0 — Tracker and CI hygiene (0.5 day)

Issues: [#107], [#108]; close [#51]; verify [#81].

- [x] Add `.github/workflows/ci.yml` on pull_request and push to main: npm ci, lint, typecheck, test:run, build.
- [x] Update README, AGENTS, and memory constants; point at `src/types/game.ts` and `package.json` as the source of truth.
- [x] Add `coverage/` to `.gitignore` and untrack it (`git rm -r --cached coverage`).
- [x] Close [#51] (every child is closed). Verify [#81] (text pooling and shared effect objects already shipped); close or rescope.
- [x] Keep [#28] closed; [#104] tracks the chunk regression.

Done 2026-11-26; documentation and CI only, no gameplay code changed.

Why first: protects every later batch and removes misleading constants before balance work.

## Batch 1 — Save integrity (1–2 days)

Issues: [#99].

- [x] Reject NaN and Infinity, require non-negative values, clamp prestige to `MAX_PRESTIGE_LEVEL`, clamp ball costs to a sane range.
- [x] Always write a schema version (local and export); one parse/migrate path; legacy fixture.
- [x] Guard `setItem` with try/catch plus a one-time toast; in-memory fallback.
- [x] Tests: NaN/Infinity coins, negative coins/costs, oversized prestige/tier, future version, legacy migration, quota read/write.

Done 2026-11-26; merged in PR #111. #99 closed.

Exit criteria: crafted saves cannot soft-lock or mint coins; local saves are versioned and migratable.

Why before [#86]: lifetime stats add new persisted fields.

## Batch 2 — Lifecycle, idle, and offline rate (2–3 days)

Issues: [#100], [#76], [#101].

- [x] Save on `pagehide` and on `visibilitychange` when hidden.
- [x] On visible, grant elapsed-time income through the offline path; keep the 24 h cap; do not double-count with `load()`.
- [x] Replace the 0.05 × 0.5 versus 0.1 mismatch with one model: a measured 60 s rolling rate for HUD, ETA, and offline. Revisit with simulation in Batch 5.
- [x] Tests: 5 minutes backgrounded, close/reopen, live:offline ratio.

Merged in #113 on 2026-11-26; #100/#76/#101 closed. Design:
`memory/designs/DESIGN010-lifecycle-and-measured-income.md`.

## Batch 3 — Keyboard and audio quick wins (0.5 day)

Issues: [#102], [#79].

- [x] Ignore Space/P when the event target is a button, link, summary, or `[role=button]`. Merged in #112.
- [x] Unlock the AudioContext on the first pointerdown/keydown; add a ~30 ms per-sound gate and an ~8-voice cap. Merged in #114.
- [x] Tests: focused Buy + Space does not pause; shortcut still works on body/canvas; audio unlock, cooldown, voice cap, and hook cleanup.

Both halves complete: keyboard #112 (consolidated from #109/#110), audio #114.

## Batch 4 — Rendering decision (3–5 days, spike)

Issues: [#104], [#105], [#56], [#60], [#61].

- [ ] Spike a Canvas2D renderer at DPR 2; compare 50-ball frame time, bundle size, sharpness, and code size.
- [ ] Either make the `phaser-engine` chunk real (`advancedChunks` / `codeSplitting`) or document one lazy chunk and fix the `vite.config.ts` comment.
- [ ] Decide: adopt Canvas2D, keep Phaser, or revisit. Record the decision on [#105].
- [ ] Then implement [#56] and fold [#60]/[#61] into the chosen renderer.

Why now: [#56] is blocked on Phaser 4; all visual leaves depend on this decision.

## Batch 5 — Simulation core (1–2 weeks)

Issues: [#103]; enables [#76] and [#81]. Update or close [#52] when the remaining leaves are done.

- [ ] `model/`: state, `step(state, dt)`, versioned save, seeded RNG.
- [ ] `runtime/`: fixed-step loop, 10 Hz snapshots.
- [ ] Port collision, damage, rewards, refill, targeting, and click handling; keep the renderer as an adapter.
- [ ] Tests: determinism, one-shot damage, batch damage, offline fast-forward; core coverage at least 80%.
- [ ] Move React reads to snapshots; at most 10 store writes per second.

Sequence after Batch 4 so the renderer is stable. A branch can start in parallel but should rebase before merging.

## Batch 6 — Economy redesign (1–2 weeks, design first)

Issues: [#106]; rewrite or close [#50].

- [ ] Build a headless balance harness: time-to-prestige, income by tier, cap impact, and a greedy buy strategy.
- [ ] Choose curves: exponential wall level, multiplicative upgrades, prestige currency, small base multiplier.
- [ ] Remove MAX_TIER and MAX_PRESTIGE_LEVEL, or convert them into unlocks; keep MAX_BALLS only as a performance guard.
- [ ] Document the formulas in one place; update [#50]'s body or close it.

Coordinate: land the curves before [#82]/[#83]/[#86] so content is tuned once.

## Batch 7 — Content (2–4 weeks, parallelizable)

Issues: [#66], [#85], [#82], [#83], [#86], [#84].

- [ ] [#66] achievement rewards: one-time coins or multiplier, shown in the modal and toast.
- [ ] [#85] auto-buy, batch ball purchase, run goals.
- [ ] [#82] gold and armored bricks MVP; spawn table plus in-game documentation.
- [ ] [#83] per-ball progression (levels, fusion, or targeted abilities).
- [ ] [#86] prestige tree and lifetime stats (after [#99]).
- [ ] [#84] active layer only after the lane decision: optional bonus versus core mechanic.

Do not re-plan these; they are already scoped.

## Batch 8 — Visual leaves (after Batch 4)

Issues: [#56], [#60], [#61].

- [ ] HiDPI correct at DPR 2.
- [ ] Explosion rim and transparency so bricks stay readable.
- [ ] Ball silhouette/ring/trail so type is readable in a monochrome screenshot.

## Batch 9 — Cleanup and parking lot

- [ ] Verify and close [#81] if the allocation measurement passes.
- [ ] Remove dead constants (`TRAIL_LENGTH_FACTOR`, `INITIAL_BRICKS_TO_GENERATE`) and the duplicate `FLOATING_TEXT_LIFE_MS`.
- [ ] Use `MAX_SPEED_UPGRADE` in the max_speed achievement instead of hardcoded 50.
- [ ] Delete this file once Batches 0–3 are done.

## Parallel tracks

- Correctness: 0 -> 1 -> 2 -> 3 -> 9
- Architecture: 4 -> 5
- Design: 6 -> 7
- Visuals: 4 -> 8

## Decisions needed

1. Phaser versus Canvas2D ([#104]/[#105]) — blocks [#56]/[#60]/[#61].
2. Income: measured EMA now versus simulated offline ([#101]/[#103]).
3. Prestige shape: 1.75^N versus blueprints plus a small multiplier ([#106]).
4. Active layer: optional bonus or core mechanic ([#84]).
5. Ball cap: keep 50 as a performance guard, raise it after [#103], or remove it ([#106]).

## Snapshot (2026-11-26)

- 365 tests across 31 files; 71.2% statements; `GameScene` at 0%.
- Build: index 246.5 kB (77.3 kB gz), lazy game chunk 1,434.1 kB (375.9 kB gz).
- 27 open issues. [#51] and [#81] are closure candidates. [#28] is closed; [#104] tracks the regression.

[#28]: https://github.com/deadronos/vibe-idle-bricks/issues/28
[#50]: https://github.com/deadronos/vibe-idle-bricks/issues/50
[#51]: https://github.com/deadronos/vibe-idle-bricks/issues/51
[#52]: https://github.com/deadronos/vibe-idle-bricks/issues/52
[#56]: https://github.com/deadronos/vibe-idle-bricks/issues/56
[#60]: https://github.com/deadronos/vibe-idle-bricks/issues/60
[#61]: https://github.com/deadronos/vibe-idle-bricks/issues/61
[#66]: https://github.com/deadronos/vibe-idle-bricks/issues/66
[#76]: https://github.com/deadronos/vibe-idle-bricks/issues/76
[#79]: https://github.com/deadronos/vibe-idle-bricks/issues/79
[#81]: https://github.com/deadronos/vibe-idle-bricks/issues/81
[#82]: https://github.com/deadronos/vibe-idle-bricks/issues/82
[#83]: https://github.com/deadronos/vibe-idle-bricks/issues/83
[#84]: https://github.com/deadronos/vibe-idle-bricks/issues/84
[#85]: https://github.com/deadronos/vibe-idle-bricks/issues/85
[#86]: https://github.com/deadronos/vibe-idle-bricks/issues/86
[#99]: https://github.com/deadronos/vibe-idle-bricks/issues/99
[#100]: https://github.com/deadronos/vibe-idle-bricks/issues/100
[#101]: https://github.com/deadronos/vibe-idle-bricks/issues/101
[#102]: https://github.com/deadronos/vibe-idle-bricks/issues/102
[#103]: https://github.com/deadronos/vibe-idle-bricks/issues/103
[#104]: https://github.com/deadronos/vibe-idle-bricks/issues/104
[#105]: https://github.com/deadronos/vibe-idle-bricks/issues/105
[#106]: https://github.com/deadronos/vibe-idle-bricks/issues/106
[#107]: https://github.com/deadronos/vibe-idle-bricks/issues/107
[#108]: https://github.com/deadronos/vibe-idle-bricks/issues/108
