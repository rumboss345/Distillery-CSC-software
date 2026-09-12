import { describe, expect, it } from 'vitest';
import type {
  Barrel,
  BlendProduct,
  BottlingRun,
  DistillationRun,
  FermentationLog,
  HoldingTankTransferView,
  MashBatch,
} from '../types';
import {
  buildCalendarEventsFromData,
  buildWashCalendarEvent,
  deriveFermentationEndDate,
  enumerateEventDates,
  eventOccursOnDate,
  filterCalendarEvents,
  filterEventsByKind,
  filterEventsByStatusCategory,
  groupEventsByDate,
  isMultiDayEvent,
  matchesStatusCategoryFilter,
  sortCalendarEvents,
  type CalendarProductionData,
} from './calendar-events';

const baseMash = (overrides: Partial<MashBatch> = {}): MashBatch => ({
  id: 1,
  batch_number: 'W-001',
  recipe_name: 'Test Wash',
  grain_type: 'Cane',
  grain_lbs: 100,
  water_gal: 50,
  yeast_strain: 'Y1',
  yeast_lbs: 1,
  start_date: '2026-03-01',
  target_brix: null,
  actual_brix: null,
  target_final_brix: null,
  actual_final_brix: null,
  status: 'planned',
  notes: '',
  created_at: '2026-03-01T10:00:00Z',
  ...overrides,
});

const emptyData = (overrides: Partial<CalendarProductionData> = {}): CalendarProductionData => ({
  mashes: [],
  fermentationLogs: [],
  runs: [],
  barrels: [],
  bottlings: [],
  blends: [],
  transfers: [],
  ...overrides,
});

describe('buildWashCalendarEvent', () => {
  it('creates a single-day event when no fermentation end is available', () => {
    const event = buildWashCalendarEvent(baseMash(), []);
    expect(event).toMatchObject({
      startDate: '2026-03-01',
      endDate: undefined,
      allDay: true,
      kind: 'wash',
      statusCategory: 'planned',
    });
    expect(isMultiDayEvent(event!)).toBe(false);
  });

  it('spans completed fermentation when log dates exist', () => {
    const logs: FermentationLog[] = [
      {
        id: 1,
        mash_batch_id: 1,
        floor_equipment_id: 1,
        logged_at: '2026-03-02T12:00:00Z',
        temperature_f: 72,
        brix: 10,
        ph: 4,
        notes: '',
      },
      {
        id: 2,
        mash_batch_id: 1,
        floor_equipment_id: 1,
        logged_at: '2026-03-05T08:00:00Z',
        temperature_f: 70,
        brix: 2,
        ph: 4,
        notes: '',
      },
    ];
    const event = buildWashCalendarEvent(baseMash({ status: 'complete' }), logs);
    expect(event?.startDate).toBe('2026-03-01');
    expect(event?.endDate).toBe('2026-03-05');
    expect(isMultiDayEvent(event!)).toBe(true);
  });

  it('does not invent an end date for in-progress batches with logs', () => {
    const logs: FermentationLog[] = [
      {
        id: 1,
        mash_batch_id: 1,
        floor_equipment_id: null,
        logged_at: '2026-03-03T12:00:00Z',
        temperature_f: null,
        brix: 8,
        ph: null,
        notes: '',
      },
    ];
    const event = buildWashCalendarEvent(baseMash({ status: 'fermenting' }), logs);
    expect(event?.endDate).toBeUndefined();
  });
});

describe('deriveFermentationEndDate', () => {
  it('returns undefined when batch is not finished', () => {
    expect(deriveFermentationEndDate(baseMash({ status: 'fermenting' }), [])).toBeUndefined();
  });

  it('returns undefined when finished but no logs exist', () => {
    expect(deriveFermentationEndDate(baseMash({ status: 'complete' }), [])).toBeUndefined();
  });
});

