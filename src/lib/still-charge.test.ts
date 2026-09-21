import { describe, expect, it } from 'vitest';
import {
  chargeExceedsStillCapacity,
  stillAlreadyOccupiedMessage,
  stillChargeCapacityMessage,
} from './still-charge';

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

  it('formats still occupied error message', () => {
    expect(stillAlreadyOccupiedMessage('Vendome', 'D-2026-001', 'running', 800)).toBe(
      'Vendome is already in use by run D-2026-001 (running) with 800.0 gal charged. Complete that run or choose another still before charging again.',
    );
  });
});
