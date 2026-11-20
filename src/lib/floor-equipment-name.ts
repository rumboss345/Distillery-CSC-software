export function normalizeFloorEquipmentName(name: string): string {
  return name.trim();
}

export function floorEquipmentNameConflictMessage(name: string): string {
  const trimmed = normalizeFloorEquipmentName(name);
  return trimmed
    ? `Equipment named "${trimmed}" already exists. Names are not case-sensitive.`
    : 'Enter an equipment name.';
}