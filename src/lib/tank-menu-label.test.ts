import { describe, expect, it } from 'vitest';
import { formatTankMenuLabel } from './tank-menu-label';

describe('formatTankMenuLabel', () => {
  it('names what is in the tank and its proof, and leaves the gallons off the menu', () => {
    expect(formatTankMenuLabel('Hearts tank', 'Hearts from LW-4 (spirit run)', 75.2)).toBe(
      'Hearts tank — Hearts from LW-4 (spirit run) · 75.2% ABV',
    );
  });

  it('names the contents when no proof is known', () => {
    expect(formatTankMenuLabel('Hearts tank', 'Hearts from LW-4 (spirit run)')).toBe(
      'Hearts tank — Hearts from LW-4 (spirit run)',
    );
  });

  it('says a tank is empty without a capacity', () => {
    expect(formatTankMenuLabel('Tails tank', null)).toBe('Tails tank (empty)');
    expect(formatTankMenuLabel('Tails tank', '  ')).toBe('Tails tank (empty)');
  });
});