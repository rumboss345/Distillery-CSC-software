/**
 * Cited factors. These are the printed figures, not fitted coefficients.
 */

/** 27 CFR §30.41. Wine gallons of water per pound at 60 °F. */
export const TTB_WATER_WINE_GALLONS_PER_POUND = '0.120074';

/**
 * Pounds of water per wine gallon used by the Table 6 weight example in
 * 27 CFR §30.66 ("8.32823 by 0.88862"). This is the figure that example
 * multiplies. It is not the unrounded reciprocal of 0.120074
 * (that reciprocal is 8.3281976…, which rounds to 8.32820).
 */
export const TTB_WATER_POUNDS_PER_GALLON_TABLE6 = '8.32823';

/** US wine gallon, 231 in³, in liters. */
export const LITERS_PER_US_GALLON = '3.785411784';

/** Exact avoirdupois pound. */
export const GRAMS_PER_POUND = '453.59237';

/** Highest ABV a person can enter for a plant record. The gauging tables still run to 200 proof. */
export const MAX_ENTERED_ABV = '99';

/**
 * Apparent specific volume of sucrose, kept only as a labeled quick estimate.
 * Flanagan / Bureau of Standards Bulletin 14 / CRC, mean 0.6219 cm³/g above
 * 1208.2 g/L at 20 °C. Not a TTB table and not used for proof.
 */
export const SUCROSE_QUICK_ESTIMATE_ML_PER_G = '0.6219';

/** Class I caramel specific gravity. Sunfood Type I plain Scotch grade, SG 1.30. Not a lot specification. */
export const CLASS_I_CARAMEL_SG = '1.30';

/** CS1 syrup density from the distillery blending sheet, g/ml. */
export const CS1_SYRUP_G_PER_ML = '1.368';

/** Table 1 temperature window, 27 CFR §30.61. */
export const TABLE1_MIN_F = '0';
export const TABLE1_MAX_F = '100';
export const TTB_STANDARD_TEMP_F = '60';
