import { describe, expect, it } from 'vitest';
import { fermenterBrixReadings, fermenterColumnTags, fermenterLogPanels } from './fermentation-log-panels';

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

describe('fermenterBrixReadings', () => {
  const currentBrixForEquipment = (equipmentId: number) => (
    equipmentId === 11 ? 4.2 : equipmentId === 12 ? 7.5 : null
  );

  it('uses each fermenter’s latest Brix instead of one batch reading', () => {
    expect(fermenterBrixReadings({
      assignments: [
        { id: 1, ...ferm1 },
        { id: 2, ...ferm2 },
      ],
      logSources: [],
      startBrix: 18.5,
      batchCurrentBrix: 4.2,
      currentBrixForEquipment,
    })).toEqual([
      {
        key: 'assign-1',
        name: 'Fermentation 1',
        label: 'Fermentation 1 (1100 gal)',
        distilled: false,
        equipmentId: 11,
        startBrix: 18.5,
        currentBrix: 4.2,
      },
      {
        key: 'assign-2',
        name: 'Fermentation 2',
        label: 'Fermentation 2 (1100 gal)',
        distilled: false,
        equipmentId: 12,
        startBrix: 18.5,
        currentBrix: 7.5,
      },
    ]);
  });

  it('keeps a distilled fermenter’s last reading after it is released', () => {
    expect(fermenterBrixReadings({
      assignments: [{ id: 2, ...ferm2 }],
      logSources: [
        { floor_equipment_id: 11, equipment_name: 'Fermentation 1' },
        { floor_equipment_id: 12, equipment_name: 'Fermentation 2' },
      ],
      startBrix: 18,
      batchCurrentBrix: 7.5,
      currentBrixForEquipment,
    })).toEqual([
      {
        key: 'assign-2',
        name: 'Fermentation 2',
        label: 'Fermentation 2 (1100 gal)',
        distilled: false,
        equipmentId: 12,
        startBrix: 18,
        currentBrix: 7.5,
      },
      {
        key: 'log-11',
        name: 'Fermentation 1',
        label: 'Fermentation 1 (distilled)',
        distilled: true,
        equipmentId: 11,
        startBrix: 18,
        currentBrix: 4.2,
      },
    ]);
  });

  it('falls back to one batch reading when no fermenter is assigned', () => {
    expect(fermenterBrixReadings({
      assignments: [],
      logSources: [],
      startBrix: 20,
      batchCurrentBrix: 9,
      currentBrixForEquipment,
    })).toEqual([
      {
        key: 'batch',
        name: '',
        label: '',
        distilled: false,
        equipmentId: null,
        startBrix: 20,
        currentBrix: 9,
      },
    ]);
  });
});
