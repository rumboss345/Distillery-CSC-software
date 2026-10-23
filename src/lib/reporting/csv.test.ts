import { describe, expect, it } from 'vitest';
import { escapeCsvCell, parseCsv, rowsToCsv } from './csv';

describe('csv', () => {
  it('escapes commas and quotes', () => {
    expect(escapeCsvCell('hello, world')).toBe('"hello, world"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('builds csv with header row', () => {
    const csv = rowsToCsv(['A', 'B'], [['1', 2]]);
    expect(csv).toBe('A,B\n1,2');
  });

  it('reads quoted commas and quotes back', () => {
    const csv = rowsToCsv(['Name', 'Notes'], [['Comma, Name', 'say "hi"']]);
    expect(parseCsv(csv)).toEqual([['Name', 'Notes'], ['Comma, Name', 'say "hi"']]);
  });
});
