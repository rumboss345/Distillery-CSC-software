import type { BotanicalPlace, GinBotanicalInput } from '../types';
import { normalizeNutrientUnit, nutrientUnitLabel } from './wash-recipe-nutrients';

const WEIGHT_UNITS = new Set(['g', 'kg', 'lbs', 'oz']);

export function normalizeBotanicalWeightUnit(unit: string | null | undefined): string {
  const normalized = normalizeNutrientUnit(unit);
  return WEIGHT_UNITS.has(normalized) ? normalized : 'g';
}

export function normalizeBotanicalPlace(place: string | null | undefined): BotanicalPlace | null {
  const value = place?.trim().toLowerCase();
  if (value === 'pot' || value === 'basket') return value;
  return null;
}

export function botanicalPlaceLabel(place: BotanicalPlace | null | undefined): string {
  if (place === 'pot') return 'in the pot';
  if (place === 'basket') return 'in the basket';
  return '';
}

export function emptyGinBotanical(): GinBotanicalInput {
  return { name: '', amount: 0, weight: 0, weight_unit: 'g', place: null };
}

export function botanicalHasMeasure(line: GinBotanicalInput): boolean {
  return line.name.trim().length > 0 && line.weight > 0;
}

export function activeGinBotanicals(lines: GinBotanicalInput[]): GinBotanicalInput[] {
  return lines.filter(botanicalHasMeasure).map((line) => ({
    name: line.name.trim(),
    amount: 0,
    weight: line.weight,
    weight_unit: normalizeBotanicalWeightUnit(line.weight_unit),
    place: normalizeBotanicalPlace(line.place),
  }));
}

/** A named botanical still needs a pot or basket answer before it can be saved. */
export function ginBotanicalPlaceError(lines: GinBotanicalInput[]): string | null {
  const missing = activeGinBotanicals(lines).find((line) => !line.place);
  if (!missing) return null;
  return `Choose whether ${missing.name} goes in the pot or in the basket.`;
}

export function botanicalsFromRecipe(lines: GinBotanicalInput[]): GinBotanicalInput[] {
  const active = activeGinBotanicals(lines);
  return active.length > 0 ? active : [emptyGinBotanical()];
}

export function formatGinBotanicalLine(line: GinBotanicalInput): string {
  const name = line.name.trim();
  if (!(line.weight > 0)) return name;
  const weight = `${name} · ${line.weight} ${nutrientUnitLabel(line.weight_unit)}`;
  const place = botanicalPlaceLabel(normalizeBotanicalPlace(line.place));
  return place ? `${weight} · ${place}` : weight;
}

export function formatGinBotanicalsSummary(lines: GinBotanicalInput[]): string {
  const active = lines.filter(botanicalHasMeasure);
  if (active.length === 0) return '';
  return active.map(formatGinBotanicalLine).join(', ');
}
