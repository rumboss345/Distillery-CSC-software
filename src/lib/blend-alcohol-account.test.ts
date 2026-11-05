import { describe, expect, it } from 'vitest';
import { buildBlendAlcoholAccount } from './blend-alcohol-account';
import { analyzeFormulation } from './formulation-engine';
import type { AdditiveInput, SpiritSourceInput } from './blend-formulation';

/**
 * GR Banana Rum charges taken from production worksheet BL-2026-004.
 * These are inputs for the regression, not stored production rows.
 */
const BANANA_SPIRIT: SpiritSourceInput[] = [
  { volumeGal: 72.27, abv: 93.1, label: 'High-proof spirit' },
];

const BANANA_ADDITIVES: AdditiveInput[] = [
  { ingredientType: 'water', name: 'Proofing water', amount: 97.214, unit: 'gal' },
  { ingredientType: 'sugar', name: 'Sugar', amount: 160.044, unit: 'lbs' },
  { ingredientType: 'syrup', name: 'CS1 syrup', amount: 53614.834, unit: 'ml' },
  { ingredientType: 'flavoring', name: 'Banana flavoring', amount: 210.967, unit: 'ml' },
  { ingredientType: 'flavoring', name: 'Natural banana flavor', amount: 3761.041, unit: 'ml' },
];

describe('BL-2026-004 banana rum alcohol account', () => {
  const account = buildBlendAlcoholAccount(BANANA_SPIRIT, BANANA_ADDITIVES);
  if (!account.ok) throw new Error(account.message);

  it('keeps about 67.28 gallons of absolute alcohol in the spirit charge', () => {
    expect(account.absoluteAlcoholGal).toBeCloseTo(72.27 * 0.931, 2);
    expect(account.absoluteAlcoholGal).toBeCloseTo(67.28, 2);
  });

  it('does not treat the spirit solution weight as ethanol', () => {
    expect(account.spiritSolutionLb).toBeGreaterThan(490);
    expect(account.spiritSolutionLb).toBeLessThan(500);
    expect(account.ethanolMassLb).toBeLessThan(account.spiritSolutionLb - 40);
    expect(account.ethanolMassLb / account.spiritSolutionLb).toBeGreaterThan(0.85);
    expect(account.ethanolMassLb / account.spiritSolutionLb).toBeLessThan(0.93);
  });

  it('reports alcohol by weight from ethanol mass, not from the old 40.8% figure', () => {
    expect(account.hydroAbv).toBeCloseTo(40.8, 1);
    expect(account.hydroAbw).not.toBeNull();
    expect(account.hydroAbw!).toBeGreaterThan(32);
    expect(account.hydroAbw!).toBeLessThan(36);
    expect(Math.abs(account.hydroAbw! - account.hydroAbv)).toBeGreaterThan(4);
    expect(account.legacySpiritWeightPercent).not.toBeNull();
    expect(Math.abs(account.legacySpiritWeightPercent! - account.hydroAbw!)).toBeGreaterThan(2);
    expect(account.legacySpiritWeightPercent).not.toBeCloseTo(40.79, 1);
  });

  it('marks the 192 gallon prediction provisional when syrup and flavor densities are missing', () => {
    expect(account.predictedVolumeGal).toBeGreaterThan(190);
    expect(account.predictedVolumeGal).toBeLessThan(194);
    expect(account.predictedAbv).toBeCloseTo(35, 0);
    expect(account.volumeStatus).toBe('provisional');
    expect(account.predictedAbw).toBeNull();
    expect(account.unverifiedVolumeGal).toBeGreaterThan(10);
    expect(account.warnings.join(' ')).toMatch(/CS1 syrup/);
    expect(account.warnings.join(' ')).toMatch(/DENSITY NOT VERIFIED/);
    expect(account.warnings.join(' ')).not.toMatch(/1\.368/);
    expect(account.sugarSpecificationIncomplete).toBe(true);
  });

  it('does not invent a CS1 density when the assumption is not selected', () => {
    const withAssumption = buildBlendAlcoholAccount(BANANA_SPIRIT, BANANA_ADDITIVES.map((row) => (
      row.name === 'CS1 syrup' ? { ...row, densityAssumption: 'cs1-syrup' as const } : row
    )));
    expect(withAssumption.ok).toBe(true);
    if (!withAssumption.ok) return;
    expect(withAssumption.warnings.join(' ')).toMatch(/1\.368/);
    expect(withAssumption.unverifiedVolumeGal).toBeLessThan(account.unverifiedVolumeGal);
  });
});

describe('alcohol by weight identity', () => {
  it('uses ethanol mass over total mass for an unsweetened proof', () => {
    const analyzed = analyzeFormulation([
      { kind: 'spirit', name: 'Spirit', amount: 10, unit: 'gal', abv: 80 },
      { kind: 'water', name: 'Water', amount: 10, unit: 'gal' },
    ]);
    expect(analyzed.ok).toBe(true);
    if (!analyzed.ok) return;
    expect(analyzed.volumeStatus).toBe('gauged');
    expect(analyzed.ethanolMassLb).toBeGreaterThan(0);
    expect(analyzed.ethanolMassLb).toBeLessThan(analyzed.weightLb);
    expect(analyzed.alcoholByWeight).toBeCloseTo((analyzed.ethanolMassLb / analyzed.weightLb) * 100, 1);
    expect(analyzed.hydroAbv).not.toBeCloseTo(analyzed.alcoholByWeight ?? 0, 0);
  });
});
