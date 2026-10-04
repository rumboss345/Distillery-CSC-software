import { describe, expect, it } from 'vitest';
import {
  applyInventoryDelta,
  compositionFromProof,
  correctProofHydrometer,
  diluteWithWater,
  enteredAbvAllowed,
  gaugeWeightByTable3,
  gaugeWeightByTable6,
  labDifferenceExceedsTolerance,
  lineCost,
  proofFromSpecificGravity,
  proofGallonsFromTable3,
  recordMeasuredProof,
  scaleRecipeByFinishedMass,
  sucroseQuickEstimateGallons,
  sweetenedBatchAdjustment,
  table3ColumnProofGallons,
  table6At,
} from './index';
import { TABLE6 } from './table6-data';

/**
 * Inputs and the values this engine stores.
 * Check the TTB rows against Table 6 and §30.66. The AlcoDens LQ prints are
 * listed so they can be compared; they are not engine results.
 *
 * | Case | Input | Engine result | Other published print |
 * | 10 gal, 190 proof to 80 proof, 60 °F | Table 6 parts 95.00/6.18 and 40.00/63.42 | water 14.444 gal, final 23.750 gal | AlcoDens LQ prints 14.446 gal water and 23.75 gal total |
 * | 100 gal, 191 proof to 188 proof | alcohol 95.5 and 94.0, water 5.59 and 7.36 | water 1.887 gal | §30.66 hand example prints 1.84 after rounding 95.5/94.0 to 1.01 |
 * | 100 gal, 112 proof to 100 proof | water 47.75 and 53.73 | water 12.428 gal | §30.66 prints 12.42 |
 * | 400 lb at 141 proof | SG air 0.88862, water weight 8.32823 | 7.40063 lb/gal, 54.05 wine gal, 76.2 proof gal | same figures in §30.66 |
 * | 321.5 lb at 86 proof | Table 3 | 35.1 proof gallons | 27 CFR §30.63 example |
 * | 10.00 mass % sugar, SG 1.01679 | outside Table 6 | not calculated | AlcoDens LQ prints 35.54 proof |
 * | apparent proof 10, 150 g/L sugar, 60 °F | hydrometer indication | apparent 10.0, true proof not calculated | AlcoDens LQ prints true proof 94.62 |
 * | 69.03 proof, 242.5 g/L toward 65 and 250 | sweetened adjustment | not calculated | AlcoDens LQ prints about 109.48 gal and 228.34 g/L |
 */
describe('TTB Table 6 dilution', () => {
  it('reduces 10 gallons at 190 proof to 80 proof', () => {
    const result = diluteWithWater('10', '190', '80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.waterWineGallons).toBe('14.444');
    expect(result.finalWineGallons).toBe('23.750');
    expect(result.waterPounds).toBe('120.29');
    const snapshot = JSON.parse(result.snapshot) as Record<string, string>;
    expect(snapshot.waterWineGallons).toBe('14.444');
    expect(snapshot.finalWineGallons).toBe('23.750');
    expect(typeof snapshot.waterWineGallons).toBe('string');
  });

  it('uses the printed Table 6 parts for 190 and 80 proof', () => {
    expect(table6At('190').water.toFixed(2)).toBe('6.18');
    expect(table6At('80').water.toFixed(2)).toBe('63.42');
    expect(table6At('100').water.toFixed(2)).toBe('53.73');
    expect(table6At('191').water.toFixed(2)).toBe('5.59');
    expect(table6At('188').water.toFixed(2)).toBe('7.36');
    expect(table6At('112').water.toFixed(2)).toBe('47.75');
    expect(table6At('141').sgAir.toFixed(5)).toBe('0.88862');
  });

  it('reduces 100 gallons from 191 proof to 188 proof by exact table arithmetic', () => {
    const result = diluteWithWater('100', '191', '188');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.waterWineGallons).toBe('1.887');
  });

  it('reduces 100 gallons from 112 proof to 100 proof', () => {
    const result = diluteWithWater('100', '112', '100');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.waterWineGallons).toBe('12.428');
    expect(result.finalWineGallons).toBe('112.000');
  });

  it('returns zeros for a zero-gallon spirit', () => {
    const result = diluteWithWater('0', '190', '80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.waterWineGallons).toBe('0.000');
    expect(result.finalWineGallons).toBe('0.000');
  });

  it('refuses to proof an alcohol-free spirit up with water', () => {
    const result = diluteWithWater('10', '0', '80');
    expect(result.ok).toBe(false);
  });

  it('keeps a sugar-free spirit unchanged when the target proof matches', () => {
    const result = diluteWithWater('5', '80', '80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.waterWineGallons).toBe('0.000');
    expect(result.finalWineGallons).toBe('5.000');
  });
});

describe('TTB Table 6 weight gauging', () => {
  it('matches the §30.66 example of 400 pounds at 141 proof', () => {
    const result = gaugeWeightByTable6('400', '141', 'air');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.poundsPerWineGallon).toBe('7.40063');
    expect(result.wineGallons).toBe('54.05');
    expect(result.proofGallons).toBe('76.2');
    expect(result.gallonsPerPound).toBe('0.135124');
  });
});

