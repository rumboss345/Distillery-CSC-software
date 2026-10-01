import { describe, expect, it } from 'vitest';
import { equipmentTypeNameError, normalizeEquipmentTypeName } from './equipment-type';

describe('equipment type names', () => {
  it('collapses extra spaces', () => {
    expect(normalizeEquipmentTypeName('  Gin   basket  ')).toBe('Gin basket');
  });

  it('rejects a blank name and a built-in type', () => {
    expect(equipmentTypeNameError('   ', [])).toBe('Equipment type name is required.');
    expect(equipmentTypeNameError('fermenter', [])).toBe('Equipment type "Fermenter" already exists.');
    expect(equipmentTypeNameError('Pot Still', [])).toBe('Equipment type "Pot Still" already exists.');
    expect(equipmentTypeNameError('Pump', [])).toBe('Equipment type "Pump" already exists.');
    expect(equipmentTypeNameError('Hose', [])).toBe('Equipment type "Hose" already exists.');
  });

  it('rejects a type that was already added', () => {
    expect(equipmentTypeNameError('gin basket', ['Gin basket']))
      .toBe('Equipment type "Gin basket" already exists.');
  });

  it('accepts a new type name', () => {
    expect(equipmentTypeNameError('Thumper', ['Gin basket'])).toBeNull();
  });
});
