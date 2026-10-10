import { describe, expect, it } from 'vitest';
import { localCalendarDayKey } from './date-input';
import type {
  Barrel,
  BlendProduct,
  BottlingRunView,
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
  calendarEventPath,
  calendarProgress,
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
  fermentation_start_date: null,
  expected_completion_date: null,
  target_brix: null,
  actual_brix: null,
  target_final_brix: null,
  actual_final_brix: null,
  status: 'planned',
  assigned_user_id: null,
  assigned_user_name: null,
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
    expect(event?.endDate).toBe(localCalendarDayKey('2026-03-05T08:00:00Z'));
    expect(isMultiDayEvent(event!)).toBe(true);
  });

  it('keeps an in-progress fermentation on the calendar through today', () => {
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
    const event = buildWashCalendarEvent(baseMash({ status: 'fermenting' }), logs, '2026-03-10');
    expect(event?.endDate).toBe('2026-03-10');
    expect(eventOccursOnDate(event!, '2026-03-07')).toBe(true);
  });

  it('shows a fermentation from the day it starts through the expected completion date', () => {
    const event = buildWashCalendarEvent(baseMash({
      status: 'fermenting',
      fermentation_start_date: '2026-03-03',
      expected_completion_date: '2026-03-12',
    }), [], '2026-03-05');
    expect(event?.startDate).toBe('2026-03-03');
    expect(event?.endDate).toBe('2026-03-12');
    expect(eventOccursOnDate(event!, '2026-03-10')).toBe(true);
    expect(eventOccursOnDate(event!, '2026-03-02')).toBe(false);
    expect(event?.detail).toMatch(/Expected done/);
  });

  it('keeps an overdue fermentation on the calendar through today', () => {
    const event = buildWashCalendarEvent(baseMash({
      status: 'fermenting',
      fermentation_start_date: '2026-03-01',
      expected_completion_date: '2026-03-04',
    }), [], '2026-03-10');
    expect(event?.startDate).toBe('2026-03-01');
    expect(event?.endDate).toBe('2026-03-10');
    expect(eventOccursOnDate(event!, '2026-03-04')).toBe(true);
    expect(eventOccursOnDate(event!, '2026-03-10')).toBe(true);
  });

  it('does not extend an in-progress fermentation that starts today or later', () => {
    const today = buildWashCalendarEvent(baseMash({ status: 'fermenting' }), [], '2026-03-01');
    const future = buildWashCalendarEvent(
      baseMash({ status: 'fermenting', start_date: '2026-03-20' }),
      [],
      '2026-03-01',
    );
    expect(today?.endDate).toBeUndefined();
    expect(future?.endDate).toBeUndefined();
  });

  it('opens the wash or fermentation record for that batch', () => {
    const planned = buildWashCalendarEvent(baseMash(), [], '2026-03-01');
    const fermenting = buildWashCalendarEvent(baseMash({ status: 'fermenting' }), [], '2026-03-10');
    expect(calendarEventPath(planned!)).toBe('/wash?record=1');
    expect(calendarEventPath(fermenting!)).toBe('/fermentation?record=1');
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
        assigned_user_id: null,
        assigned_user_name: null,
        notes: '',
        created_at: '2026-04-10',
      } satisfies DistillationRun],
      bottlings: [{
        id: 1,
        batch_number: 'BT-1',
        source_barrel_id: null,
        source_holding_tank_equipment_id: null,
        source_volume_gal: null,
        bottled_volume_gal: null,
        volume_variance_gal: null,
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
        lines: [{
          id: 1,
          bottling_run_id: 1,
          packaging_bottle: '750mL',
          bottle_size_ml: 750,
          bottle_count: 100,
          sort_order: 0,
        }],
      } satisfies BottlingRunView],
      blends: [{
        id: 1,
        batch_number: 'BL-1',
        product_name: 'Blend',
        source_holding_tank_equipment_id: 1,
        base_spirit_volume_gal: 10,
        base_spirit_abv: 60,
        blend_date: '2026-05-15',
        target_abv: 40,
        target_brix: null,
        scale_factor: 1,
        formula_version: 1,
        formulation_phase: 'theoretical',
        final_volume_gal: 20,
        final_abv: 40,
        theoretical_volume_gal: 20,
        theoretical_abv: 40,
        theoretical_density: null,
        theoretical_brix: null,
        actual_volume_gal: null,
        actual_weight_lbs: null,
        actual_abv: null,
        actual_density: null,
        actual_brix: null,
        status: 'draft',
        executed_at: null,
        output_holding_tank_equipment_id: null,
        blend_recipe_id: null,
        blend_recipe_version_id: null,
        assigned_user_id: null,
        assigned_user_name: null,
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
        source_holding_tank_equipment_id: null,
        initial_abv: 60,
        current_volume_gal: 53,
        warehouse_location: 'A1',
        status: 'aging',
        notes: '',
        created_at: '2026-06-01',
      } satisfies Barrel],
    }), '2026-07-01');

    expect(events).toHaveLength(5);
    const barrel = events.find((event) => event.kind === 'barrel');
    expect(barrel?.endDate).toBe('2026-07-01');
    expect(calendarEventPath(barrel!)).toBe('/barrels?record=1');
    for (const event of events.filter((item) => item.kind !== 'barrel')) {
      expect(event.endDate).toBeUndefined();
      expect(event.allDay).toBe(true);
    }
    expect(calendarEventPath(events.find((event) => event.kind === 'distillation')!)).toBe('/distillation?record=1');
    expect(calendarEventPath(events.find((event) => event.kind === 'blend')!)).toBe('/blending?record=1');
    expect(calendarEventPath(events.find((event) => event.kind === 'bottling')!)).toBe('/bottling?record=1');
    expect(calendarEventPath(events.find((event) => event.kind === 'transfer')!)).toBe('/tank-transfer?record=1');
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
        assigned_user_id: null,
        assigned_user_name: null,
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

  it('groups planned work as upcoming, active work as in progress, and finished work as done', () => {
    expect(calendarProgress('planned')).toBe('upcoming');
    expect(calendarProgress('in_progress')).toBe('in_progress');
    expect(calendarProgress('hold')).toBe('in_progress');
    expect(calendarProgress('complete')).toBe('done');
    expect(calendarProgress('cancelled')).toBe('done');
    expect(calendarProgress('other')).toBe('done');
  });

  it('applies kind and progress filters together', () => {
    const filtered = filterCalendarEvents(
      sample,
      new Set(['wash', 'distillation']),
      new Set(['upcoming', 'in_progress']),
    );
    expect(filtered.map((e) => e.id)).toEqual(['1', '2']);
  });
});
