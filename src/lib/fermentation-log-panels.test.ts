import { describe, expect, it } from 'vitest';
import { fermenterColumnTags, fermenterLogPanels } from './fermentation-log-panels';

const ferm1 = { floor_equipment_id: 11, equipment_name: 'Fermentation 1', volume_gal: 1100 };
const ferm2 = { floor_equipment_id: 12, equipment_name: 'Fermentation 2', volume_gal: 1100 };

describe('fermenterLogPanels', () => {
  it('keeps each distilled fermenter log panel after assignments are released', () => {
    const panels = fermenterLogPanels({
      batchComplete: true,
      assignments: [],
      logSources: [
        { floor_equipment_id: 11, equipment_name: 'Fermentation 1' },
        { floor_equipment_id: 12, equipment_name: 'Fermentation 2' },
      ],
    });

    expect(panels).toEqual([
      {
        equipmentId: 11,
        equipmentName: 'Fermentation 1',
        readOnly: true,
        distilled: true,
      },
      {
        equipmentId: 12,
        equipmentName: 'Fermentation 2',
        readOnly: true,
        distilled: true,
      },
    ]);
  });

  it('shows the remaining assignment and the distilled fermenter as read-only', () => {
    const panels = fermenterLogPanels({
      batchComplete: false,
      assignments: [ferm2],
      logSources: [
        { floor_equipment_id: 11, equipment_name: 'Fermentation 1' },
        { floor_equipment_id: 12, equipment_name: 'Fermentation 2' },
      ],
    });

    expect(panels).toEqual([
      {
        equipmentId: 12,
        equipmentName: 'Fermentation 2',
        volumeGal: 1100,
        readOnly: false,
        distilled: false,
      },
      {
        equipmentId: 11,
        equipmentName: 'Fermentation 1',
        readOnly: true,
        distilled: true,
      },
    ]);
  });

  it('locks assigned fermenters when the batch is complete', () => {
    const panels = fermenterLogPanels({
      batchComplete: true,
      assignments: [ferm1],
      logSources: [{ floor_equipment_id: 11, equipment_name: 'Fermentation 1' }],
    });

    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({ equipmentId: 11, readOnly: true, distilled: false });
  });

  it('falls back to one editable panel when nothing is assigned yet', () => {
    expect(fermenterLogPanels({
      batchComplete: false,
      assignments: [],
      logSources: [],
    })).toEqual([
      {
        equipmentId: null,
        equipmentName: '',
        readOnly: false,
        distilled: false,
      },
    ]);
  });
});

describe('fermenterColumnTags', () => {
  it('lists distilled fermenters on a completed wash that no longer has assignments', () => {
    expect(fermenterColumnTags({
      assignments: [],
      logSources: [
        { floor_equipment_id: 11, equipment_name: 'Fermentation 1' },
        { floor_equipment_id: 12, equipment_name: 'Fermentation 2' },
      ],
    })).toEqual([
      { key: 'log-11', label: 'Fermentation 1 (distilled)', distilled: true },
      { key: 'log-12', label: 'Fermentation 2 (distilled)', distilled: true },
    ]);
  });

  it('keeps the active fermenter volume and marks the charged one distilled', () => {
    expect(fermenterColumnTags({
      assignments: [{ id: 4, ...ferm2 }],
      logSources: [
        { floor_equipment_id: 11, equipment_name: 'Fermentation 1' },
        { floor_equipment_id: 12, equipment_name: 'Fermentation 2' },
      ],
    })).toEqual([
      { key: 'assign-4', label: 'Fermentation 2 (1100 gal)', distilled: false },
      { key: 'log-11', label: 'Fermentation 1 (distilled)', distilled: true },
    ]);
  });
});
