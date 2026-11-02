import { describe, expect, it } from 'vitest';
import { reportSourcePath } from './report-links';

describe('reportSourcePath', () => {
  it('builds production page deep links', () => {
    expect(reportSourcePath({ kind: 'wash', id: 3 })).toBe('/wash?record=3');
    expect(reportSourcePath({ kind: 'fermentation_logs', id: 5, equipmentId: 9 }))
      .toBe('/fermentation?wash=5&logsEquipment=9');
    expect(reportSourcePath({ kind: 'distillation', id: 12 })).toBe('/distillation?record=12');
  });
});
