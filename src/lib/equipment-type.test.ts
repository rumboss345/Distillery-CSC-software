import { describe, expect, it } from 'vitest';
import { equipmentTypeDeleteError, equipmentTypeNameError, normalizeEquipmentTypeName } from './equipment-type';

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
    expect(equipmentTypeNameError('Stillage Tank', [])).toBe('Equipment type "Stillage Tank" already exists.');
  });

  it('rejects a type that was already added', () => {
    expect(equipmentTypeNameError('gin basket', ['Gin basket']))
      .toBe('Equipment type "Gin basket" already exists.');
  });

  it('accepts a new type name', () => {
    expect(equipmentTypeNameError('Thumper', ['Gin basket'])).toBeNull();
  });

  it('blocks deleting a type that equipment still uses', () => {
    expect(equipmentTypeDeleteError('Thumper', 0)).toBeNull();
    expect(equipmentTypeDeleteError('Thumper', 1)).toBe(
      '"Thumper" is used by 1 piece of equipment. Change those before deleting this type.',
    );
    expect(equipmentTypeDeleteError('Gin basket', 3)).toMatch(/3 pieces of equipment/);
  });
});
