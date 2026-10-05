import type { GinBotanicalInput } from '../types';
import { normalizeNutrientUnit, nutrientUnitLabel } from './wash-recipe-nutrients';

const WEIGHT_UNITS = new Set(['g', 'kg', 'lbs', 'oz']);

export function normalizeBotanicalWeightUnit(unit: string | null | undefined): string {
  const normalized = normalizeNutrientUnit(unit);
  return WEIGHT_UNITS.has(normalized) ? normalized : 'g';
}

export function emptyGinBotanical(): GinBotanicalInput {
  return { name: '', amount: 0, weight: 0, weight_unit: 'g' };
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
  }));
}

export function botanicalsFromRecipe(lines: GinBotanicalInput[]): GinBotanicalInput[] {
  const active = activeGinBotanicals(lines);
  return active.length > 0 ? active : [emptyGinBotanical()];
}

export function formatGinBotanicalLine(line: GinBotanicalInput): string {
  const name = line.name.trim();
  if (!(line.weight > 0)) return name;
  return `${name} · ${line.weight} ${nutrientUnitLabel(line.weight_unit)}`;
}

export function formatGinBotanicalsSummary(lines: GinBotanicalInput[]): string {
  const active = lines.filter(botanicalHasMeasure);
  if (active.length === 0) return '';
  return active.map(formatGinBotanicalLine).join(', ');
}
