/** Trim an ingredient name, or explain why it cannot be saved. */
export function preparedIngredientName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Enter an ingredient name.');
  }
  return trimmed;
}

/** True when this name is already in the list, ignoring case and surrounding spaces. */
export function inventoryNameExists(names: string[], name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;
  return names.some((existing) => existing.trim().toLowerCase() === trimmed);
}
