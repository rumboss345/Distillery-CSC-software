import { describe, expect, it } from 'vitest';
import { buildBlendAlcoholAccount, buildRecipeAlcoholAccount } from './blend-alcohol-account';
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

describe('recipe shapes and a recipe that has not been entered', () => {
  it('does not invent a result when nothing has been entered', () => {
    const blank = buildRecipeAlcoholAccount([], []);
    expect(blank.ok).toBe(false);
    if (blank.ok) return;
    expect(blank.message).toMatch(/nothing entered/i);
  });

  it('accounts a spirit-only recipe before water or additives are entered', () => {
    const partial = buildRecipeAlcoholAccount(
      [{ spirit_label: 'High wine', volume_gal: 20, abv: 75, barrel_id: null, id: 0, blend_recipe_id: 0, sort_order: 0 }],
      [],
    );
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.volumeStatus).toBe('gauged');
    expect(partial.hydroAbv).toBeCloseTo(75, 0);
    expect(partial.ethanolMassLb).toBeGreaterThan(0);
    expect(partial.ethanolMassLb).toBeLessThan(partial.spiritSolutionLb);
    expect(partial.hydroAbw).not.toBeCloseTo(partial.hydroAbv, 0);
    expect(partial.proofingWaterLb).toBe(0);
  });

  it('keeps a straight spirit proof gauged', () => {
    const straight = buildBlendAlcoholAccount(
      [{ volumeGal: 50, abv: 80, label: 'Vodka' }],
      [{ ingredientType: 'water', name: 'Proofing water', amount: 40, unit: 'gal' }],
    );
    expect(straight.ok).toBe(true);
    if (!straight.ok) return;
    expect(straight.volumeStatus).toBe('gauged');
    expect(straight.predictedAbw).not.toBeNull();
    expect(straight.predictedAbw).toBeCloseTo(straight.hydroAbw ?? 0, 1);
    expect(straight.ethanolMassLb).toBeLessThan(straight.spiritSolutionLb);
  });

  it('estimates a sugar recipe and still reports alcohol by weight', () => {
    const sweet = buildBlendAlcoholAccount(
      [{ volumeGal: 88.29, abv: 93, label: 'Neutral' }],
      [
        { ingredientType: 'water', name: 'Water', amount: 120.38, unit: 'gal' },
        { ingredientType: 'sugar', name: 'White sugar', amount: 406, unit: 'lbs' },
      ],
    );
    expect(sweet.ok).toBe(true);
    if (!sweet.ok) return;
    expect(sweet.volumeStatus).toBe('estimated');
    expect(sweet.predictedAbw).not.toBeNull();
    expect(sweet.hydroAbv).toBeGreaterThan(sweet.predictedAbv);
    expect(sweet.sugarGPerL).toBeGreaterThan(0);
  });

  it('holds alcohol by weight when a syrup has no density, on a saved recipe or a new one', () => {
    const spirits = [{ spirit_label: 'Rum', volume_gal: 10, abv: 70, id: 1, blend_recipe_id: 1, sort_order: 0 }];
    const ingredients = [
      { ingredient_type: 'syrup' as const, name: 'CS1', amount: 500, unit: 'ml', notes: '' },
      { ingredient_type: 'water' as const, name: 'Water', amount: 5, unit: 'gal', notes: '' },
    ];
    const saved = buildRecipeAlcoholAccount(spirits, ingredients);
    const unsaved = buildBlendAlcoholAccount(
      [{ volumeGal: 10, abv: 70, label: 'Rum' }],
      [
        { ingredientType: 'syrup', name: 'CS1', amount: 500, unit: 'ml' },
        { ingredientType: 'water', name: 'Water', amount: 5, unit: 'gal' },
      ],
    );
    expect(saved.ok && unsaved.ok).toBe(true);
    if (!saved.ok || !unsaved.ok) return;
    expect(saved.volumeStatus).toBe('provisional');
    expect(unsaved.volumeStatus).toBe('provisional');
    expect(saved.predictedAbw).toBeNull();
    expect(unsaved.predictedAbw).toBeNull();
    expect(saved.ethanolMassLb).toBeCloseTo(unsaved.ethanolMassLb, 2);
    expect(saved.warnings.join(' ')).toMatch(/DENSITY NOT VERIFIED/);
    expect(saved.warnings.join(' ')).not.toMatch(/1\.368/);
  });

  it('counts syrup sugar only when a verified fraction and density are entered', () => {
    const withSpec = buildBlendAlcoholAccount(
      [{ volumeGal: 10, abv: 70, label: 'Rum' }],
      [{
        ingredientType: 'syrup',
        name: 'CS1',
        amount: 2,
        unit: 'lbs',
        densityGPerMl: 1.32,
        sucroseMassFraction: 0.7,
        specStatus: 'verified',
      }],
    );
    expect(withSpec.ok).toBe(true);
    if (!withSpec.ok) return;
    expect(withSpec.sugarGPerL).toBeGreaterThan(0);
    expect(withSpec.volumeStatus).not.toBe('provisional');
    expect(withSpec.predictedAbw).not.toBeNull();
  });

  it('adds alcohol from a flavoring and from a second spirit', () => {
    const mixed = buildBlendAlcoholAccount(
      [
        { volumeGal: 8, abv: 65, label: 'Rum' },
        { volumeGal: 2, abv: 40, label: 'Low wine' },
      ],
      [{ ingredientType: 'flavoring', name: 'Extract', amount: 0.5, unit: 'gal', abv: 35, densityGPerMl: 0.95, specStatus: 'verified' }],
    );
    expect(mixed.ok).toBe(true);
    if (!mixed.ok) return;
    expect(mixed.absoluteAlcoholGal).toBeCloseTo(8 * 0.65 + 2 * 0.4 + 0.5 * 0.35, 2);
    expect(mixed.ethanolMassLb).toBeGreaterThan(0);
    expect(mixed.ethanolMassLb).toBeLessThan(mixed.spiritSolutionLb + 5);
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
