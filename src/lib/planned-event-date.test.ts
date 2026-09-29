import { describe, expect, it } from 'vitest';
import { eventDateWhenLeavingPlanned, localIsoDate } from './planned-event-date';

describe('eventDateWhenLeavingPlanned', () => {
  const today = '2026-09-29';

  it('keeps the scheduled date while the record stays planned', () => {
    expect(eventDateWhenLeavingPlanned('planned', 'planned', '2026-10-15', today)).toBe('2026-10-15');
  });

  it('sets the date to the day a planned wash or run leaves planned', () => {
    expect(eventDateWhenLeavingPlanned('planned', 'mashing', '2026-10-15', today)).toBe(today);
    expect(eventDateWhenLeavingPlanned('planned', 'fermenting', '2026-10-15', today)).toBe(today);
    expect(eventDateWhenLeavingPlanned('planned', 'running', '2026-10-15', today)).toBe(today);
    expect(eventDateWhenLeavingPlanned('planned', 'complete', '2026-10-15', today)).toBe(today);
    expect(eventDateWhenLeavingPlanned('planned', 'discarded', '2026-10-15', today)).toBe(today);
  });

  it('does not rewrite the date for later status changes', () => {
    expect(eventDateWhenLeavingPlanned('mashing', 'fermenting', '2026-09-20', today)).toBe('2026-09-20');
    expect(eventDateWhenLeavingPlanned('running', 'complete', '2026-09-20', today)).toBe('2026-09-20');
    expect(eventDateWhenLeavingPlanned(undefined, 'running', '2026-10-15', today)).toBe('2026-10-15');
  });

  it('formats the local calendar day', () => {
    expect(localIsoDate(new Date(2026, 8, 29, 23, 30))).toBe('2026-09-29');
  });
});
