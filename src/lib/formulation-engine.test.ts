import { describe, expect, it } from 'vitest';
import { computeAlcoholDilution } from './alcohol-dilution';
import {
  analyzeFormulation,
  correctBatchToTarget,
  designFormulation,
  SUCROSE_APPARENT_SPECIFIC_VOLUME_ML_PER_G,
  sucroseApparentVolumeGal,
} from './formulation-engine';
import { LITERS_PER_US_GALLON, wineGallonsFromLiters } from '../services/spirit-gauging';

describe('formulation engine', () => {
  it('uses the cited sucrose apparent specific volume', () => {
    expect(SUCROSE_APPARENT_SPECIFIC_VOLUME_ML_PER_G).toBe(0.6219);
    const grams = 1000;
    expect(sucroseApparentVolumeGal(grams)).toBeCloseTo(
      (grams * 0.6219) / (LITERS_PER_US_GALLON * 1000),
      6,
    );
  });

  it('matches Table 3 dilution for spirit and water', () => {
    const dilution = computeAlcoholDilution({
      actualAbvPercent: 80,
      targetAbvPercent: 40,
      volumeLiters: 100,
      volumeBasis: 'after',
    });
    expect(dilution).not.toBeNull();
    const designed = designFormulation({
      targetVolumeGal: wineGallonsFromLiters(100),
      targetAbv: 40,
      additionSpiritAbv: 80,
    });
    expect(designed.ok).toBe(true);
    expect(designed.spiritGal * LITERS_PER_US_GALLON).toBeCloseTo(dilution!.spiritVolumeLiters, 1);
    expect(designed.waterGal * LITERS_PER_US_GALLON).toBeCloseTo(dilution!.waterVolumeLiters, 1);
    // Re-gauging the mix walks Table 3, which rounds proof gallons to 0.1.
    expect(designed.analysis?.abv).toBeCloseTo(40, 0);
  });

  it('shows volume contraction for an unsweetened blend', () => {
    const dilution = computeAlcoholDilution({
      actualAbvPercent: 80,
      targetAbvPercent: 40,
      volumeLiters: 100,
      volumeBasis: 'after',
    });
    const spiritGal = dilution!.spiritVolumeLiters / LITERS_PER_US_GALLON;
    const waterGal = dilution!.waterVolumeLiters / LITERS_PER_US_GALLON;
    const analyzed = analyzeFormulation([
      { kind: 'spirit', name: 'Spirit', amount: spiritGal, unit: 'gal', abv: 80 },
      { kind: 'water', name: 'Water', amount: waterGal, unit: 'gal' },
    ]);
    expect(analyzed.ok).toBe(true);
    if (!analyzed.ok) return;
    expect(analyzed.contractionGal).toBeGreaterThan(0);
    expect(analyzed.volumeGal).toBeLessThan(spiritGal + waterGal);
    expect(analyzed.obscured).toBe(false);
    expect(analyzed.model).toBe('ttb-table-3');
  });

  it('designs 1000 L at 25% ABV and 220 g/L sugar', () => {
    const targetGal = 1000 / LITERS_PER_US_GALLON;
    const designed = designFormulation({
      targetVolumeGal: targetGal,
      targetAbv: 25,
      targetSugarGPerL: 220,
      additionSpiritAbv: 95,
    });
    expect(designed.ok).toBe(true);
    expect(designed.sugarGrams).toBeCloseTo(220000, 0);
    expect(designed.spiritGal).toBeGreaterThan(0);
    expect(designed.waterGal).toBeGreaterThan(0);
    expect(designed.analysis?.abv).toBeCloseTo(25, 0);
    expect(designed.analysis?.sugarGPerL).toBeCloseTo(220, 0);
    expect(designed.analysis?.liters).toBeCloseTo(1000, 0);
    expect(designed.analysis?.obscured).toBe(true);
    expect(designed.analysis?.warnings.join(' ')).toMatch(/lab ABV/i);
  });

  it('corrects 8500 L at 38.20% ABV toward 10000 L at 40% ABV', () => {
    const corrected = correctBatchToTarget({
      measuredVolumeGal: 8500 / LITERS_PER_US_GALLON,
      measuredAbv: 38.2,
      targetVolumeGal: 10000 / LITERS_PER_US_GALLON,
      targetAbv: 40,
      additionSpiritAbv: 95,
    });
    expect(corrected.ok).toBe(true);
    expect(corrected.spiritGal).toBeGreaterThan(0);
    expect(corrected.waterGal).toBeGreaterThan(0);
    expect(corrected.analysis?.liters).toBeCloseTo(10000, 0);
    expect(corrected.analysis?.abv).toBeCloseTo(40, 0);
  });

  it('refuses to shrink a batch that is already larger than the target', () => {
    const corrected = correctBatchToTarget({
      measuredVolumeGal: 100,
      measuredAbv: 40,
      targetVolumeGal: 80,
      targetAbv: 40,
      additionSpiritAbv: 95,
    });
    expect(corrected.ok).toBe(false);
    expect(corrected.message).toMatch(/already larger/i);
  });

  it('refuses a target ABV above 99%', () => {
    const designed = designFormulation({
      targetVolumeGal: 10,
      targetAbv: 99.5,
      additionSpiritAbv: 95,
    });
    expect(designed.ok).toBe(false);
    expect(designed.message).toMatch(/99%/);
  });

  it('corrects component ABV to 60 °F before the balance', () => {
    const hot = analyzeFormulation([
      { kind: 'spirit', name: 'Spirit', amount: 10, unit: 'gal', abv: 80, temperatureF: 80 },
    ]);
    const standard = analyzeFormulation([
      { kind: 'spirit', name: 'Spirit', amount: 10, unit: 'gal', abv: 80, temperatureF: 60 },
    ]);
    expect(hot.ok && standard.ok).toBe(true);
    if (!hot.ok || !standard.ok) return;
    expect(hot.pureAlcoholGal).not.toBeCloseTo(standard.pureAlcoholGal, 2);
  });
});
