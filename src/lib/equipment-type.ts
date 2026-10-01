import { EQUIPMENT_TYPES } from './equipment';

/** Trim and collapse whitespace. The saved name is what shows on the floor. */
export function normalizeEquipmentTypeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function equipmentTypeNameError(name: string, existingNames: string[]): string | null {
  const normalized = normalizeEquipmentTypeName(name);
  if (!normalized) return 'Equipment type name is required.';

  const builtin = EQUIPMENT_TYPES.find((type) => (
    type.label.localeCompare(normalized, undefined, { sensitivity: 'base' }) === 0
    || type.value.localeCompare(normalized, undefined, { sensitivity: 'base' }) === 0
  ));
  if (builtin) return `Equipment type "${builtin.label}" already exists.`;

  const duplicate = existingNames.find((existing) => (
    existing.localeCompare(normalized, undefined, { sensitivity: 'base' }) === 0
  ));
  if (duplicate) return `Equipment type "${duplicate}" already exists.`;

  return null;
}

/** Custom types can be removed when no equipment still uses them. */
export function equipmentTypeDeleteError(name: string, equipmentCount: number): string | null {
  if (equipmentCount > 0) {
    const pieces = equipmentCount === 1
      ? '1 piece of equipment'
      : `${equipmentCount} pieces of equipment`;
    return `"${name}" is used by ${pieces}. Change those before deleting this type.`;
  }
  return null;
}
