import { describe, expect, it } from 'vitest';
import { packagingBottleOptions, packagingSizeMlFromText } from './packaging-bottles';

describe('packaging bottle options', () => {
  it('reads milliliters from a name or note', () => {
    expect(packagingSizeMlFromText('500 ml bottle')).toBe(500);
    expect(packagingSizeMlFromText('500mL Test Bottle')).toBe(500);
    expect(packagingSizeMlFromText('1L Flask')).toBe(1000);
    expect(packagingSizeMlFromText('corks')).toBeNull();
  });

  it('adds packaging inventory bottles that are not on the standard list', () => {
    const options = packagingBottleOptions([
      { name: '750mL 7F', notes: '750 ml bottle' },
      { name: '500mL Test Bottle', notes: '' },
      { name: '  House Decanter  ', notes: '700 ml bottle' },
      { name: '500mL Test Bottle', notes: 'duplicate' },
    ]);
    const names = options.map((bottle) => bottle.name);
    expect(names.filter((name) => name === '750mL 7F')).toHaveLength(1);
    expect(names).toContain('500mL Test Bottle');
    expect(names).toContain('House Decanter');
    expect(options.find((bottle) => bottle.name === '500mL Test Bottle')?.sizeMl).toBe(500);
    expect(options.find((bottle) => bottle.name === 'House Decanter')?.sizeMl).toBe(700);
    expect(names.indexOf('750mL 7F')).toBeLessThan(names.indexOf('500mL Test Bottle'));
  });
});
