import { describe, expect, it } from 'vitest';
import { mutationAccess, PRODUCTION_MUTATIONS, userMayMutate } from './production-catalog';
import { adminApprovalFor, clearAdminApproval, setAdminApproval } from '../lib/admin-approval';

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

describe('admin-only tank volume and equipment edits', () => {
  it('keeps setting or clearing a tank on-hand reading to administrators', () => {
    expect(userMayMutate('user', ['distillation'], PRODUCTION_MUTATIONS.saveHoldingTankOnHand.access)).toBe(false);
    expect(userMayMutate('user', ['distillation'], PRODUCTION_MUTATIONS.clearHoldingTankOnHand.access)).toBe(false);
    expect(userMayMutate('admin', [], PRODUCTION_MUTATIONS.saveHoldingTankOnHand.access)).toBe(true);
  });

  it('lets equipment staff add equipment but only administrators edit it', () => {
    const save = PRODUCTION_MUTATIONS.saveFloorEquipment;
    expect(userMayMutate('user', ['equipment'], mutationAccess(save, [{}, undefined]))).toBe(true);
    expect(userMayMutate('user', ['equipment'], mutationAccess(save, [{}, 7]))).toBe(false);
    expect(userMayMutate('admin', [], mutationAccess(save, [{}, 7]))).toBe(true);
  });
});

describe('administrator approvals', () => {
  it('marks completed-work deletes and blend undo as needing approval', () => {
    for (const name of ['deleteDistillationRun', 'deleteOneFermentation', 'saveFermentationSet', 'undoBlendProduction', 'deleteMashBatch']) {
      expect(PRODUCTION_MUTATIONS[name].adminApproval).toBeTruthy();
    }
  });

  it('only sends an approval for the approved action until it expires', () => {
    setAdminApproval('token-1', ['undoBlendProduction'], 600, 1_000);
    expect(adminApprovalFor('undoBlendProduction', 2_000)).toBe('token-1');
    expect(adminApprovalFor('deleteDistillationRun', 2_000)).toBeNull();
    expect(adminApprovalFor('undoBlendProduction', 1_000 + 600_000)).toBeNull();
    expect(adminApprovalFor('undoBlendProduction', 2_000)).toBeNull();
    setAdminApproval('token-2', ['undoBlendProduction'], 600, 1_000);
    clearAdminApproval();
    expect(adminApprovalFor('undoBlendProduction', 2_000)).toBeNull();
  });
});
