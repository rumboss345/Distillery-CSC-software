import { describe, expect, it } from 'vitest';
import {
  availableFermentationMeasures,
  fermentationGraphPoints,
  fermentationGraphSummary,
  fermentationMeasureAxis,
  graphLabelIndexes,
} from './fermentation-log-graph';

const logs = [
  { logged_at: '2025-06-17T08:00:00', temperature_f: 80, brix: 11.6, ph: 4.1 },
  { logged_at: '2025-06-15T08:00:00', temperature_f: 72, brix: 16.8, ph: 4.5 },
  { logged_at: '2025-06-16T08:00:00', temperature_f: 78, brix: 14.2, ph: 4.3 },
];

describe('fermentation log graph', () => {
  it('plots readings from oldest to newest and estimates ABV from the start Brix', () => {
    const points = fermentationGraphPoints(logs, 16.8);
    expect(points.map((point) => point.brix)).toEqual([16.8, 14.2, 11.6]);
    expect(points[0].abv).toBe(0);
    expect(points[2].abv).toBeGreaterThan(points[1].abv ?? 0);
    expect(availableFermentationMeasures(points)).toEqual(['brix', 'temperature', 'abv', 'ph']);
    expect(fermentationGraphSummary(points, 'brix')).toMatch(/16\.8° Brix on .+ to 11\.6° Brix on /);
  });

  it('plots Actual Start Brix as the first point when it is the first log', () => {
    const points = fermentationGraphPoints([
      { logged_at: '2026-10-20T18:05:00.000Z', temperature_f: 76, brix: 14.2, ph: 4.2 },
      { logged_at: '2026-10-20T18:00:00.000Z', temperature_f: null, brix: 16.4, ph: null },
    ], 16.4);
    expect(points.map((point) => point.brix)).toEqual([16.4, 14.2]);
    expect(points[0].abv).toBe(0);
    expect(points[0].temperature).toBeNull();
    expect(availableFermentationMeasures(points)).toContain('brix');
    expect(fermentationGraphSummary(points, 'brix')).toMatch(/16\.4° Brix on .+ to 14\.2° Brix on /);
  });

  it('leaves out estimated ABV and pH when those readings are missing', () => {
    const points = fermentationGraphPoints([
      { logged_at: '2025-06-15T08:00:00', temperature_f: 72, brix: 16.8, ph: null },
    ], null);
    expect(availableFermentationMeasures(points)).toEqual(['brix', 'temperature']);
    expect(fermentationGraphSummary(points, 'temperature')).toMatch(/^One reading: 72°F on /);
  });

  it('keeps the Brix axis at zero and includes the ready line', () => {
    const axis = fermentationMeasureAxis('brix', [16.8, 14.2, 11.6]);
    expect(axis.min).toBe(0);
    expect(axis.max).toBeGreaterThanOrEqual(16.8);
    expect(axis.min).toBeLessThanOrEqual(10);
    expect(axis.max).toBeGreaterThanOrEqual(10);
  });

  it('zooms temperature instead of starting at zero', () => {
    const axis = fermentationMeasureAxis('temperature', [72, 78, 80]);
    expect(axis.min).toBeGreaterThan(40);
    expect(axis.max).toBeGreaterThanOrEqual(80);
    expect(axis.max).toBeLessThan(120);
  });

  it('thins axis labels when there are many readings', () => {
    expect(graphLabelIndexes(3)).toEqual([0, 1, 2]);
    const labels = graphLabelIndexes(10);
    expect(labels[0]).toBe(0);
    expect(labels[labels.length - 1]).toBe(9);
    expect(labels.length).toBeLessThan(10);
  });
});
