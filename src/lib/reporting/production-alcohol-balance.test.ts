import { describe, expect, it } from 'vitest';
import {
  formatBottlingAlcoholVariance,
  formatNetAlcoholLossGain,
  summarizeProductionAlcoholBalance,
} from './production-alcohol-balance';
import type { ReportDateRange } from './period';

const allTime: ReportDateRange = { preset: 'all', label: 'All time', from: null, to: null };

describe('summarizeProductionAlcoholBalance', () => {
  it('returns zero totals when no runs exist', () => {
    const summary = summarizeProductionAlcoholBalance(allTime);
    expect(summary.distillationNetAlcoholGal).toBe(0);
    expect(summary.bottlingAlcoholVarianceGal).toBe(0);
  });
});

describe('formatNetAlcoholLossGain', () => {
  it('labels net loss and gain', () => {
    expect(formatNetAlcoholLossGain(2.5)).toContain('loss');
    expect(formatNetAlcoholLossGain(-1.2)).toContain('gain');
    expect(formatNetAlcoholLossGain(0)).toContain('No net');
  });
});

describe('formatBottlingAlcoholVariance', () => {
  it('labels bottling variance', () => {
    expect(formatBottlingAlcoholVariance(0.4)).toContain('Bottling');
    expect(formatBottlingAlcoholVariance(0)).toBe('');
  });
});
