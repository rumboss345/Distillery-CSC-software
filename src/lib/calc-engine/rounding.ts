/**
 * Rounding places applied at the end of a calculation. Intermediate steps
 * keep 40 decimal digits and are not rounded.
 *
 * Half up. See decimal.ts for the §30.66 rounding sentence.
 */
export const ROUNDING = {
  /** Calculated proof that is not a Table 1 tenth. */
  proof: 2,
  /** Table 1 is printed in tenths of proof. */
  table1Proof: 1,
  abv: 2,
  /**
   * Proofing water and finished blend volume. Three places keep the Table 6
   * dilution result (14.444) distinct from a two-place rounding.
   */
  wineGallons: 3,
  /**
   * Wine gallons from a weight, after dividing by pounds per gallon.
   * §30.66 rounds this to the nearest hundredth before proof gallons.
   */
  gaugedWineGallons: 2,
  /** Proof gallons, Table 3 and the §30.66 example. */
  proofGallons: 1,
  /** Pounds per wine gallon in the §30.66 example (7.40063). */
  poundsPerGallon: 5,
  specificGravity: 5,
  liters: 3,
  pounds: 2,
  kilograms: 3,
  sugarGPerL: 2,
  massPercent: 2,
  /** Recipe mass fractions and the mass each line scales to. */
  massQuantity: 6,
  /** US dollars. */
  costUsd: 2,
  /** Table 4, gallons per pound. */
  gallonsPerPound: 6,
  temperatureF: 2,
  /**
   * Contraction as a percent of the poured (pre-mix) volume.
   * The volume itself uses wineGallons or liters. Water additions use
   * wineGallons, liters, pounds, and kilograms.
   */
  contractionPercent: 2,
  /** Inventory quantities. Six places, and negative balances are allowed. */
  inventoryQuantity: 6,
} as const;

/**
 * Predicted-versus-lab flag used later at blend wizard step 6.
 * A difference above 0.5% of the predicted proof is outside tolerance.
 * Exactly 0.5% is still inside.
 */
export const LAB_DIFFERENCE_TOLERANCE = '0.005';
