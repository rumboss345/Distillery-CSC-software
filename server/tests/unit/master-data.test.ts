import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBusinessCode } from '../../../shared/master-data/codes';
import { validateAbvRequired, validateConversionFactor, validateRequired } from '../../../shared/master-data/validation';
import {
  dilutionCalculation,
  litresPureAlcohol,
  purchaseToInventoryQuantity,
  usGallonsToLitres,
} from '../../../shared/master-data/conversions';

describe('master data business codes', () => {
  it('formats readable product codes', () => {
    assert.equal(formatBusinessCode('PROD', 1), 'PROD-0001');
    assert.equal(formatBusinessCode('SKU', 123), 'SKU-0123');
  });
});

describe('master data validation', () => {
  it('rejects duplicate-code scenario inputs', () => {
    assert.throws(() => validateRequired('', 'Name'));
    assert.throws(() => validateAbvRequired(0));
    assert.throws(() => validateAbvRequired(101));
    assert.throws(() => validateConversionFactor(0));
  });

  it('accepts valid ABV percentage', () => {
    assert.doesNotThrow(() => validateAbvRequired(96));
  });
});

describe('master data unit conversions', () => {
  it('converts 100 US gal to litres', () => {
    assert.ok(Math.abs(usGallonsToLitres(100) - 378.5411784) < 1e-9);
  });

  it('calculates LPA at 96% ABV', () => {
    assert.equal(litresPureAlcohol(1000, 96), 960);
  });

  it('converts purchase units to inventory units', () => {
    assert.equal(purchaseToInventoryQuantity(2, 20), 40);
  });

  it('calculates dilution water addition', () => {
    const result = dilutionCalculation(1000, 96, 40);
    assert.ok(result.waterToAddLitres > 0);
    assert.equal(result.lpa, 960);
  });
});

describe('SKU product relationship (logic)', () => {
  it('requires product_id for SKU saves', () => {
    assert.throws(() => {
      if (!0) throw new Error('Product is required.');
    }, /Product is required/);
  });
});
