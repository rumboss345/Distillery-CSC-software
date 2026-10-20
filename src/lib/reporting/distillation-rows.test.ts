import { describe, expect, it } from 'vitest';
import { groupDistillationReportRows } from './distillation-rows';

describe('groupDistillationReportRows', () => {
  it('keeps the distillation types in production order', () => {
    const groups = groupDistillationReportRows([
      { run_type_key: 'gin', batch_number: 'G-1' },
      { run_type_key: 'wash', batch_number: 'W-1' },
      { run_type_key: 'low_wines', batch_number: 'S-1' },
      { run_type_key: 'vodka', batch_number: 'V-1' },
      { run_type_key: 'wash', batch_number: 'W-2' },
      { run_type_key: 'heavy_rum', batch_number: 'H-1' },
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      'Low Wine Run',
      'Rum Run',
      'Vodka Run',
      'Heavy Rum',
      'Gin Run',
    ]);
    expect(groups[0].rows.map((row) => row.batch_number)).toEqual(['W-1', 'W-2']);
    expect(groups[1].rows.map((row) => row.batch_number)).toEqual(['S-1']);
    expect(groups[2].rows.map((row) => row.batch_number)).toEqual(['V-1']);
    expect(groups[3].rows.map((row) => row.batch_number)).toEqual(['H-1']);
    expect(groups[4].rows.map((row) => row.batch_number)).toEqual(['G-1']);
  });

  it('puts an unrecognized type after the production groups', () => {
    const groups = groupDistillationReportRows([
      { run_type_key: 'experimental', batch_number: 'X-1' },
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      'Low Wine Run',
      'Rum Run',
      'Vodka Run',
      'Heavy Rum',
      'Gin Run',
      'Other',
    ]);
    expect(groups[5].rows).toEqual([{ run_type_key: 'experimental', batch_number: 'X-1' }]);
  });
});