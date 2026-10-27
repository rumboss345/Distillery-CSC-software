import { describe, expect, it } from 'vitest';
import {
  blendDistillationTankPulls,
  DISTILLATION_SOURCE_TANK_REQUIRED,
  distillationChargeTypeChoices,
  distillationSourceSummary,
  distillationSourceTypeChoices,
  formatDistillationSourceDetail,
  distillationTankPullError,
  fitDistillationTankPulls,
  tanksOfEquipmentType,
} from './distillation-source-tanks';

describe('distillation source tanks', () => {
  it('lists holding tanks, stillage tanks, and collection vessels in that order', () => {
    expect(distillationSourceTypeChoices([
      'collection_vessel',
      'fermenter',
      'holding_tank',
      'pot_still',
      'stillage_tank',
    ])).toEqual(['holding_tank', 'stillage_tank', 'collection_vessel']);
  });

  it('leaves stillage tanks out of a distillation charge', () => {
    expect(distillationChargeTypeChoices([
      'holding_tank',
      'stillage_tank',
      'collection_vessel',
      'fermenter',
    ])).toEqual(['holding_tank', 'collection_vessel']);
  });

  it('omits types that are not on the spirit ledger', () => {
    expect(distillationSourceTypeChoices(['fermenter', 'mash_tun', 'pot_still'])).toEqual([]);
  });

  it('shows only tanks of the selected equipment type', () => {
    const tanks = [
      { id: 1, equipment_type: 'holding_tank', name: 'Low Wines' },
      { id: 2, equipment_type: 'collection_vessel', name: 'Hearts jug' },
      { id: 3, equipment_type: 'holding_tank', name: 'High proof' },
    ];
    expect(tanksOfEquipmentType(tanks, '').map((tank) => tank.id)).toEqual([]);
    expect(tanksOfEquipmentType(tanks, 'holding_tank').map((tank) => tank.name)).toEqual([
      'Low Wines',
      'High proof',
    ]);
    expect(tanksOfEquipmentType(tanks, 'collection_vessel').map((tank) => tank.id)).toEqual([2]);
  });

  it('blends gallons and ABV from more than one tank', () => {
    expect(blendDistillationTankPulls([
      { tankId: 1, volumeGal: 10, abv: 80 },
      { tankId: 2, volumeGal: 10, abv: 40 },
      { tankId: 0, volumeGal: 5, abv: 90 },
    ])).toEqual({ volumeGal: 20, abv: 60 });
  });

  it('rejects a second pull from the same tank and a pull larger than the tank', () => {
    const available = new Map([[1, 5], [2, 8]]);
    expect(distillationTankPullError([
      { tankId: 1, volumeGal: 3, abv: 70, tankName: 'Hearts' },
      { tankId: 1, volumeGal: 1, abv: 70, tankName: 'Hearts' },
    ], available)).toBe('Each tank can be chosen once.');
    expect(distillationTankPullError([
      { tankId: 2, volumeGal: 9, abv: 25, tankName: 'Tails' },
    ], available)).toBe('Only 8.0 gal available in Tails.');
    expect(distillationTankPullError([], available)).toBe(DISTILLATION_SOURCE_TANK_REQUIRED);
  });

  it('lets a planned pull skip the tank and its current volume', () => {
    const available = new Map([[1, 5]]);
    expect(distillationTankPullError([], available, { required: false, checkAvailable: false })).toBeNull();
    expect(distillationTankPullError([
      { tankId: 1, volumeGal: 0, abv: 70, tankName: 'Hearts' },
    ], available, { required: false, checkAvailable: false })).toBeNull();
    expect(distillationTankPullError([
      { tankId: 1, volumeGal: 9, abv: 70, tankName: 'Hearts' },
    ], available, { required: false, checkAvailable: false })).toBeNull();
    expect(distillationTankPullError([], available, { required: true })).toBe(DISTILLATION_SOURCE_TANK_REQUIRED);
  });

  it('joins source tank names', () => {
    expect(distillationSourceSummary(['High proof', 'Latina 500L'])).toBe('High proof + Latina 500L');
  });

  it('names the place, what the liquid was, and the alcohol percent', () => {
    expect(formatDistillationSourceDetail({
      place: 'Hearts tank',
      what: 'Rum Run · Hearts from D-12',
      abv: 75.2,
    })).toBe('Hearts tank — Rum Run · Hearts from D-12 · 75.2% ABV');
    expect(formatDistillationSourceDetail({
      place: 'Hearts tank',
      what: 'Rum Run · Hearts from D-12',
      abv: 40,
      previousAbv: 75.2,
    })).toBe('Hearts tank — Rum Run · Hearts from D-12 · 40.0% ABV (was 75.2%)');
    expect(formatDistillationSourceDetail({
      place: 'Fermenter 2',
      what: 'W-2026-004',
      abv: 8.5,
    })).toBe('Fermenter 2 — W-2026-004 · 8.5% ABV');
    expect(formatDistillationSourceDetail({ place: 'Hearts tank' })).toBe('Hearts tank');
    expect(formatDistillationSourceDetail({})).toBe('—');
  });

  it('draws a finished-volume spirit pull from the chosen tanks in order', () => {
    const available = new Map([[1, 200], [2, 3.4]]);
    expect(fitDistillationTankPulls([
      { tankId: 1, volumeGal: 200, abv: 92, tankName: 'High proof' },
      { tankId: 2, volumeGal: 3.4, abv: 78, tankName: 'Latina' },
    ], 40, available).map((pull) => [pull.tankId, pull.volumeGal])).toEqual([[1, 40]]);
    expect(fitDistillationTankPulls([
      { tankId: 1, volumeGal: 10, abv: 92 },
      { tankId: 2, volumeGal: 3.4, abv: 78 },
    ], 12, available).map((pull) => pull.volumeGal)).toEqual([10, 2]);
  });
});
