import { describe, expect, it } from 'vitest';
import { buildAlcoholReconciliation, type ReconciliationInput } from './reconciliation';

function emptyInput(overrides: Partial<ReconciliationInput> = {}): ReconciliationInput {
  return {
    runs: [],
    cuts: [],
    charges: [],
    transfers: [],
    dilutions: [],
    blends: [],
    barrelFills: [],
    bottlings: [],
    corrections: [],
    closingTankLaaGal: null,
    periodEndsToday: true,
    ...overrides,
  };
}

function stage(result: ReturnType<typeof buildAlcoholReconciliation>, key: string) {
  const found = result.stages.find((row) => row.key === key);
  if (!found) throw new Error(`missing stage ${key}`);
  return found;
}

describe('alcohol reconciliation', () => {
  it('reports no data for an empty period', () => {
    const result = buildAlcoholReconciliation(emptyInput());
    expect(result.hasData).toBe(false);
    expect(result.recordedDifferenceLaaGal).toBe(0);
  });

  it('compares still charge with collected alcohol and drops cuts not stored', () => {
    const result = buildAlcoholReconciliation(emptyInput({
      runs: [{ id: 1, batch_number: 'R1', charged_laa_gal: 30, collected_laa_gal: 29 }],
      cuts: [
        { id: 1, run_id: 1, batch_number: 'R1', volume_gal: 40, abv: 70, into_tank: true },
        { id: 2, run_id: 1, batch_number: 'R1', volume_gal: 1, abv: 80, into_tank: false },
      ],
    }));
    expect(stage(result, 'distillation').differenceLaaGal).toBe(-1);
    expect(stage(result, 'collection').differenceLaaGal).toBeCloseTo(-0.8, 4);
    expect(stage(result, 'collection').records[0].href).toBe('/distillation?record=1');
    expect(result.tankNetChangeLaaGal).toBeCloseTo(28, 4);
  });

  it('keeps alcohol through proofing and reports contraction as volume, not alcohol', () => {
    // 100 gal at 80% + 100 gal water → about 196.4 gal at 40.73% (same 80 gal pure alcohol).
    const result = buildAlcoholReconciliation(emptyInput({
      dilutions: [{
        id: 1,
        tank_id: 4,
        tank_name: 'Tank 4',
        spirit_volume_gal: 100,
        spirit_abv: 80,
        water_gal: 100,
        finished_volume_gal: 196.4,
        finished_abv: 80 / 1.964,
      }],
    }));
    const proofing = stage(result, 'proofing');
    expect(proofing.inLaaGal).toBe(80);
    expect(proofing.outLaaGal).toBeCloseTo(80, 3);
    expect(Math.abs(proofing.differenceLaaGal ?? 1)).toBeLessThan(0.005);
    expect(result.proofingWaterGal).toBe(100);
    expect(result.proofingContractionGal).toBeCloseTo(3.6, 3);
  });

  it('counts additive alcohol into a blend and compares with the finished blend', () => {
    const result = buildAlcoholReconciliation(emptyInput({
      blends: [{
        id: 3,
        batch_number: 'BL-3',
        tank_draw_laa_gal: 34,
        barrel_draw_laa_gal: 0,
        additive_laa_gal: 1,
        output_volume_gal: 87.5,
        output_abv: 40,
      }],
    }));
    expect(stage(result, 'blending').inLaaGal).toBe(35);
    expect(stage(result, 'blending').differenceLaaGal).toBe(0);
    expect(result.tankNetChangeLaaGal).toBe(1);
  });

  it('measures bottling against the tank draw and counts spirit sent back', () => {
    const result = buildAlcoholReconciliation(emptyInput({
      bottlings: [{
        id: 7,
        batch_number: 'BT-7',
        draw_gal: 20,
        draw_abv: 40,
        bottled_gal: 19,
        bottled_abv: 40,
        returned_gal: 0.5,
      }],
    }));
    const bottling = stage(result, 'bottling');
    expect(bottling.inLaaGal).toBe(8);
    expect(bottling.outLaaGal).toBe(7.8);
    expect(bottling.differenceLaaGal).toBe(-0.2);
    expect(bottling.records[0].href).toBe('/bottling?record=7');
    expect(result.tankNetChangeLaaGal).toBe(-7.8);
  });

  it('works out opening stock from closing stock only when the period ends today', () => {
    const input = emptyInput({
      cuts: [{ id: 1, run_id: 1, batch_number: 'R1', volume_gal: 10, abv: 50, into_tank: true }],
      closingTankLaaGal: 105,
    });
    const current = buildAlcoholReconciliation(input);
    expect(current.closingTankLaaGal).toBe(105);
    expect(current.openingTankLaaGal).toBe(100);
    const past = buildAlcoholReconciliation({ ...input, periodEndsToday: false });
    expect(past.closingTankLaaGal).toBeNull();
    expect(past.openingTankLaaGal).toBeNull();
  });

  it('sums every stage difference into the recorded gain or loss', () => {
    const result = buildAlcoholReconciliation(emptyInput({
      runs: [{ id: 1, batch_number: 'R1', charged_laa_gal: 30, collected_laa_gal: 29 }],
      transfers: [{ id: 2, volume_gal: 5, abv: 60, discarded: true, source_tank_id: 1 }],
      corrections: [{ id: 1, tank_id: 1, tank_name: 'Tank 1', book_volume_gal: 100, book_abv: 60, set_volume_gal: 99, set_abv: null }],
    }));
    expect(result.recordedDifferenceLaaGal).toBeCloseTo(-1 - 3 - 0.6, 4);
  });
});
