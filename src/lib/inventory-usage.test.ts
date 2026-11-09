import { describe, expect, it } from 'vitest';
import {
  formatInventoryUsageDelta,
  inventoryUsageDescription,
  inventoryUsageKindLabel,
} from './inventory-usage';

describe('inventory usage display', () => {
  it('formats positive and negative deltas', () => {
    expect(formatInventoryUsageDelta(12.5, 'lbs')).toBe('+12.5 lbs');
    expect(formatInventoryUsageDelta(-3, 'ea')).toBe('-3 ea');
  });

  it('builds a readable description', () => {
    expect(
      inventoryUsageDescription({
        id: 1,
        inventory_item_id: 2,
        delta: -5,
        balance_after: 10,
        source_kind: 'bottling',
        source_ref: 'BT-2026-001',
        summary: 'Bottles used',
        changed_by: 'Alex',
        created_at: '2026-01-15T12:00:00Z',
      }),
    ).toBe('Bottles used · BT-2026-001');
  });

  it('labels known usage kinds', () => {
    expect(inventoryUsageKindLabel('wash')).toBe('Wash / fermentation');
    expect(inventoryUsageKindLabel('unknown')).toBe('Stock change');
  });
});
