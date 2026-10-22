import { describe, expect, it } from 'vitest';
import { estimateAbvFromBrix } from '../fermentation';
import { fermentationFinishReading } from './fermentation-rows';

describe('fermentationFinishReading', () => {
  it('uses the last Brix logged on that fermenter', () => {
    const reading = fermentationFinishReading(16.8, 2.4, 11.4, 3, 1);
    expect(reading.finish_brix).toBe(2.4);
    expect(reading.alcohol_pct).toBe(estimateAbvFromBrix(16.8, 2.4));
  });

  it('uses the batch finishing Brix when the wash has no logs', () => {
    const reading = fermentationFinishReading(15.5, null, null, 3, null);
    expect(reading.finish_brix).toBe(3);
    expect(reading.alcohol_pct).toBe(estimateAbvFromBrix(15.5, 3));
  });

  it('does not copy another fermenter reading onto a fermenter with no log', () => {
    const reading = fermentationFinishReading(16.8, null, 2.4, 2.4, 2);
    expect(reading.finish_brix).toBeNull();
    expect(reading.alcohol_pct).toBeNull();
  });

  it('leaves alcohol blank when the start Brix was never measured', () => {
    const reading = fermentationFinishReading(null, 2.4, 2.4, 2.4, 1);
    expect(reading.finish_brix).toBe(2.4);
    expect(reading.alcohol_pct).toBeNull();
  });
});