describe('buildCalendarEventsFromData', () => {
  it('builds single-day distillation, bottling, blend, and transfer events', () => {
    const events = buildCalendarEventsFromData(emptyData({
      runs: [{
        id: 1,
        batch_number: 'D-1',
        run_type: 'wash',
        source_mash_batch_id: 1,
        source_fermenter_equipment_id: 1,
        source_holding_tank_equipment_id: null,
        dest_holding_tank_equipment_id: null,
        still_name: 'Still 1',
        run_date: '2026-04-10',
        charge_volume_gal: 100,
        charge_abv: 10,
        status: 'planned',
        notes: '',
        created_at: '2026-04-10',
      } satisfies DistillationRun],
      bottlings: [{
        id: 1,
        batch_number: 'BT-1',
        source_barrel_id: null,
        source_run_id: null,
        bottling_date: '2026-05-01',
        packaging_bottle: '750mL',
        bottle_size_ml: 750,
        bottle_count: 100,
        final_abv: 40,
        product_name: 'Gin',
        lot_number: 'L1',
        notes: '',
        created_at: '2026-05-01',
      } satisfies BottlingRun],
      blends: [{
        id: 1,
        batch_number: 'BL-1',
        product_name: 'Blend',
        source_holding_tank_equipment_id: 1,
        base_spirit_volume_gal: 10,
        base_spirit_abv: 60,
        blend_date: '2026-05-15',
        target_abv: 40,
        final_volume_gal: 20,
        final_abv: 40,
        status: 'draft',
        notes: '',
        created_at: '2026-05-15',
      } satisfies BlendProduct],
      transfers: [{
        id: 1,
        spirit_type: 'low_wines',
        source_tank_equipment_id: 1,
        dest_tank_equipment_id: 2,
        volume_gal: 50,
        abv: 30,
        transfer_date: '2026-04-20',
        notes: '',
        created_at: '2026-04-20',
        source_tank_name: 'T1',
        dest_tank_name: 'T2',
      } satisfies HoldingTankTransferView],
      barrels: [{
        id: 1,
        barrel_number: 'B-001',
        wood_type: 'Oak',
        capacity_gal: 53,
        fill_date: '2026-06-01',
        spirit_type: 'Rum',
        source_run_id: 1,
        initial_abv: 60,
        current_volume_gal: 53,
        warehouse_location: 'A1',
        status: 'aging',
        notes: '',
        created_at: '2026-06-01',
      } satisfies Barrel],
    }));

    expect(events).toHaveLength(5);
    for (const event of events) {
      expect(event.endDate).toBeUndefined();
      expect(event.allDay).toBe(true);
    }
  });

  it('skips records with missing dates', () => {
    const events = buildCalendarEventsFromData(emptyData({
      mashes: [baseMash({ start_date: '' })],
      runs: [{
        id: 1,
        batch_number: 'D-1',
        run_type: 'wash',
        source_mash_batch_id: null,
        source_fermenter_equipment_id: null,
        source_holding_tank_equipment_id: null,
        dest_holding_tank_equipment_id: null,
        still_name: 'Still 1',
        run_date: '',
        charge_volume_gal: 0,
        charge_abv: null,
        status: 'planned',
        notes: '',
        created_at: '',
      } satisfies DistillationRun],
    }));
    expect(events).toHaveLength(0);
  });
});

describe('sortCalendarEvents', () => {
  it('sorts by start date then title', () => {
    const sorted = sortCalendarEvents([
      {
        id: 'b',
        startDate: '2026-02-01',
        kind: 'wash',
        title: 'B',
        status: 'planned',
        statusCategory: 'planned',
      },
      {
        id: 'a',
        startDate: '2026-01-01',
        kind: 'wash',
        title: 'A',
        status: 'planned',
        statusCategory: 'planned',
      },
      {
        id: 'c',
        startDate: '2026-02-01',
        kind: 'wash',
        title: 'A',
        status: 'planned',
        statusCategory: 'planned',
      },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('groupEventsByDate', () => {
  it('places multi-day events on each day in the span', () => {
    const events = [{
      id: 'wash-1',
      startDate: '2026-03-01',
      endDate: '2026-03-03',
      allDay: true,
      kind: 'wash' as const,
      title: 'W-1',
      status: 'complete',
      statusCategory: 'complete' as const,
    }];
    const grouped = groupEventsByDate(events);
    expect(grouped.get('2026-03-01')).toHaveLength(1);
    expect(grouped.get('2026-03-02')).toHaveLength(1);
    expect(grouped.get('2026-03-03')).toHaveLength(1);
    expect(grouped.get('2026-03-04')).toBeUndefined();
  });
});

describe('eventOccursOnDate', () => {
  it('matches every day in a multi-day span', () => {
    const event = {
      id: 'wash-1',
      startDate: '2026-03-01',
      endDate: '2026-03-03',
      kind: 'wash' as const,
      title: 'W-1',
      status: 'complete',
      statusCategory: 'complete' as const,
    };
    expect(eventOccursOnDate(event, '2026-03-02')).toBe(true);
    expect(eventOccursOnDate(event, '2026-03-04')).toBe(false);
  });
});

describe('enumerateEventDates', () => {
  it('returns one date for single-day events', () => {
    expect(enumerateEventDates({
      id: '1',
      startDate: '2026-01-15',
      kind: 'bottling',
      title: 'B',
      status: 'complete',
      statusCategory: 'complete',
    })).toEqual(['2026-01-15']);
  });
});

describe('filters', () => {
  const sample = [
    {
      id: '1',
      startDate: '2026-01-01',
      kind: 'wash' as const,
      title: 'W',
      status: 'planned',
      statusCategory: 'planned' as const,
    },
    {
      id: '2',
      startDate: '2026-01-02',
      kind: 'distillation' as const,
      title: 'D',
      status: 'running',
      statusCategory: 'in_progress' as const,
    },
    {
      id: '3',
      startDate: '2026-01-03',
      kind: 'barrel' as const,
      title: 'B',
      status: 'dumped',
      statusCategory: 'cancelled' as const,
    },
  ];

  it('filters by kind', () => {
    const filtered = filterEventsByKind(sample, new Set(['wash']));
    expect(filtered.map((e) => e.id)).toEqual(['1']);
  });

  it('filters by status category', () => {
    const filtered = filterEventsByStatusCategory(sample, new Set(['in_progress']));
    expect(filtered.map((e) => e.id)).toEqual(['2']);
  });

  it('treats planned events as scheduled when scheduled filter is enabled', () => {
    expect(matchesStatusCategoryFilter(sample[0], new Set(['scheduled']))).toBe(true);
  });

  it('applies kind and status filters together', () => {
    const filtered = filterCalendarEvents(
      sample,
      new Set(['wash', 'distillation']),
      new Set(['planned', 'in_progress']),
    );
    expect(filtered.map((e) => e.id)).toEqual(['1', '2']);
  });
});
