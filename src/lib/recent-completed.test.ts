import { describe, expect, it } from 'vitest';
import { latestCompleted, RECENT_COMPLETED_LIMIT } from './recent-completed';

describe('latestCompleted', () => {
  const rows = [
    { id: 1, date: '2026-01-01' },
    { id: 2, date: '2026-06-01' },
    { id: 3, date: '2026-06-01' },
    { id: 4, date: '2026-03-01' },
  ];

  it('keeps the newest records and counts the rest', () => {
    const result = latestCompleted(rows, (row) => row.date, (row) => row.id, 2);
    expect(result.shown.map((row) => row.id)).toEqual([3, 2]);
    expect(result.total).toBe(4);
    expect(result.hiddenCount).toBe(2);
  });

  it('shows every record when there are ten or fewer', () => {
    const result = latestCompleted(rows, (row) => row.date, (row) => row.id);
    expect(result.shown).toHaveLength(4);
    expect(result.hiddenCount).toBe(0);
    expect(RECENT_COMPLETED_LIMIT).toBe(10);
  });
});
