import { describe, expect, it } from 'vitest';
import { LITERS_PER_US_GALLON } from '../services/spirit-gauging';
import {
  blendIngredientsWithSolvedProofingWater,
  computeTheoreticalBlend,
  proofingWaterAfterSpiritAdjustment,
  solveWaterForTargetAbv,
} from './blend-formulation';
import type { BlendIngredientInput } from '../types';

/**
 * BL-2026-007 (GR Spiced Rum) regression shape.
 * Spirit pull matches 360 L @ 35% ABV (~126.1 L LAA). Recipe water left at an
 * unsolved linear scale inflates predicted yield toward ~488 L while alcohol stays ~126 L.
 */
const GR007_SPIRIT = { volumeGal: 35.708, abv: 93.3 };

const GR007_ADDITIVES_BEFORE_WATER: BlendIngredientInput[] = [
  {
    ingredient_type: 'sugar',
    name: 'Granulated sugar',
    amount: 80,
    unit: 'lbs',
    abv: null,
    cost_per_unit: null,
    lot_number: '',
    inventory_item_id: null,
    notes: '',
  },
  {
    ingredient_type: 'syrup',
    name: 'CS1 syrup',
    amount: 15000,
    unit: 'ml',
    abv: null,
    density_assumption: 'cs1-syrup',
    spec_status: 'estimated',
    cost_per_unit: null,
    lot_number: '',
    inventory_item_id: null,
    notes: '',
  },
  {
    ingredient_type: 'flavoring',
    name: 'Spice flavor',
    amount: 5000,
    unit: 'ml',
    abv: null,
    density_g_per_ml: 1.05,
    spec_status: 'verified',
    cost_per_unit: null,
    lot_number: '',
    inventory_item_id: null,
    notes: '',
  },
  {
    ingredient_type: 'water',
    name: 'Proofing water',
    amount: 86,
    unit: 'gal',
    abv: null,
    cost_per_unit: null,
    lot_number: '',
    inventory_item_id: null,
    notes: '',
  },
];

describe('BL-2026-007 target finished volume', () => {
  const targetAbv = 35;
  const targetLiters = 360;
  const targetGal = targetLiters / LITERS_PER_US_GALLON;

  it('shows inflated yield when proofing water is not reconciled to additives', () => {
    const inflated = computeTheoreticalBlend(
      [GR007_SPIRIT],
      GR007_ADDITIVES_BEFORE_WATER.map((row) => ({
        ingredientType: row.ingredient_type,
        name: row.name,
        amount: row.amount,
        unit: row.unit,
        densityGPerMl: row.density_g_per_ml,
        densityAssumption: row.density_assumption,
        specStatus: row.spec_status,
      })),
      targetAbv,
    );
    expect(inflated.pureAlcoholGal * LITERS_PER_US_GALLON).toBeCloseTo(126.1, 0);
    expect(inflated.volumeGal).toBeGreaterThan(127);
    expect(inflated.volumeGal).toBeLessThan(131);
    expect(inflated.abv).toBeLessThan(27);
  });

  it('re-solves proofing water so finished volume matches the 360 L alcohol balance at 35% ABV', () => {
    const reconciled = blendIngredientsWithSolvedProofingWater(
      GR007_ADDITIVES_BEFORE_WATER,
      [GR007_SPIRIT],
      targetAbv,
    );
    const water = reconciled.find((row) => row.ingredient_type === 'water');
    expect(water).toBeDefined();
    expect(water!.amount).toBeLessThan(86);

    const result = computeTheoreticalBlend(
      [GR007_SPIRIT],
      reconciled.map((row) => ({
        ingredientType: row.ingredient_type,
        name: row.name,
        amount: row.amount,
        unit: row.unit,
        densityGPerMl: row.density_g_per_ml,
        densityAssumption: row.density_assumption,
        specStatus: row.spec_status,
      })),
      targetAbv,
    );
    expect(result.abv).toBeCloseTo(targetAbv, 0);
    expect(result.volumeGal * LITERS_PER_US_GALLON).toBeCloseTo(targetLiters, 0);
  });

  it('uses formulation water for sweetened blends when the tank ABV changes', () => {
    const nonWater = GR007_ADDITIVES_BEFORE_WATER.filter((row) => row.ingredient_type !== 'water').map((row) => ({
      ingredientType: row.ingredient_type,
      name: row.name,
      amount: row.amount,
      unit: row.unit,
      densityGPerMl: row.density_g_per_ml,
      densityAssumption: row.density_assumption,
      specStatus: row.spec_status,
    }));
    const adjusted = proofingWaterAfterSpiritAdjustment(
      35,
      GR007_SPIRIT.volumeGal,
      86,
      [GR007_SPIRIT],
      nonWater,
      targetAbv,
    );
    const solved = solveWaterForTargetAbv([GR007_SPIRIT], nonWater, targetAbv);
    expect(solved).not.toBeNull();
    expect(adjusted.waterGal).toBeCloseTo(solved!.waterGal, 2);
    expect(adjusted.waterGal).toBeLessThan(70);
  });
});
