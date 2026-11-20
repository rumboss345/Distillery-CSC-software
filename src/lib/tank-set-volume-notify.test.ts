import { describe, expect, it } from 'vitest';
import {
  formatTankSetVolumeOwnerApprovalMessage,
  tankSetVolumeRequiresOwnerAck,
} from './tank-set-volume-notify';

describe('tank set volume owner notice', () => {
  it('requires owner acknowledgement for staff roles only', () => {
    expect(tankSetVolumeRequiresOwnerAck('owner')).toBe(false);
    expect(tankSetVolumeRequiresOwnerAck('admin')).toBe(true);
    expect(tankSetVolumeRequiresOwnerAck('manager')).toBe(true);
    expect(tankSetVolumeRequiresOwnerAck('user')).toBe(true);
  });

  it('formats a set-volume approval message', () => {
    const body = formatTankSetVolumeOwnerApprovalMessage({
      action: 'set',
      tankName: 'Hearts 1',
      changedBy: 'Maria',
      volumeGal: 120.5,
      abv: 65,
      bookVolumeGal: 118,
      bookAbv: 64,
      recordedAt: '2026-11-20',
      notes: 'Dip after transfer',
    }, 42);
    expect(body).toContain('Maria');
    expect(body).toContain('Hearts 1');
    expect(body).toContain('120.5 gal');
    expect(body).toContain('Nothing has changed');
    expect(body).toContain('Request #42');
  });
});