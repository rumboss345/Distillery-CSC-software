import { describe, expect, it } from 'vitest';
import {
  defaultHomeBatchCostState,
  homeBatchBlendUnit,
  homeBatchBottlingCostPerBottle,
  homeBatchBottlingTotalCost,
  homeBatchDistillCostPerGal,
  homeBatchDistillSpiritCost,
  homeBatchWashCostPerGal,
  type HomeBatchBlend,
  type HomeBatchCostState,
} from './home-batch-cost';

describe('home batch wash and distill cost', () => {
  it('derives wash cost per gallon from ingredients', () => {
    const state = defaultHomeBatchCostState();
    const wash = state.washes[0];
    expect(homeBatchWashCostPerGal(wash)).toBeGreaterThan(0);
    expect(homeBatchDistillSpiritCost(state.distills[0], state.washes)).toBeGreaterThan(0);
    expect(homeBatchDistillCostPerGal(state.distills[0], state.washes)).toBeGreaterThan(0);
  });
});

describe('home batch blend allocation', () => {
  const base = defaultHomeBatchCostState();

  it('volume mode weights lines by gallons × source $/gal', () => {
    const blend: HomeBatchBlend = {
      id: 'bl1',
      name: 'Mix',
      extraCost: '0',
      lines: [
        { id: 'l1', sourceKind: 'distill', sourceId: 'd1', volumeGal: '10', abv: '' },
        { id: 'l2', sourceKind: 'distill', sourceId: 'd1', volumeGal: '10', abv: '' },
      ],
    };
    const state: HomeBatchCostState = { ...base, blends: [blend] };
    const unit = homeBatchBlendUnit(blend, state, 'volume');
    const dpg = homeBatchDistillCostPerGal(state.distills[0], state.washes);
    expect(unit.costPerGal).toBeCloseTo(dpg, 4);
  });

  it('rolls blend cost into bottling total', () => {
    const blend: HomeBatchBlend = {
      id: 'bl2',
      name: 'Blend',
      extraCost: '10',
      lines: [{ id: 'l1', sourceKind: 'distill', sourceId: 'd1', volumeGal: '20', abv: '' }],
    };
    const state: HomeBatchCostState = {
      ...base,
      blends: [blend],
      bottlings: [
        {
          id: 'bot',
          name: 'Bottle',
          sourceKind: 'blend',
          sourceId: 'bl2',
          volumeGal: '10',
          bottleCount: '12',
          retailPerBottle: '40',
          packCost: '5',
        },
      ],
    };
    const total = homeBatchBottlingTotalCost(state.bottlings[0], state, 'volume');
    expect(total).toBeGreaterThan(5);
    expect(homeBatchBottlingCostPerBottle(state.bottlings[0], state, 'volume')).toBeCloseTo(total / 12, 4);
  });
});
