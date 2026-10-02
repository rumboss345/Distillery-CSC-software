/**
 * Cited densities for gauging and blend weight/volume conversion.
 * Alcohol proof still comes from TTB Table No. 3; these factors only turn
 * water, dissolved sugar, syrup, and color between weight and volume.
 */

/** Exact avoirdupois pound. */
export const GRAMS_PER_POUND = 453.59237;

/** US wine gallon in milliliters (231 in³). */
export const ML_PER_US_GALLON = 3.785411784 * 1000;

/**
 * Wine gallons of water per pound at 60 °F.
 * 27 CFR §30.41 calls 0.120074 "the wine gallons per pound for water at 60 degrees Fahrenheit."
 */
export const TTB_WATER_WINE_GALLONS_PER_POUND = 0.120074;

/** Pounds of water per US wine gallon at 60 °F (1 / 0.120074). */
export const WATER_LBS_PER_US_GALLON = 1 / TTB_WATER_WINE_GALLONS_PER_POUND;

/**
 * Apparent specific volume of sucrose in aqueous solution at 20 °C.
 * Flanagan's sucrose functions, citing Bureau of Standards Bulletin 14 (1918–1919)
 * and the CRC Handbook, use a mean of 0.6219 cm³/g above 1208.2 g/L.
 * This is the volume dissolved sugar adds. It is not crystal density and not dry-scoop bulk density.
 */
export const SUCROSE_APPARENT_SPECIFIC_VOLUME_ML_PER_G = 0.6219;

/**
 * Sucrose crystal density, about 1.587 g/cm³. Kept so a dry crystal volume is not
 * mistaken for the volume sugar occupies once it is dissolved (1 / 0.6219 g/ml).
 */
export const SUCROSE_CRYSTAL_DENSITY_G_PER_ML = 1.59;

/** CS1 syrup density from the distillery blending sheet. Not a generic syrup constant. */
export const SYRUP_BULK_DENSITY_G_PER_ML = 1.368;

/**
 * Class I (E150a) spirit caramel, specific gravity 1.30.
 * Sunfood Type I plain Scotch grade lists specific gravity 1.30 for scotch, whiskey, and other liquors
 * (https://www.sunfoodcolor.com/pdf/nc_caramel_1.pdf).
 * Sethness YT75 publishes moisture (31 g/100 g) and does not publish specific gravity, so this is
 * class-typical, not a YT75 lot specification.
 */
export const CLASS_I_CARAMEL_DENSITY_G_PER_ML = 1.3;

export function gPerMlFromLbsPerGallon(lbsPerGallon: number): number {
  return (lbsPerGallon * GRAMS_PER_POUND) / ML_PER_US_GALLON;
}

export function lbsPerGallonFromGPerMl(gPerMl: number): number {
  return (ML_PER_US_GALLON * gPerMl) / GRAMS_PER_POUND;
}

/** Pounds per gallon of volume that dissolved sucrose occupies. */
export function dissolvedSucroseLbsPerGallon(): number {
  return lbsPerGallonFromGPerMl(1 / SUCROSE_APPARENT_SPECIFIC_VOLUME_ML_PER_G);
}
