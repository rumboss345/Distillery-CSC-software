/** Sentinel value for the “Add new …” choice inside an ingredient menu. */
export const ADD_NEW_INGREDIENT_VALUE = '__add_new_ingredient__';

/** Last option in an ingredient menu, for example “Add new sugar…”. */
export function addNewIngredientLabel(noun: string): string {
  const trimmed = noun.trim() || 'ingredient';
  return `Add new ${trimmed}…`;
}

export function isAddNewIngredientChoice(value: string): boolean {
  return value === ADD_NEW_INGREDIENT_VALUE;
}

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
