import {
  formatBalanceReport,
  runBalanceHarness,
} from '../src/game/model/balanceHarness.ts';

const baseline = runBalanceHarness({
  maxBalls: 50,
  prestigeMultiplier: 1.75,
  upgradeMode: 'additive',
  unboundedTiers: false,
});
console.log('=== Legacy Baseline Economy (Pre-Batch 6) ===\n');
console.log(formatBalanceReport(baseline));

const redesigned = runBalanceHarness();
console.log('\n=== Redesigned Economy (Batch 6 Live) ===\n');
console.log(formatBalanceReport(redesigned));
