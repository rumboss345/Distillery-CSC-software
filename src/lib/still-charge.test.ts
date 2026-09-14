import { describe, expect, it } from 'vitest';
import { chargeExceedsStillCapacity, stillChargeCapacityMessage } from './still-charge';

describe('still-charge', () => {
  it('detects charge volume over still capacity', () => {
    expect(chargeExceedsStillCapacity(200, 200)).toBe(false);
    expect(chargeExceedsStillCapacity(200.1, 200)).toBe(true);
    expect(chargeExceedsStillCapacity(50, 0)).toBe(false);
    expect(chargeExceedsStillCapacity(0, 200)).toBe(false);
  });

  it('formats capacity error message', () => {
    expect(stillChargeCapacityMessage(250, 'Pot Still #1', 200)).toBe(
      'Charge volume (250 gal) exceeds Pot Still #1 capacity (200 gal).',
    );
  });
});
