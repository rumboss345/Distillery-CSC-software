import { US_GAL_TO_LITRES, litresPureAlcohol, litresToUsGallons, usGallonsToLitres } from '../units.js';
import { validateConversionFactor } from './validation.js';

export { US_GAL_TO_LITRES, litresPureAlcohol, litresToUsGallons, usGallonsToLitres };

/** Convert millilitres to litres. */
export function millilitresToLitres(ml: number): number {
  return ml / 1000;
}

/** Convert inventory quantity from purchase unit to inventory unit using explicit factor. */
export function purchaseToInventoryQuantity(
  purchaseQty: number,
  conversionFactor: number,
): number {
  validateConversionFactor(conversionFactor);
  return purchaseQty * conversionFactor;
}

/** Convert inventory quantity to purchase units. */
export function inventoryToPurchaseQuantity(
  inventoryQty: number,
  conversionFactor: number,
): number {
  validateConversionFactor(conversionFactor);
  return inventoryQty / conversionFactor;
}

/**
 * Dilution / proof-down: given starting volume (L) and ABV (%), target ABV (%),
 * returns { finalVolumeLitres, waterToAddLitres } assuming volume additivity.
 */
export function dilutionCalculation(
  volumeLitres: number,
  startAbvPercent: number,
  targetAbvPercent: number,
): { finalVolumeLitres: number; waterToAddLitres: number; lpa: number } {
  if (targetAbvPercent <= 0 || targetAbvPercent >= startAbvPercent) {
    throw new Error('Target ABV must be greater than zero and less than starting ABV.');
  }
  const lpa = litresPureAlcohol(volumeLitres, startAbvPercent);
  const finalVolumeLitres = lpa / (targetAbvPercent / 100);
  const waterToAddLitres = finalVolumeLitres - volumeLitres;
  return { finalVolumeLitres, waterToAddLitres, lpa };
}

/** Built-in liquid unit conversions to canonical litres. */
const TO_LITRES: Record<string, number> = {
  L: 1,
  l: 1,
  mL: 0.001,
  ml: 0.001,
  US_gal: US_GAL_TO_LITRES,
  gal: US_GAL_TO_LITRES,
};

export function convertToLitres(amount: number, unitCode: string): number {
  const factor = TO_LITRES[unitCode];
  if (factor == null) {
    throw new Error(`No liquid conversion defined for unit "${unitCode}".`);
  }
  return amount * factor;
}
