import { describe, expect, it } from 'vitest';
import { statusChangeToLog, statusDateLogText } from './status-date-log';

describe('statusChangeToLog', () => {
  it('records a real status change', () => {
    expect(statusChangeToLog('planned', 'mashing')).toEqual({ previous: 'planned', next: 'mashing' });
    expect(statusChangeToLog('fermenting', 'complete')).toEqual({ previous: 'fermenting', next: 'complete' });
    expect(statusChangeToLog('running', 'complete')).toEqual({ previous: 'running', next: 'complete' });
    expect(statusChangeToLog('aging', 'dumped')).toEqual({ previous: 'aging', next: 'dumped' });
  });

  it('records the first status when there was none', () => {
    expect(statusChangeToLog(undefined, 'planned')).toEqual({ previous: '', next: 'planned' });
    expect(statusChangeToLog(null, 'empty')).toEqual({ previous: '', next: 'empty' });
  });

  it('skips a save that leaves the status alone', () => {
    expect(statusChangeToLog('fermenting', 'fermenting')).toBeNull();
    expect(statusChangeToLog('planned', ' planned ')).toBeNull();
    expect(statusChangeToLog('mashing', '')).toBeNull();
  });
});

describe('statusDateLogText', () => {
  it('names the change with the date log wording', () => {
    expect(statusDateLogText('', 'planned')).toBe('Set to planned');
    expect(statusDateLogText('mashing', 'fermenting')).toBe('washing → fermenting');
    expect(statusDateLogText('in_use', 'cleaning')).toBe('in use → cleaning');
    expect(statusDateLogText('aging', 'empty')).toBe('aging → empty');
  });
});
