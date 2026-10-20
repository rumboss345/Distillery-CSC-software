import { describe, expect, it } from 'vitest';
import {
  applyTankWithdrawals,
  consumeOldestLots,
  distillationLabelsFromLots,
  intakeAtOrBefore,
  productNameFromIntakes,
  productNamesFromRemainingLots,
  transferIntakeSummary,
  transferredLiquidPhrase,
  type TankLot,
  type TankProductIntake,
} from './tank-product-name';

const blend = (productName: string, occurredAt = '2026-04-02 12:00:00'): TankProductIntake => ({
  kind: 'blend',
  occurredAt,
  productName,
});

describe('productNameFromIntakes', () => {
  it('uses the newest blend product name', () => {
    expect(productNameFromIntakes([
      blend('Dark Rum', '2026-04-02 12:00:00'),
      { kind: 'cut', occurredAt: '2026-04-01 08:00:00' },
    ], () => 'should not walk')).toBe('Dark Rum');
  });

  it('uses only the newest blend when older blends are still in the history', () => {
    expect(productNameFromIntakes([
      blend('Dark', '2026-04-04 12:00:00'),
      blend('GR Dark', '2026-04-03 12:00:00'),
      blend('sf', '2026-04-02 12:00:00'),
      blend('rum', '2026-04-01 12:00:00'),
    ], () => null)).toBe('Dark');
  });

  it('does not use an older blend after a cut, stillage, or opening balance', () => {
    const olderBlend = blend('Dark Rum', '2026-03-01 12:00:00');
    expect(productNameFromIntakes([
      { kind: 'cut', occurredAt: '2026-04-01 08:00:00' },
      olderBlend,
    ], () => null)).toBeNull();
    expect(productNameFromIntakes([
      { kind: 'stillage', occurredAt: '2026-04-01 08:00:00' },
      olderBlend,
    ], () => null)).toBeNull();
    expect(productNameFromIntakes([
      { kind: 'opening', occurredAt: '2026-04-01 08:00:00' },
      olderBlend,
    ], () => null)).toBeNull();
  });

  it('follows a transfer to the source product at that time', () => {
    expect(productNameFromIntakes([
      {
        kind: 'transfer',
        occurredAt: '2026-04-04 09:00:00',
        sourceTankId: 12,
      },
      blend('Old Rum', '2026-01-01 00:00:00'),
    ], (sourceTankId, occurredAt) => {
      expect(sourceTankId).toBe(12);
      expect(occurredAt).toBe('2026-04-04 09:00:00');
      return 'Dark Rum';
    })).toBe('Dark Rum');
  });
});

const lot = (productName: string, at: string, volumeGal: number): TankLot => ({
  at,
  volumeGal,
  kind: 'blend',
  productName,
});

describe('applyTankWithdrawals', () => {
  it('names only the blend gallons that are still in the tank', () => {
    const remaining = applyTankWithdrawals(
      [
        lot('rum for barrels', '2026-01-01 10:00:00', 40),
        lot('sf', '2026-02-01 10:00:00', 40),
        lot('GR Dark', '2026-03-01 10:00:00', 40),
        lot('Dark', '2026-04-01 10:00:00', 30),
      ],
      [{ at: '2026-04-02 10:00:00', volumeGal: 120 }],
    );
    expect(productNamesFromRemainingLots(remaining)).toBe('Dark');
    expect(remaining.reduce((sum, item) => sum + item.volumeGal, 0)).toBeCloseTo(30);
  });

  it('keeps an older blend when that liquid is still in the tank', () => {
    const remaining = applyTankWithdrawals(
      [
        lot('GR Dark', '2026-03-01 10:00:00', 40),
        lot('Dark', '2026-04-01 10:00:00', 30),
      ],
      [{ at: '2026-04-02 10:00:00', volumeGal: 20 }],
    );
    expect(productNamesFromRemainingLots(remaining)).toBe('Dark · GR Dark');
  });

  it('names the gallons a withdrawal takes, not the gallons that stay', () => {
    const taken = consumeOldestLots(
      [
        lot('rum for barrels', '2026-01-01 10:00:00', 40),
        lot('sf', '2026-02-01 10:00:00', 40),
        lot('GR Dark', '2026-03-01 10:00:00', 40),
        lot('Dark', '2026-04-01 10:00:00', 30),
      ],
      120,
    );
    expect(productNamesFromRemainingLots(taken)).toBe('GR Dark · sf · rum for barrels');
  });

  it('drops a blend once its gallons have left', () => {
    const remaining = applyTankWithdrawals(
      [
        lot('GR Dark', '2026-03-01 10:00:00', 10),
        lot('Dark', '2026-04-01 10:00:00', 30),
      ],
      [{ at: '2026-04-02 10:00:00', volumeGal: 10 }],
    );
    expect(productNamesFromRemainingLots(remaining)).toBe('Dark');
  });
});

describe('distillationLabelsFromLots', () => {
  const distilled = (
    cutType: string,
    runType: string,
    at: string,
    volumeGal = 10,
  ): TankLot => ({
    at,
    volumeGal,
    kind: 'cut',
    cutType,
    runType,
  });

  it('names the distillation and the cut when the gallons are not a blend', () => {
    expect(distillationLabelsFromLots([
      distilled('tails', 'wash', '2026-01-01 10:00:00'),
    ])).toBe('Low Wine Run · Tails');
    expect(distillationLabelsFromLots([
      distilled('hearts', 'low_wines', '2026-02-01 10:00:00'),
    ])).toBe('Rum Run · Hearts');
    expect(distillationLabelsFromLots([
      distilled('hearts', 'vodka', '2026-02-02 10:00:00'),
    ])).toBe('Vodka Run · Hearts');
  });

  it('leaves a blend name off the distillation line', () => {
    expect(distillationLabelsFromLots([
      lot('Dark', '2026-04-01 10:00:00', 30),
      distilled('heads', 'gin', '2026-03-01 10:00:00', 5),
    ])).toBe('Gin Run · Heads');
  });

  it('lists each distillation and cut that still has gallons', () => {
    expect(distillationLabelsFromLots([
      distilled('tails', 'wash', '2026-01-01 10:00:00'),
      distilled('hearts', 'low_wines', '2026-04-01 10:00:00'),
    ])).toBe('Rum Run · Hearts, Low Wine Run · Tails');
  });
});

describe('transferIntakeSummary', () => {
  it('names the blend that was transferred', () => {
    expect(transferIntakeSummary('Canning blending tank', transferredLiquidPhrase('Dark', null)))
      .toBe('Dark from Canning blending tank');
  });

  it('names the distillation and cut that were transferred', () => {
    expect(transferIntakeSummary('Latina 500L', transferredLiquidPhrase(null, 'Low Wine Run · Heads')))
      .toBe('Low Wine Run · Heads from Latina 500L');
  });

  it('keeps the source tank when the liquid is unknown', () => {
    expect(transferIntakeSummary('Latina 500L', null)).toBe('Transfer from Latina 500L');
  });
});

describe('intakeAtOrBefore', () => {
  it('keeps intakes from the moment of a transfer and earlier', () => {
    expect(intakeAtOrBefore('2026-04-02 11:00:00', '2026-04-02 12:00:00')).toBe(true);
    expect(intakeAtOrBefore('2026-04-02 12:00:00', '2026-04-02 12:00:00')).toBe(true);
    expect(intakeAtOrBefore('2026-04-02 13:00:00', '2026-04-02 12:00:00')).toBe(false);
  });
});
