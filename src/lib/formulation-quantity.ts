import { GRAMS_PER_POUND } from './material-densities';

/** Shown when an ingredient has no verified density and no explicit assumption. */
export const DENSITY_NOT_VERIFIED = 'DENSITY NOT VERIFIED';

export const VOLUME_LABEL_TARGET = 'TARGET BATCH VOLUME';
export const VOLUME_LABEL_PREDICTED = 'PREDICTED FINISHED VOLUME';
export const VOLUME_LABEL_MEASURED = 'ACTUAL/MEASURED FINISHED VOLUME';

export const PREDICTED_VOLUME_ESTIMATE_NOTE =
  'Predicted finished volume is an estimate when sugar, syrup, flavor, or color is present. It is not a laboratory measurement. Raw ingredient volumes do not have to add up to the finished volume.';

export const MEASURED_VOLUME_AUTHORITY_NOTE =
  'Actual measured tank volume is authoritative once it is entered. It does not change the original recipe charges.';

/**
 * Estimated sugar/Brix from (sugar pounds × 10) / finished gallons.
 * Not a laboratory °Brix and not a regulatory strength.
 */
export const ESTIMATED_SUGAR_BRIX_LABEL = 'Estimated sugar/Brix';

export const ESTIMATED_SUGAR_BRIX_NOTE =
  'Estimated sugar/Brix is (sugar pounds × 10) / finished gallons. It is not true °Brix and it is not used for regulatory or laboratory strength.';

export type FinishedVolumeBasis = 'predicted' | 'measured';

export function finishedVolumeBasisLabel(basis: FinishedVolumeBasis): string {
  return basis === 'measured' ? VOLUME_LABEL_MEASURED : VOLUME_LABEL_PREDICTED;
}

/**
 * Gallons for display. Quantities below 1 US gallon keep at least 3 decimal places
 * so 0.0364 gal is not shown as 0.1 gal. This string is display-only.
 */
export function formatGallonDisplay(gallons: number): string {
  if (!Number.isFinite(gallons)) return '';
  const abs = Math.abs(gallons);
  if (abs === 0) return '0';
  if (abs < 1) {
    const trimmed = gallons.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    const decimals = trimmed.includes('.') ? trimmed.split('.')[1].length : 0;
    return decimals < 3 ? gallons.toFixed(3) : trimmed;
  }
  return gallons.toFixed(2);
}

/** Display rounding for a measured quantity. Never pass the result back into a calculation. */
export function formatQuantityDisplay(value: number, placesBelowOne = 3): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs < 1) {
    const digits = Math.max(placesBelowOne, 4);
    const trimmed = value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
    const decimals = trimmed.includes('.') ? trimmed.split('.')[1].length : 0;
    return decimals < placesBelowOne ? value.toFixed(placesBelowOne) : trimmed;
  }
  return abs >= 100 ? value.toFixed(1) : value.toFixed(2);
}

export function formatAbvDisplay(abv: number): string {
  if (!Number.isFinite(abv)) return '';
  return `${abv.toFixed(2)}%`;
}

export interface PerLiterLine {
  name: string;
  grams: number;
  gramsPerLiter: number | null;
}

export interface PerLiterView {
  basis: FinishedVolumeBasis;
  basisLabel: string;
  finishedLiters: number;
  lines: PerLiterLine[];
  note: string;
}

/**
 * ingredient g/L = ingredient grams / defined finished liters.
 * The denominator is the predicted finished volume or the measured finished volume.
 * Ratios are not changed to force raw ingredient mL/L to 1000.
 */
export function perLiterView(
  lines: { name: string; grams: number }[],
  finishedLiters: number,
  basis: FinishedVolumeBasis,
): PerLiterView {
  const usable = finishedLiters > 0;
  return {
    basis,
    basisLabel: finishedVolumeBasisLabel(basis),
    finishedLiters,
    lines: lines.map((line) => ({
      name: line.name,
      grams: line.grams,
      gramsPerLiter: usable ? line.grams / finishedLiters : null,
    })),
    note: `Ingredient grams per liter use the ${finishedVolumeBasisLabel(basis).toLowerCase()} as the denominator. Raw ingredient volumes are not adjusted to total 1000 mL.`,
  };
}

export function gramsFromPounds(pounds: number): number {
  if (!(pounds > 0)) return 0;
  return pounds * GRAMS_PER_POUND;
}
