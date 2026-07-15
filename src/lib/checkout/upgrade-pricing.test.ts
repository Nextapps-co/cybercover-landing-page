import { describe, it, expect } from 'vitest';
import { computeUpgradeDueNow } from './upgrade-pricing';

describe('computeUpgradeDueNow', () => {
  it('returns the prorated amount unchanged when there is no preview discount', () => {
    // persisted discount (already in amountDueNow) or no discount → previewDiscountAmount = 0
    expect(computeUpgradeDueNow(44650, 0)).toBe(44650);
  });

  it('subtracts the preview discount from the (pre-discount) prorated amount', () => {
    // fullPrice 59400 − credit 14750 = 44650 (amountDueNow before persist); − 5000 rabat = 39650
    expect(computeUpgradeDueNow(44650, 5000)).toBe(39650);
  });

  it('clamps to 0 when the discount exceeds the prorated amount', () => {
    expect(computeUpgradeDueNow(4000, 5000)).toBe(0);
  });

  it('handles an exact-zero result', () => {
    expect(computeUpgradeDueNow(5000, 5000)).toBe(0);
  });
});
