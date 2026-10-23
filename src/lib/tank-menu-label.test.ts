import { describe, expect, it } from 'vitest';
import { formatTankMenuLabel, preferContentsSummary } from './tank-menu-label';

describe('formatTankMenuLabel', () => {
  it('names what is in the tank and its proof, and leaves the gallons off the menu', () => {
    expect(formatTankMenuLabel('Hearts tank', 'Hearts from LW-4 (spirit run)', 75.2)).toBe(
      'Hearts tank — Hearts from LW-4 (spirit run) · 75.2% ABV',
    );
  });

  it('includes the gallons available when product is being moved', () => {
    expect(formatTankMenuLabel('Latina 500L', 'Low Wine Run · Heads', 78, 3.4)).toBe(
      'Latina 500L — Low Wine Run · Heads · 78.0% ABV · 3.4 gal available',
    );
  });

  it('names the contents when no proof is known', () => {
    expect(formatTankMenuLabel('Hearts tank', 'Hearts from LW-4 (spirit run)')).toBe(
      'Hearts tank — Hearts from LW-4 (spirit run)',
    );
  });

  it('keeps a gauge reading from hiding the liquid already in the tank', () => {
    expect(preferContentsSummary(null, [
      { kind: 'opening', summary: 'On hand' },
      { kind: 'cut', summary: 'Low Wine Run · Heads from D-2025-001' },
    ], 'heads')).toBe('Low Wine Run · Heads from D-2025-001');
  });

  it('keeps an on-hand reading when that is the only record', () => {
    expect(preferContentsSummary(null, [
      { kind: 'opening', summary: 'On hand' },
    ], null)).toBe('On hand');
  });

  it('says a tank is empty without a capacity', () => {
    expect(formatTankMenuLabel('Tails tank', null)).toBe('Tails tank (empty)');
    expect(formatTankMenuLabel('Tails tank', '  ')).toBe('Tails tank (empty)');
  });
});