export function normalizeFloorEquipmentName(name: string): string {
  return name.trim();
}

export function floorEquipmentNameConflictMessage(name: string): string {
  const trimmed = normalizeFloorEquipmentName(name);
  return trimmed
    ? `Equipment named "${trimmed}" already exists.`
    : 'Enter an equipment name.';
}