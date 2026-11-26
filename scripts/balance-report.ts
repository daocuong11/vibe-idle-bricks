import {
  formatBalanceReport,
  runBalanceHarness,
} from '../src/game/model/balanceHarness.ts';

const baseline = runBalanceHarness();
console.log('=== Baseline Economy (Current Constants) ===\n');
console.log(formatBalanceReport(baseline));

const redesigned = runBalanceHarness({
  maxBalls: 100,
  prestigeMultiplier: 1.25,
  upgradeMode: 'multiplicative',
  upgradeMultBase: 1.08,
  unboundedTiers: true,
});
console.log('\n=== Redesigned Economy (Batch 6 Proposal) ===\n');
console.log(formatBalanceReport(redesigned));
