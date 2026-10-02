import { describe, expect, it } from 'vitest';
import { blendRecipeSnapshotKey, buildBlendRecipeSnapshot } from './blend-recipe-version';

describe('blend recipe versions', () => {
  it('treats the same formula as the same version even if lines are reordered', () => {
    const first = buildBlendRecipeSnapshot({
      product_name: 'Coffee liqueur',
      target_abv: 25,
      target_brix: null,
      target_sugar_g_per_l: 220,
      target_volume_gal: 100,
      scale_factor: 1,
      source_type: 'tank',
      notes: '',
      spirit_sources: [
        { spirit_label: 'Rum', volume_gal: 40, abv: 75 },
        { spirit_label: 'Neutral', volume_gal: 10, abv: 95 },
      ],
      ingredients: [
        {
          ingredient_type: 'sugar',
          name: 'Sugar',
          amount: 100,
          unit: 'lbs',
          notes: '',
        },
      ],
    });
    const second = buildBlendRecipeSnapshot({
      product_name: 'Coffee liqueur',
      target_abv: 25,
      target_brix: null,
      target_sugar_g_per_l: 220,
      target_volume_gal: 100,
      scale_factor: 1,
      source_type: 'tank',
      notes: '',
      spirit_sources: [
        { spirit_label: 'Neutral', volume_gal: 10, abv: 95 },
        { spirit_label: 'Rum', volume_gal: 40, abv: 75 },
      ],
      ingredients: [
        {
          ingredient_type: 'sugar',
          name: 'Sugar',
          amount: 100,
          unit: 'lbs',
          notes: '',
        },
      ],
    });
    expect(blendRecipeSnapshotKey(first)).toBe(blendRecipeSnapshotKey(second));
  });

  it('changes the key when the target ABV changes', () => {
    const base = {
      product_name: 'Rum',
      target_brix: null,
      scale_factor: 1,
      source_type: 'tank',
      notes: '',
      spirit_sources: [{ spirit_label: 'Rum', volume_gal: 10, abv: 75 }],
      ingredients: [],
    };
    const first = buildBlendRecipeSnapshot({ ...base, target_abv: 40 });
    const second = buildBlendRecipeSnapshot({ ...base, target_abv: 35 });
    expect(blendRecipeSnapshotKey(first)).not.toBe(blendRecipeSnapshotKey(second));
  });
});
