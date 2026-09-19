import { describe, expect, it } from 'vitest';
import { escapeCsvCell, rowsToCsv } from './csv';

describe('csv', () => {
  it('escapes commas and quotes', () => {
    expect(escapeCsvCell('hello, world')).toBe('"hello, world"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('builds csv with header row', () => {
    const csv = rowsToCsv(['A', 'B'], [['1', 2]]);
    expect(csv).toBe('A,B\n1,2');
  });
});
