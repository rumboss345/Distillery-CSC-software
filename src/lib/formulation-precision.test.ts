import { describe, expect, it } from 'vitest';
import { reconcileMeasurements } from './blend-formulation';
import { scaleIngredients, scaleSpiritSources } from './blend-recipe-scale';
import { spiritVolumeGalFromAmount } from './blending';
import { analyzeFormulation, designFormulation } from './formulation-engine';
import {
  DENSITY_NOT_VERIFIED,
  perLiterView,
  VOLUME_LABEL_MEASURED,
  VOLUME_LABEL_PREDICTED,
} from './formulation-quantity';
import {
  displayedSpiritChargeAgrees,
  formatSpiritCharge,
  formulationSpiritVolumeGal,
  formulationSpiritWeightLb,
  spiritDisplaysDescribeSameCharge,
} from './formulation-spirit';
import { LITERS_PER_US_GALLON } from './material-densities';
import { proofFromAbv, wineGallonsFromWeight } from '../services/spirit-gauging';

const NEUTRAL_ABV = 93;

describe('formulation spirit precision', () => {
  it('keeps 0.25 lb of 93% spirit off the coarse Table 3 proof-gallon path', () => {
    const gallons = spiritVolumeGalFromAmount(0.25, 'lbs', NEUTRAL_ABV);
    const coarse = wineGallonsFromWeight(0.25, proofFromAbv(NEUTRAL_ABV));
    expect(gallons).toBeCloseTo(formulationSpiritVolumeGal(0.25, NEUTRAL_ABV), 8);
    expect(gallons).not.toBeCloseTo(coarse, 3);
    expect(formulationSpiritWeightLb(gallons, NEUTRAL_ABV)).toBeCloseTo(0.25, 8);
    const shown = formatSpiritCharge(gallons, NEUTRAL_ABV);
    expect(shown.gallons.startsWith('0.1')).toBe(false);
    expect(shown.gallons).not.toBe('0.1');
    expect(spiritDisplaysDescribeSameCharge(0.25, 0.1, NEUTRAL_ABV)).toBe(false);
  });
});

