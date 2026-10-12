import { describe, expect, it } from 'vitest';
import {
  intakeAtOrBefore,
  productNameFromIntakes,
  productNamesLabel,
  type TankProductIntake,
} from './tank-product-name';

const blend = (productName: string, occurredAt = '2026-04-02 12:00:00'): TankProductIntake => ({
  kind: 'blend',
  occurredAt,
  productName,
});

describe('productNamesLabel', () => {
  it('joins distinct product names and drops blanks', () => {
    expect(productNamesLabel([' Dark Rum ', 'Gold Rum', 'Dark Rum', '', '  '])).toBe(
      'Dark Rum · Gold Rum',
    );
  });
});

describe('productNameFromIntakes', () => {
  it('uses the newest blend product name', () => {
    expect(productNameFromIntakes([
      blend('Dark Rum', '2026-04-02 12:00:00'),
      { kind: 'cut', occurredAt: '2026-04-01 08:00:00' },
    ], () => 'should not walk')).toBe('Dark Rum');
  });

  it('joins consecutive blends and stops at older spirit', () => {
    expect(productNameFromIntakes([
      blend('Gold Rum', '2026-04-03 12:00:00'),
      blend('Dark Rum', '2026-04-02 12:00:00'),
      { kind: 'cut', occurredAt: '2026-04-01 08:00:00', productName: 'Hearts' },
    ], () => null)).toBe('Gold Rum · Dark Rum');
  });

  it('does not use an older blend after a cut, stillage, or opening balance', () => {
    const olderBlend = blend('Dark Rum', '2026-03-01 12:00:00');
    expect(productNameFromIntakes([
      { kind: 'cut', occurredAt: '2026-04-01 08:00:00' },
      olderBlend,
    ], () => null)).toBeNull();
    expect(productNameFromIntakes([
      { kind: 'stillage', occurredAt: '2026-04-01 08:00:00' },
      olderBlend,
    ], () => null)).toBeNull();
    expect(productNameFromIntakes([
      { kind: 'opening', occurredAt: '2026-04-01 08:00:00' },
      olderBlend,
    ], () => null)).toBeNull();
  });

  it('follows a transfer to the source product at that time', () => {
    expect(productNameFromIntakes([
      {
        kind: 'transfer',
        occurredAt: '2026-04-04 09:00:00',
        sourceTankId: 12,
      },
      blend('Old Rum', '2026-01-01 00:00:00'),
    ], (sourceTankId, occurredAt) => {
      expect(sourceTankId).toBe(12);
      expect(occurredAt).toBe('2026-04-04 09:00:00');
      return 'Dark Rum';
    })).toBe('Dark Rum');
  });
});

describe('intakeAtOrBefore', () => {
  it('keeps intakes from the moment of a transfer and earlier', () => {
    expect(intakeAtOrBefore('2026-04-02 11:00:00', '2026-04-02 12:00:00')).toBe(true);
    expect(intakeAtOrBefore('2026-04-02 12:00:00', '2026-04-02 12:00:00')).toBe(true);
    expect(intakeAtOrBefore('2026-04-02 13:00:00', '2026-04-02 12:00:00')).toBe(false);
  });
});
