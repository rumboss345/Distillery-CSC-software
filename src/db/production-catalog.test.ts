import { describe, expect, it } from 'vitest';
import { PRODUCTION_MUTATIONS, userMayMutate } from './production-catalog';

describe('owner-only production mutations', () => {
  it('lets only an owner empty all tanks', () => {
    expect(PRODUCTION_MUTATIONS.emptyAllHoldingTanks.access).toBe('owner');
    expect(userMayMutate('owner', [], 'owner')).toBe(true);
    expect(userMayMutate('admin', [], 'owner')).toBe(false);
    expect(userMayMutate('user', ['inventory'], 'owner')).toBe(false);
  });
});

describe('admin equipment removal', () => {
  it('lets only an administrator or owner remove floor equipment', () => {
    expect(PRODUCTION_MUTATIONS.deleteFloorEquipment.access).toBe('admin');
    expect(userMayMutate('owner', [], 'admin')).toBe(true);
    expect(userMayMutate('admin', [], 'admin')).toBe(true);
    expect(userMayMutate('user', ['equipment'], 'admin')).toBe(false);
    expect(userMayMutate('user', ['equipment'], PRODUCTION_MUTATIONS.deleteFloorEquipment.access)).toBe(false);
  });
});
