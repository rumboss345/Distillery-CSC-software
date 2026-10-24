import type { PermissionKey } from '../lib/permissions';

export type MutationAccess = PermissionKey | PermissionKey[] | 'admin' | 'owner';

export interface ProductionMutation {
  access: MutationAccess;
  /** Table and id argument for an update. Inserts leave the id empty and always run. */
  table?: string;
  idIndex?: number;
}

function optionalId(args: unknown[], index: number): number | null {
  const value = args[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function mutationTargetId(mutation: ProductionMutation, args: unknown[]): number | null {
  if (mutation.idIndex == null) return null;
  return optionalId(args, mutation.idIndex);
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
  saveFermentationSet: { access: 'wash', table: 'mash_batches', idIndex: 0 },
  recordFermenterLeftover: { access: 'wash' },
  deleteOneFermentation: { access: 'wash', table: 'mash_batches', idIndex: 0 },
  releaseFermentersForMash: { access: 'wash', table: 'mash_batches', idIndex: 0 },
  releaseFermenterForMash: { access: 'wash', table: 'mash_batches', idIndex: 0 },
  completeFermentationsSelectedForDistillation: { access: 'wash' },
  deleteMashBatch: { access: 'wash', table: 'mash_batches', idIndex: 0 },
  addFermentationLog: { access: 'wash' },
  saveFermenterWashTransfer: { access: 'wash' },
  deleteDiscardedFermentation: { access: 'wash', table: 'discarded_fermentations', idIndex: 0 },
  saveDistillationRun: { access: 'distillation', table: 'distillation_runs', idIndex: 1 },
  deleteDistillationRun: { access: 'distillation', table: 'distillation_runs', idIndex: 0 },
  saveDistillationCut: { access: 'distillation', table: 'distillation_cuts', idIndex: 1 },
  deleteDistillationCut: { access: 'distillation', table: 'distillation_cuts', idIndex: 0 },
  recordDistillationCollectionLoss: { access: 'distillation', table: 'distillation_runs', idIndex: 0 },
  saveGinRecipe: { access: 'distillation', table: 'gin_recipes', idIndex: 1 },
  deleteGinRecipe: { access: 'distillation', table: 'gin_recipes', idIndex: 0 },
  saveHoldingTankOnHand: { access: 'distillation' },
  clearHoldingTankOnHand: { access: 'distillation' },
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
  undoBlendProduction: { access: 'blending', table: 'blend_products', idIndex: 0 },
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
  saveFloorEquipment: { access: 'equipment', table: 'floor_equipment', idIndex: 1 },
  updateEquipmentPosition: { access: 'equipment', table: 'floor_equipment', idIndex: 0 },
  updateEquipmentProcessPosition: { access: 'equipment', table: 'floor_equipment', idIndex: 0 },
  moveEquipmentToPlan: { access: 'equipment', table: 'floor_equipment', idIndex: 0 },
  deleteFloorEquipment: { access: 'equipment', table: 'floor_equipment', idIndex: 0 },
  emptyAllHoldingTanks: { access: 'owner' },
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