describe('TTB Table 3', () => {
  it('matches the §30.63 examples', () => {
    expect(proofGallonsFromTable3('321.5', '86')).toBe('35.1');
    expect(proofGallonsFromTable3('60378', '190')).toBe('16884.1');
    const gauge = gaugeWeightByTable3('321.5', '86');
    expect(gauge.ok).toBe(true);
    if (!gauge.ok) return;
    expect(gauge.proofGallons).toBe('35.1');
    expect(gauge.wineGallons).toBe('40.81');
  });

  it('matches printed column intersections', () => {
    expect(table3ColumnProofGallons('80', '100')).toBe('10.1');
    expect(table3ColumnProofGallons('190', '1000')).toBe('279.6');
    expect(table3ColumnProofGallons('200', '100')).toBe('30.3');
  });
});

describe('composition', () => {
  it('converts 100 proof to mass percent from Table 6 specific gravity', () => {
    const result = compositionFromProof('100');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.abv).toBe('50.00');
    expect(result.specificGravity).toBe('0.93418');
    expect(result.massPercentAlcohol).toBe('42.48');
    expect(result.densitySugarCrossCheckProof).toBeNull();
  });

  it('reads 141 proof back from its Table 6 specific gravity', () => {
    const result = proofFromSpecificGravity('0.88862');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proof).toBe('141.00');
  });

  it('does not turn 10 mass percent sugar and SG 1.01679 into a proof', () => {
    const result = proofFromSpecificGravity('1.01679', 'air', '10.00');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.snapshot).toContain('not-calculated');
    const parsed = JSON.parse(result.snapshot) as { densitySugarCrossCheckProof: null };
    expect(parsed.densitySugarCrossCheckProof).toBeNull();
  });

  it('rejects a sugar-free specific gravity above the Table 6 range', () => {
    const result = proofFromSpecificGravity('1.01679');
    expect(result.ok).toBe(false);
  });
});

