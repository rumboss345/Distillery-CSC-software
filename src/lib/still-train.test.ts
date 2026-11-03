import { describe, expect, it } from 'vitest';
import {
  distillationRunUsesStillTrain,
  formatDistillationStillDisplay,
  stillTrainEquipmentToRelease,
  stillTrainRunChanged,
} from './still-train';

describe('still train helpers', () => {
  it('detects train runs by pot equipment id', () => {
    expect(distillationRunUsesStillTrain({ still_pot_equipment_id: 10 })).toBe(true);
    expect(distillationRunUsesStillTrain({ still_pot_equipment_id: null })).toBe(false);
  });

  it('lists pot and column for cleaning release', () => {
    expect(stillTrainEquipmentToRelease({
      still_pot_equipment_id: 1,
      still_column_equipment_id: 3,
    })).toEqual([1, 3]);
  });

  it('detects train or still changes when leaving a run', () => {
    expect(stillTrainRunChanged(
      { still_name: 'Carl', still_pot_equipment_id: 1, still_column_equipment_id: 2 },
      { still_name: 'Carl', still_pot_equipment_id: 1, still_column_equipment_id: 2, status: 'complete' },
      false,
    )).toBe(true);
    expect(stillTrainRunChanged(
      { still_name: 'Vendome', still_pot_equipment_id: null, still_column_equipment_id: null },
      { still_name: 'Vendome', still_pot_equipment_id: null, still_column_equipment_id: null, status: 'running' },
      true,
    )).toBe(false);
  });

  it('formats legacy still name unchanged', () => {
    expect(formatDistillationStillDisplay({
      still_name: 'Vendome',
      still_pot_equipment_id: null,
      still_column_equipment_id: null,
    })).toBe('Vendome');
  });
});
