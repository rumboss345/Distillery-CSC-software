import type { PermissionKey } from '../lib/permissions';
import { queryAll, queryOne } from './sql-session';

export type MutationAccess = PermissionKey | PermissionKey[] | 'admin' | 'owner';

/**
 * Staff (non-admin) may run these only with a short-lived administrator approval
 * issued by POST /api/auth/verify-admin. Checked on the server against locked rows.
 */
export type AdminApprovalRule = 'always' | ((args: unknown[]) => boolean);

export interface ProductionMutation {
  access: MutationAccess;
  /** Table and id argument for an update. Inserts leave the id empty and always run. */
  table?: string;
  idIndex?: number;
  /** Updating an existing row (id present) is admin-only; creating one uses `access`. */
  adminToUpdate?: boolean;
  adminApproval?: AdminApprovalRule;
}

function optionalId(args: unknown[], index: number): number | null {
  const value = args[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function mutationTargetId(mutation: ProductionMutation, args: unknown[]): number | null {
  if (mutation.idIndex == null) return null;
  return optionalId(args, mutation.idIndex);
}

const COMPLETE = 'complete';

function distillationRunIsComplete(args: unknown[]): boolean {
  const id = optionalId(args, 0);
  if (id == null) return false;
  const run = queryOne<{ status: string }>('SELECT status FROM distillation_runs WHERE id = ?', [id]);
  return run?.status === COMPLETE;
}

/** Mirrors the Fermentation page: a fermenter row with no assignment left is a distilled (complete) one. */
function fermentationIsComplete(args: unknown[]): boolean {
  const batchId = optionalId(args, 0);
  if (batchId == null) return false;
  const equipmentId = optionalId(args, 1);
  if (equipmentId == null) {
    const batch = queryOne<{ status: string }>('SELECT status FROM mash_batches WHERE id = ?', [batchId]);
    return batch?.status === COMPLETE;
  }
  const assignment = queryOne<{ status: string }>(
    'SELECT status FROM mash_fermenter_assignments WHERE mash_batch_id = ? AND floor_equipment_id = ?',
    [batchId, equipmentId],
  );
  if (!assignment) {
    const logs = queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM fermentation_logs WHERE mash_batch_id = ? AND floor_equipment_id = ?',
      [batchId, equipmentId],
    );
    return (logs?.count ?? 0) > 0;
  }
  return assignment.status === COMPLETE;
}

/** True when the new fermenter set changes or drops a fermentation that is already complete. */
function fermentationSetChangesComplete(args: unknown[]): boolean {
  const batchId = optionalId(args, 0);
  if (batchId == null) return false;
  const next = Array.isArray(args[1]) ? args[1] as { equipmentId?: unknown; volumeGal?: unknown; status?: unknown }[] : [];
  const existing = queryAll<{ floor_equipment_id: number; volume_gal: number; status: string }>(
    'SELECT floor_equipment_id, volume_gal, status FROM mash_fermenter_assignments WHERE mash_batch_id = ?',
    [batchId],
  );
  if (existing.length === 0) {
    const batch = queryOne<{ status: string }>('SELECT status FROM mash_batches WHERE id = ?', [batchId]);
    return batch?.status === COMPLETE;
  }
  return existing
    .filter((row) => row.status === COMPLETE)
    .some((row) => !next.some((item) => (
      Number(item.equipmentId) === row.floor_equipment_id
      && item.status === COMPLETE
      && Math.abs(Number(item.volumeGal) - row.volume_gal) < 0.001
    )));
}

/**
 * Every browser save that changes production data.
 * Reads stay on the snapshot. These names run on the server against the latest rows.
 */
export const PRODUCTION_MUTATIONS: Record<string, ProductionMutation> = {
  ensureInventoryItem: { access: 'inventory' },
  saveInventoryItem: { access: 'inventory', table: 'inventory_items', idIndex: 1 },
  adjustInventory: { access: 'inventory', table: 'inventory_items', idIndex: 0 },
  deleteInventoryItem: { access: 'inventory', table: 'inventory_items', idIndex: 0 },
  addInventoryCategory: { access: 'inventory' },
  deleteInventoryCategory: { access: 'inventory' },
  saveRecipe: { access: ['wash', 'blending'], table: 'recipes', idIndex: 1 },
  deleteRecipe: { access: ['wash', 'blending'], table: 'recipes', idIndex: 0 },
  saveMashBatch: { access: 'wash', table: 'mash_batches', idIndex: 1 },
  saveMashFermenterAssignments: { access: 'wash', table: 'mash_batches', idIndex: 0 },
  saveMashBatchWithFermenters: { access: 'wash', table: 'mash_batches', idIndex: 3 },
  completeFermenterAssignment: { access: 'wash' },
  saveFermentationSet: { access: 'wash', table: 'mash_batches', idIndex: 0, adminApproval: fermentationSetChangesComplete },
  recordFermenterLeftover: { access: 'wash' },
  deleteOneFermentation: { access: 'wash', table: 'mash_batches', idIndex: 0, adminApproval: fermentationIsComplete },
  releaseFermentersForMash: { access: 'wash', table: 'mash_batches', idIndex: 0 },
  releaseFermenterForMash: { access: 'wash', table: 'mash_batches', idIndex: 0 },
  completeFermentationsSelectedForDistillation: { access: 'wash' },
  deleteMashBatch: { access: 'wash', table: 'mash_batches', idIndex: 0 },
  addFermentationLog: { access: 'wash' },
  saveFermenterWashTransfer: { access: 'wash' },
  deleteDiscardedFermentation: { access: 'wash', table: 'discarded_fermentations', idIndex: 0 },
  saveDistillationRun: { access: 'distillation', table: 'distillation_runs', idIndex: 1 },
  deleteDistillationRun: {
    access: 'distillation',
    table: 'distillation_runs',
    idIndex: 0,
    adminApproval: distillationRunIsComplete,
  },
  saveDistillationCut: { access: 'distillation', table: 'distillation_cuts', idIndex: 1 },
  deleteDistillationCut: { access: 'distillation', table: 'distillation_cuts', idIndex: 0 },
  recordDistillationCollectionLoss: { access: 'distillation', table: 'distillation_runs', idIndex: 0 },
  saveGinRecipe: { access: 'distillation', table: 'gin_recipes', idIndex: 1 },
  deleteGinRecipe: { access: 'distillation', table: 'gin_recipes', idIndex: 0 },
  saveHoldingTankOnHand: { access: 'admin' },
  clearHoldingTankOnHand: { access: 'admin' },
  saveHoldingTankTransfer: { access: 'distillation' },
  deleteHoldingTankTransfer: { access: 'distillation', table: 'holding_tank_transfers', idIndex: 0 },
  saveHoldingTankDilution: { access: 'distillation' },
  deleteHoldingTankDilution: { access: 'distillation', table: 'holding_tank_dilutions', idIndex: 0 },
  saveBlendRecipe: { access: 'blending', table: 'blend_recipes', idIndex: 3 },
  deleteBlendRecipe: { access: 'blending', table: 'blend_recipes', idIndex: 0 },
  saveBlendRecipeFromWizard: { access: 'blending', table: 'blend_recipes', idIndex: 4 },
  saveBlendFormula: { access: 'blending', table: 'blend_products', idIndex: 3 },
  saveBlendProduct: { access: 'blending', table: 'blend_products', idIndex: 2 },
  executeBlendProduct: { access: 'blending', table: 'blend_products', idIndex: 0 },
  undoBlendProduction: { access: 'blending', table: 'blend_products', idIndex: 0, adminApproval: 'always' },
  saveBlendVerification: { access: 'blending', table: 'blend_products', idIndex: 0 },
  deleteBlendProduct: { access: 'blending', table: 'blend_products', idIndex: 0 },
  saveBarrel: { access: 'barrels', table: 'barrels', idIndex: 1 },
  createBarrelFromHoldingTank: { access: 'barrels' },
  deleteBarrel: { access: 'barrels', table: 'barrels', idIndex: 0 },
  fillBarrelFromHoldingTank: { access: 'barrels' },
  saveWarehouseLocation: { access: 'barrels' },
  deleteWarehouseLocation: { access: 'barrels', table: 'warehouse_locations', idIndex: 0 },
  saveBottlingRun: { access: 'bottling', table: 'bottling_runs', idIndex: 2 },
  deleteBottlingRun: { access: 'bottling', table: 'bottling_runs', idIndex: 0 },
  markEquipmentCleaned: { access: 'equipment', table: 'floor_equipment', idIndex: 0 },
  addFloorPlan: { access: 'equipment' },
  saveFloorPlan: { access: 'equipment', table: 'floor_plans', idIndex: 1 },
  updateEquipmentMaintenance: { access: 'equipment', table: 'floor_equipment', idIndex: 0 },
  addEquipmentType: { access: 'equipment' },
  deleteEquipmentType: { access: 'equipment' },
  saveFloorEquipment: { access: 'equipment', table: 'floor_equipment', idIndex: 1, adminToUpdate: true },
  updateEquipmentPosition: { access: 'equipment', table: 'floor_equipment', idIndex: 0 },
  updateEquipmentProcessPosition: { access: 'equipment', table: 'floor_equipment', idIndex: 0 },
  moveEquipmentToPlan: { access: 'equipment', table: 'floor_equipment', idIndex: 0 },
  deleteFloorEquipment: { access: 'admin', table: 'floor_equipment', idIndex: 0 },
  saveFermentationReadyMaxBrix: { access: 'admin' },
  emptyAllHoldingTanks: { access: 'owner' },
  saveProductionCostSettings: { access: 'owner' },
  saveProductionCostMonthlyOverhead: { access: 'owner' },
};

export function userMayMutate(
  role: string,
  permissions: readonly string[],
  access: MutationAccess,
): boolean {
  if (access === 'owner') return role === 'owner';
  if (role === 'admin' || role === 'owner') return true;
  if (access === 'admin') return false;
  const required = Array.isArray(access) ? access : [access];
  return required.some((key) => permissions.includes(key));
}

/** Access for this call: editing an existing row of an `adminToUpdate` action is admin-only. */
export function mutationAccess(mutation: ProductionMutation, args: unknown[]): MutationAccess {
  if (mutation.adminToUpdate && mutationTargetId(mutation, args) != null) return 'admin';
  return mutation.access;
}

/** Reads the current rows, so call it where the database holds the latest committed state. */
export function mutationNeedsAdminApproval(name: string, args: unknown[]): boolean {
  const rule = PRODUCTION_MUTATIONS[name]?.adminApproval;
  if (!rule) return false;
  return rule === 'always' ? true : rule(args);
}

export const ADMIN_APPROVAL_REQUIRED_ERROR =
  'An administrator must approve this change. Enter an administrator email and password, then try again.';