describe("Jack's Dark current-model regression", () => {
  const spirit = { spirit_label: 'Neutral spirit', volume_gal: 0, abv: NEUTRAL_ABV, entered_amount: 249, entered_unit: 'lbs' };
  const ingredients = [
    { ingredient_type: 'water' as const, name: 'Water', amount: 415, unit: 'lbs', notes: '' },
    { ingredient_type: 'sugar' as const, name: 'Sugar', amount: 250, unit: 'lbs', notes: '' },
    { ingredient_type: 'flavoring' as const, name: 'YT75', amount: 1.75, unit: 'l', abv: 0, notes: '' },
  ];

  function charge() {
    return analyzeFormulation([
      { kind: 'spirit', name: 'Neutral spirit', amount: 249, unit: 'lbs', abv: NEUTRAL_ABV },
      { kind: 'water', name: 'Water', amount: 415, unit: 'lbs' },
      { kind: 'sugar', name: 'Sugar', amount: 250, unit: 'lbs' },
      { kind: 'flavoring', name: 'YT75', amount: 1.75, unit: 'l', abv: 0 },
    ]);
  }

  it('keeps the entered charges and does not send 249 lb through coarse proof gallons', () => {
    const entered = {
      spiritLb: 249,
      waterLb: 415,
      sugarLb: 250,
      flavorL: 1.75,
    };
    const gallons = spiritVolumeGalFromAmount(entered.spiritLb, 'lbs', NEUTRAL_ABV);
    expect(formulationSpiritWeightLb(gallons, NEUTRAL_ABV)).toBeCloseTo(entered.spiritLb, 6);
    expect(gallons).not.toBeCloseTo(wineGallonsFromWeight(entered.spiritLb, proofFromAbv(NEUTRAL_ABV)), 3);

    const scaledSpirits = scaleSpiritSources([{
      ...spirit,
      volume_gal: gallons,
    }], 2);
    const scaledIngredients = scaleIngredients(ingredients, 2);
    expect(scaledSpirits[0].entered_amount).toBeCloseTo(498, 6);
    expect(scaledSpirits[0].entered_unit).toBe('lbs');
    expect(scaledIngredients.map((row) => row.amount)).toEqual([830, 500, 3.5]);
    expect(scaledIngredients[0].amount / entered.waterLb).toBeCloseTo(scaledIngredients[1].amount / entered.sugarLb, 6);
    expect(entered).toEqual({ spiritLb: 249, waterLb: 415, sugarLb: 250, flavorL: 1.75 });
  });

  it('labels the current model prediction and lets a measurement override it', () => {
    const predicted = charge();
    expect(predicted.ok).toBe(true);
    if (!predicted.ok) return;
    expect(predicted.summary).toMatch(/Predicted finished volume/);
    expect(predicted.summary).toMatch(/predicted ABV/);
    expect(predicted.warnings.join(' ')).toMatch(/0\.6219/);
    expect(predicted.warnings.join(' ')).toContain(DENSITY_NOT_VERIFIED);
    // Current continuous-factor model. The older 0.1 proof-gallon path was about
    // 389.2 L and 32.78% ABV. Neither figure is a laboratory specification.
    expect(predicted.liters).toBeCloseTo(389.1309, 2);
    expect(predicted.abv).toBeCloseTo(32.82, 2);

    const recipe = { spiritLb: 249, waterLb: 415, sugarLb: 250, flavorL: 1.75 };
    const reconciliation = reconcileMeasurements(
      {
        volumeGal: predicted.volumeGal,
        abv: predicted.abv,
        density: predicted.densityGPerMl,
        brix: null,
      },
      { volumeGal: 100, abv: 30, density: null, brix: null },
    );
    expect(reconciliation.effectiveSource).toBe('lab');
    expect(reconciliation.effective.volumeGal).toBe(100);
    expect(reconciliation.effective.abv).toBe(30);
    expect(recipe).toEqual({ spiritLb: 249, waterLb: 415, sugarLb: 250, flavorL: 1.75 });

    const perPredicted = perLiterView(
      [{ name: 'Sugar', grams: 250 * 453.59237 }],
      predicted.liters,
      'predicted',
    );
    const perMeasured = perLiterView(
      [{ name: 'Sugar', grams: 250 * 453.59237 }],
      100 * LITERS_PER_US_GALLON,
      'measured',
    );
    expect(perPredicted.basisLabel).toBe(VOLUME_LABEL_PREDICTED);
    expect(perMeasured.basisLabel).toBe(VOLUME_LABEL_MEASURED);
    expect(perMeasured.lines[0].grams).toBe(perPredicted.lines[0].grams);
    expect(perMeasured.lines[0].gramsPerLiter).not.toBeCloseTo(perPredicted.lines[0].gramsPerLiter ?? 0, 1);
  });
});

describe('1 L formulations at 93% neutral spirit', () => {
  const oneLiterGal = 1 / LITERS_PER_US_GALLON;

  for (const targetAbv of [21, 28, 30, 35, 40]) {
    it(`shows one spirit charge at ${targetAbv}% ABV`, () => {
      const designed = designFormulation({
        targetVolumeGal: oneLiterGal,
        targetAbv,
        additionSpiritAbv: NEUTRAL_ABV,
      });
      expect(designed.ok).toBe(true);
      expect(designed.analysis?.abv).toBeCloseTo(targetAbv, 0);
      expect(displayedSpiritChargeAgrees(designed.spiritGal, designed.spiritAbv)).toBe(true);
      const shown = formatSpiritCharge(designed.spiritGal, designed.spiritAbv);
      const pounds = Number.parseFloat(shown.pounds);
      const gallons = Number.parseFloat(shown.gallons);
      expect(spiritDisplaysDescribeSameCharge(pounds, gallons, designed.spiritAbv)).toBe(true);
      expect(spiritDisplaysDescribeSameCharge(0.25, 0.1, NEUTRAL_ABV)).toBe(false);
      if (targetAbv === 21) {
        const inconsistent = shown.pounds.startsWith('0.25') && shown.gallons.startsWith('0.1');
        expect(inconsistent).toBe(false);
      }
    });
  }
});

describe('alcohol from every alcohol-bearing ingredient', () => {
  it('adds flavor alcohol to neutral spirit instead of ignoring it', () => {
    const result = analyzeFormulation([
      { kind: 'spirit', name: 'Neutral', amount: 10, unit: 'gal', abv: 93 },
      { kind: 'flavoring', name: 'Extract', amount: 1, unit: 'gal', abv: 35, densityGPerMl: 0.95 },
      { kind: 'water', name: 'Water', amount: 5, unit: 'gal' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pureAlcoholGal).toBeCloseTo(10 * 0.93 + 1 * 0.35, 4);
  });
});
