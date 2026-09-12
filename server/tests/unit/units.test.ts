import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { US_GAL_TO_LITRES, usGallonsToLitres, litresPureAlcohol } from '../../../shared/units.js';

describe('US gallon → litre conversion', () => {
  it('uses exact CSC conversion factor', () => {
    assert.equal(US_GAL_TO_LITRES, 3.785411784);
  });

  it('converts 100 US gal to 378.5411784 L', () => {
    const litres = usGallonsToLitres(100);
    assert.ok(Math.abs(litres - 378.5411784) < 1e-9);
  });

  it('computes LPA from litres and ABV percentage', () => {
    assert.equal(litresPureAlcohol(100, 40), 40);
  });
});
