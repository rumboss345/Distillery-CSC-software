import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertAbvPercent, ABV_MIN, ABV_MAX, HISTORICAL_GALLON_UNIT } from '../../../shared/conventions.js';

describe('ABV conventions', () => {
  it('accepts 0–100 percentage', () => {
    assert.doesNotThrow(() => assertAbvPercent(0));
    assert.doesNotThrow(() => assertAbvPercent(40));
    assert.doesNotThrow(() => assertAbvPercent(100));
  });

  it('rejects values outside 0–100 (e.g. decimal-fraction mistakes like storing 1.5 for 150%)', () => {
    assert.throws(() => assertAbvPercent(150));
  });

  it('rejects out-of-range ABV', () => {
    assert.throws(() => assertAbvPercent(-1));
    assert.throws(() => assertAbvPercent(101));
  });

  it('documents US liquid gallons for historical fields', () => {
    assert.equal(HISTORICAL_GALLON_UNIT, 'US_liquid_gallon');
  });

  it('defines ABV bounds', () => {
    assert.equal(ABV_MIN, 0);
    assert.equal(ABV_MAX, 100);
  });
});
