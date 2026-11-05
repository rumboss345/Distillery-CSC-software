import { resolveSpiritSourceVolumeGal } from './blend-abv-confirm';
import { additiveInputsFromBlendIngredients, type AdditiveInput, type SpiritSourceInput } from './blend-formulation';
import { analyzeFormulation, type FormulationAnalysis, type FormulationComponent } from './formulation-engine';
import type { BlendIngredientInput, BlendRecipeSpiritSourceInput } from '../types';

/** US distilled-spirits gauging temperature. OIML R22 at 20 °C is a different standard and is not used. */
export const BLEND_REFERENCE_TEMPERATURE_F = 60;

export const BLEND_ALCOHOL_STANDARD =
  'Ethanol mass uses TTB Table 6 at 60 °F: mass percent = ABV × specific gravity of 200 proof ÷ specific gravity at the charge proof, air basis (27 CFR Part 30). '
  + 'Alcohol by weight is that ethanol mass divided by solution mass. Spirit solution weight is not ethanol. '
  + 'OIML R22 at 20 °C is not applied.';

export interface BlendAlcoholAccount {
  ok: true;
  referenceTemperatureF: number;
  standard: string;
  absoluteAlcoholGal: number;
  laaLiters: number;
  spiritSolutionLb: number;
  ethanolMassLb: number;
  proofingWaterLb: number;
  hydroVolumeGal: number;
  hydroAbv: number;
  hydroAbw: number | null;
  /** Spirit solution weight ÷ (spirit + proofing water). This is not alcohol by weight. */
  legacySpiritWeightPercent: number | null;
  predictedVolumeGal: number;
  predictedAbv: number;
  predictedAbw: number | null;
  volumeStatus: FormulationAnalysis['volumeStatus'];
  sugarGPerL: number | null;
  sugarSpecificationIncomplete: boolean;
  unverifiedVolumeGal: number;
  warnings: string[];
  summary: string;
}

function componentsFrom(
  spirits: SpiritSourceInput[],
  additives: AdditiveInput[],
): FormulationComponent[] {
  const components: FormulationComponent[] = [];
  for (const spirit of spirits) {
    if (!(spirit.volumeGal > 0) || !(spirit.abv > 0)) continue;
    components.push({
      kind: 'spirit',
      name: spirit.label?.trim() || 'Spirit',
      amount: spirit.volumeGal,
      unit: 'gal',
      abv: spirit.abv,
      temperatureF: BLEND_REFERENCE_TEMPERATURE_F,
    });
  }
  for (const additive of additives) {
    if (!(additive.amount > 0)) continue;
    components.push({
      kind: additive.ingredientType,
      name: additive.name?.trim() || additive.ingredientType,
      amount: additive.amount,
      unit: additive.unit,
      abv: additive.abv ?? null,
      densityGPerMl: additive.densityGPerMl,
      densityAssumption: additive.densityAssumption,
      sucroseMassFraction: additive.sucroseMassFraction,
      specStatus: additive.specStatus,
      temperatureF: BLEND_REFERENCE_TEMPERATURE_F,
    });
  }
  return components;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Saved recipes and a recipe that has not been saved yet share this account. */
export function buildRecipeAlcoholAccount(
  spirits: BlendRecipeSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
): BlendAlcoholAccount | { ok: false; message: string } {
  const spiritInputs: SpiritSourceInput[] = spirits.flatMap((spirit) => {
    const volumeGal = resolveSpiritSourceVolumeGal(spirit);
    if (volumeGal == null) return [];
    return [{
      volumeGal,
      abv: spirit.abv,
      label: spirit.spirit_label?.trim() || 'Spirit',
    }];
  });
  const additives = additiveInputsFromBlendIngredients(ingredients, { includeWater: true });
  if (spiritInputs.length === 0 && additives.length === 0) {
    return { ok: false, message: 'Nothing entered yet.' };
  }
  return buildBlendAlcoholAccount(spiritInputs, additives);
}

export function buildBlendAlcoholAccount(
  spirits: SpiritSourceInput[],
  additives: AdditiveInput[],
): BlendAlcoholAccount | { ok: false; message: string } {
  const analyzed = analyzeFormulation(componentsFrom(spirits, additives));
  if (!analyzed.ok) return analyzed;
  const spiritOnly = analyzeFormulation(componentsFrom(spirits, []));
  const hydroOnly = analyzeFormulation(componentsFrom(
    spirits,
    additives.filter((row) => row.ingredientType === 'water'),
  ));
  const spiritSolutionLb = spiritOnly.ok ? spiritOnly.weightLb : 0;
  const hydroWeightLb = hydroOnly.ok ? hydroOnly.weightLb : spiritSolutionLb;
  const proofingWaterLb = round2(Math.max(0, hydroWeightLb - spiritSolutionLb));
  const legacy = hydroWeightLb > 0 && spiritSolutionLb > 0
    ? (spiritSolutionLb / hydroWeightLb) * 100
    : null;

  return {
    ok: true,
    referenceTemperatureF: BLEND_REFERENCE_TEMPERATURE_F,
    standard: BLEND_ALCOHOL_STANDARD,
    absoluteAlcoholGal: analyzed.pureAlcoholGal,
    laaLiters: analyzed.laaLiters,
    spiritSolutionLb,
    ethanolMassLb: analyzed.ethanolMassLb,
    proofingWaterLb,
    hydroVolumeGal: analyzed.hydroVolumeGal,
    hydroAbv: analyzed.hydroAbv,
    hydroAbw: analyzed.hydroAbw,
    legacySpiritWeightPercent: legacy == null ? null : round2(legacy),
    predictedVolumeGal: analyzed.volumeGal,
    predictedAbv: analyzed.abv,
    predictedAbw: analyzed.alcoholByWeight,
    volumeStatus: analyzed.volumeStatus,
    sugarGPerL: analyzed.sugarGPerL,
    sugarSpecificationIncomplete: analyzed.sugarSpecificationIncomplete,
    unverifiedVolumeGal: analyzed.unverifiedVolumeGal,
    warnings: analyzed.warnings,
    summary: analyzed.summary,
  };
}
