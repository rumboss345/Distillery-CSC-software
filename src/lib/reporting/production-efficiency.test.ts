import { describe, expect, it } from 'vitest';
import { rollupStillEfficiency, type ProductionEfficiencySnapshot } from './production-efficiency';
import type { StillEfficiencyRow } from './still-efficiency';

function row(partial: Partial<StillEfficiencyRow> & Pick<StillEfficiencyRow, 'run_type_key'>): StillEfficiencyRow {
  return {
    run_type_label: partial.run_type_label ?? partial.run_type_key,
    completed_runs: 1,
    avg_hearts_recovery_pct: null,
    total_alcohol_charged_gal: 0,
    total_hearts_laa_gal: 0,
    total_alcohol_loss_gal: null,
    net_loss_gain_label: '—',
    ...partial,
  };
}

describe('rollupStillEfficiency', () => {
  it('weights hearts recovery across run types by alcohol charged', () => {
    const summary = rollupStillEfficiency([
      row({
        run_type_key: 'wash',
        completed_runs: 2,
        total_alcohol_charged_gal: 10,
        total_hearts_laa_gal: 4,
        total_alcohol_loss_gal: 1,
      }),
      row({
        run_type_key: 'spirit',
        completed_runs: 1,
        total_alcohol_charged_gal: 10,
        total_hearts_laa_gal: 6,
        total_alcohol_loss_gal: -0.5,
      }),
    ]);
    expect(summary.completed_still_runs).toBe(3);
    expect(summary.hearts_recovery_pct).toBeCloseTo(50, 1);
    expect(summary.net_alcohol_balance_gal).toBeCloseTo(0.5, 3);
    expect(summary.net_alcohol_balance_label).toMatch(/loss/i);
  });

  it('returns null recovery when no alcohol charge is recorded', () => {
    const summary = rollupStillEfficiency([
      row({ run_type_key: 'wash', total_alcohol_charged_gal: 0, total_hearts_laa_gal: 5 }),
    ]);
    expect(summary.hearts_recovery_pct).toBeNull();
  });
});

describe('ProductionEfficiencySnapshot shape', () => {
  it('allows empty still breakdown', () => {
    const empty: ProductionEfficiencySnapshot = {
      still_by_run_type: [],
      completed_still_runs: 0,
      hearts_recovery_pct: null,
      net_alcohol_balance_gal: null,
      net_alcohol_balance_label: '—',
      avg_ferment_days: null,
      avg_wash_yield_pct: null,
      wash_batches_with_yield: 0,
    };
    expect(empty.completed_still_runs).toBe(0);
  });
});