describe('hydrometer', () => {
  it('leaves an indication at 60 °F unchanged when there is no sugar', () => {
    const result = correctProofHydrometer({ apparentProof: '120', temperatureF: '60' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trueProof).toBe('120.0');
    expect(result.warnings).toEqual([]);
  });

  it('matches the published Table 1 examples to the nearest tenth', () => {
    const warm = correctProofHydrometer({ apparentProof: '80.32', temperatureF: '68.36' });
    const hot = correctProofHydrometer({ apparentProof: '192.82', temperatureF: '72.15' });
    const cfr = correctProofHydrometer({ apparentProof: '193', temperatureF: '75' });
    expect(warm.ok && hot.ok && cfr.ok).toBe(true);
    if (!warm.ok || !hot.ok || !cfr.ok) return;
    expect(warm.trueProof).toBe('76.6');
    expect(hot.trueProof).toBe('189.9');
    expect(cfr.trueProof).toBe('189.4');
    expect(warm.warnings[0]).toMatch(/not the full Table 1 grid/);
  });

  it('keeps apparent proof 10 with 150 g/L sugar as an apparent reading', () => {
    const result = correctProofHydrometer({
      apparentProof: '10',
      temperatureF: '60',
      sugarGPerL: '150',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.measuredApparentProof).toBe('10.0');
    expect(result.apparentProofAt60F).toBe('10.0');
    expect(result.trueProof).toBeNull();
    expect(result.sugarGPerL).toBe('150.00');
    const snapshot = JSON.parse(result.snapshot) as { trueProof: null; apparentProofAt60F: string };
    expect(snapshot.trueProof).toBeNull();
    expect(snapshot.apparentProofAt60F).toBe('10.0');
  });

  it('refuses temperatures outside 0 to 100 °F', () => {
    expect(correctProofHydrometer({ apparentProof: '100', temperatureF: '101' }).ok).toBe(false);
    expect(correctProofHydrometer({ apparentProof: '100', temperatureF: '-1' }).ok).toBe(false);
  });

  it('applies a calibration offset before the temperature step', () => {
    const result = correctProofHydrometer({
      apparentProof: '100',
      temperatureF: '60',
      calibrationOffsetProof: '0.4',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trueProof).toBe('100.4');
  });
});

describe('recorded proof and lab tolerance', () => {
  it('records the distilled proof and leaves the cross-check unused', () => {
    const result = recordMeasuredProof('65.00', '64.20');
    expect(result.recordedProof).toBe('65.00');
    expect(result.calculatedCrossCheckProof).toBe('64.20');
    expect(result.recordedSource).toBe('measured-distillation');
  });

  it('does not record a cross-check when no distillation proof was measured', () => {
    const result = recordMeasuredProof(null, '35.54');
    expect(result.recordedProof).toBeNull();
    expect(result.calculatedCrossCheckProof).toBe('35.54');
  });

  it('flags a lab difference above 0.5 percent and not a difference of exactly 0.5 percent', () => {
    expect(labDifferenceExceedsTolerance('100', '100.5')).toBe(false);
    expect(labDifferenceExceedsTolerance('100', '100.51')).toBe(true);
  });
});

describe('recipe lines stay separate', () => {
  it('scales eight ingredients by finished mass without combining them', () => {
    const scaled = scaleRecipeByFinishedMass([
      { id: 'a', name: 'Rum', classification: 'spirit', massFractionOfFinished: '0.40', quantityUom: 'lb', densityGPerMl: '0.8224', costPerUom: '4.00' },
      { id: 'b', name: 'GNS', classification: 'spirit', massFractionOfFinished: '0.10', quantityUom: 'lb', densityGPerMl: '0.8142', costPerUom: '3.50' },
      { id: 'c', name: 'Sugar', classification: 'sugar', massFractionOfFinished: '0.20', quantityUom: 'lb', densityGPerMl: null, costPerUom: '0.80' },
      { id: 'd', name: 'Syrup', classification: 'syrup', massFractionOfFinished: '0.05', quantityUom: 'lb', densityGPerMl: '1.368', costPerUom: '1.10' },
      { id: 'e', name: 'Flavor', classification: 'flavoring', massFractionOfFinished: '0.01', quantityUom: 'lb', densityGPerMl: '1.05', costPerUom: '12.00' },
      { id: 'f', name: 'Color', classification: 'color', massFractionOfFinished: '0.005', quantityUom: 'lb', densityGPerMl: '1.30', costPerUom: '6.00' },
      { id: 'g', name: 'Water', classification: 'water', massFractionOfFinished: '0.225', quantityUom: 'lb', densityGPerMl: null, costPerUom: '0.01' },
      { id: 'h', name: 'Vanilla', classification: 'other', massFractionOfFinished: '0.010', quantityUom: 'lb', densityGPerMl: '1.02', costPerUom: '20.00' },
    ], '1000');
    expect(scaled.ok).toBe(true);
    if (!scaled.ok) return;
    expect(scaled.lineCount).toBe(8);
    expect(scaled.lines.map((line) => line.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(scaled.lines.map((line) => line.classification)).toEqual([
      'spirit', 'spirit', 'sugar', 'syrup', 'flavoring', 'color', 'water', 'other',
    ]);
    expect(scaled.lines[0].quantity).toBe('400.000000');
    expect(scaled.lines[4].quantity).toBe('10.000000');
    expect(scaled.lines[4].densityGPerMl).toBe('1.05');
    expect(scaled.lines[0].costUsd).toBe('1600.00');
    expect(scaled.fractionSum).toBe('1.000000');
    const snapshot = JSON.parse(scaled.snapshot) as { lines: string; lineCount: string };
    const lines = JSON.parse(snapshot.lines) as { id: string; quantity: string }[];
    expect(lines).toHaveLength(8);
    expect(snapshot.lineCount).toBe('8');
  });

  it('does not fold lines when the fractions do not add to 1', () => {
    const scaled = scaleRecipeByFinishedMass([
      { id: 'a', name: 'A', classification: 'sugar', massFractionOfFinished: '0.2', quantityUom: 'lb', densityGPerMl: null, costPerUom: null },
      { id: 'b', name: 'B', classification: 'water', massFractionOfFinished: '0.2', quantityUom: 'lb', densityGPerMl: null, costPerUom: null },
    ], '10');
    expect(scaled.ok).toBe(true);
    if (!scaled.ok) return;
    expect(scaled.lineCount).toBe(2);
    expect(scaled.lines[0].quantity).toBe('2.000000');
    expect(scaled.lines[1].quantity).toBe('2.000000');
    expect(scaled.warnings[0]).toMatch(/not renormalized or combined/);
  });
});

describe('caps, cost, inventory, and the sugar quick estimate', () => {
  it('refuses an entered ABV above 99 and keeps 99', () => {
    expect(enteredAbvAllowed('99').ok).toBe(true);
    expect(enteredAbvAllowed('99.01').ok).toBe(false);
    expect(enteredAbvAllowed('100').abv).toBeNull();
  });

  it('allows a negative inventory balance', () => {
    expect(applyInventoryDelta('2', '-5')).toBe('-3.000000');
  });

  it('rounds a line cost half up to cents', () => {
    expect(lineCost('3.5', '2.25')).toBe('7.88');
  });

  it('labels the 0.6219 ml/g sugar volume as a quick estimate', () => {
    const result = sucroseQuickEstimateGallons('1000');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.label).toBe('quick-estimate');
    expect(result.volumeWineGallons).toBe('0.164');
    expect(result.note).toMatch(/Not a TTB/);
  });

  it('does not calculate the sweetened batch adjustment', () => {
    const result = sweetenedBatchAdjustment();
    expect(result.ok).toBe(false);
    expect(result.warnings[0]).toMatch(/does not compute/);
  });
});

describe('Table 6 transcription', () => {
  it('has 200 proof rows whose alcohol column is half the proof', () => {
    expect(TABLE6).toHaveLength(200);
    for (const row of TABLE6) {
      expect(Number(row.alcohol)).toBe(Number(row.proof) / 2);
    }
  });
});
