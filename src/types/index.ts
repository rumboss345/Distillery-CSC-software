export type InventoryCategory = string;

export type MashStatus =
  | 'planned'
  | 'mashing'
  | 'fermenting'
  | 'complete'
  | 'discarded';

export type RunStatus = 'planned' | 'running' | 'complete';

export type DistillationRunType = 'wash' | 'low_wines';

export type CutType = 'heads' | 'hearts' | 'tails';

export type SpiritTransferType = 'low_wines' | 'high_wines';

export type BarrelStatus = 'aging' | 'empty' | 'dumped';

export type EquipmentType =
  | 'fermenter'
  | 'pot_still'
  | 'column_still'
  | 'mash_tun'
  | 'holding_tank'
  | 'boiler'
  | 'other';

export type EquipmentStatus = 'empty' | 'in_use' | 'cleaning' | 'offline';

export interface FloorPlan {
  id: number;
  name: string;
  width_ft: number;
  height_ft: number;
  notes: string;
}

export interface FloorEquipment {
  id: number;
  floor_plan_id: number;
  name: string;
  equipment_type: EquipmentType;
  pos_x_ft: number;
  pos_y_ft: number;
  width_ft: number;
  depth_ft: number;
  capacity_gal: number;
  status: EquipmentStatus;
  linked_mash_batch_id: number | null;
  notes: string;
  created_at: string;
}

export interface MashFermenterAssignment {
  id: number;
  mash_batch_id: number;
  floor_equipment_id: number;
  volume_gal: number;
}

export interface FloorEquipmentView extends FloorEquipment {
  active_batch_number?: string;
  active_volume_gal?: number;
  active_abv?: number;
  active_run_count?: number;
}

export interface InventoryItem {
  id: number;
  name: string;
  category: InventoryCategory;
  unit: string;
  quantity: number;
  reorder_level: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MashBatch {
  id: number;
  batch_number: string;
  recipe_name: string;
  grain_type: string;
  grain_lbs: number;
  water_gal: number;
  yeast_strain: string;
  yeast_lbs: number;
  start_date: string;
  target_brix: number | null;
  actual_brix: number | null;
  target_final_brix: number | null;
  actual_final_brix: number | null;
  status: MashStatus;
  notes: string;
  created_at: string;
}

export interface FermentationLog {
  id: number;
  mash_batch_id: number;
  floor_equipment_id: number | null;
  logged_at: string;
  temperature_f: number | null;
  brix: number | null;
  ph: number | null;
  notes: string;
}

export interface FermentationLogView extends FermentationLog {
  equipment_name?: string;
}

export interface DistillationRun {
  id: number;
  batch_number: string;
  run_type: DistillationRunType;
  source_mash_batch_id: number | null;
  source_fermenter_equipment_id: number | null;
  source_holding_tank_equipment_id: number | null;
  dest_holding_tank_equipment_id: number | null;
  still_name: string;
  run_date: string;
  charge_volume_gal: number;
  charge_abv: number | null;
  status: RunStatus;
  notes: string;
  created_at: string;
}

export interface DistillationRunView extends DistillationRun {
  source_holding_tank_name?: string;
  dest_holding_tank_name?: string;
}

export interface DistillationCut {
  id: number;
  distillation_run_id: number;
  cut_type: CutType;
  holding_tank_equipment_id: number | null;
  start_time: string;
  end_time: string | null;
  volume_gal: number;
  abv: number;
  notes: string;
}

export interface DistillationCutView extends DistillationCut {
  holding_tank_name?: string;
}

export interface HoldingTankContents {
  volume_gal: number;
  abv: number;
  run_count: number;
  cut_count: number;
}

export interface HoldingTankTransfer {
  id: number;
  spirit_type: SpiritTransferType;
  source_tank_equipment_id: number;
  dest_tank_equipment_id: number;
  volume_gal: number;
  abv: number;
  transfer_date: string;
  notes: string;
  created_at: string;
}

export interface HoldingTankTransferView extends HoldingTankTransfer {
  source_tank_name?: string;
  dest_tank_name?: string;
}

export interface Barrel {
  id: number;
  barrel_number: string;
  wood_type: string;
  capacity_gal: number;
  fill_date: string;
  spirit_type: string;
  source_run_id: number | null;
  initial_abv: number;
  current_volume_gal: number;
  warehouse_location: string;
  status: BarrelStatus;
  notes: string;
  created_at: string;
}

export interface BottlingRun {
  id: number;
  batch_number: string;
  source_barrel_id: number | null;
  source_run_id: number | null;
  bottling_date: string;
  bottle_size_ml: number;
  bottle_count: number;
  final_abv: number;
  product_name: string;
  lot_number: string;
  notes: string;
  created_at: string;
}

export type BlendStatus = 'draft' | 'blended' | 'bottled';

export type BlendIngredientType = 'water' | 'sugar' | 'flavoring' | 'other';

export interface BlendProduct {
  id: number;
  batch_number: string;
  product_name: string;
  source_holding_tank_equipment_id: number;
  base_spirit_volume_gal: number;
  base_spirit_abv: number;
  blend_date: string;
  target_abv: number | null;
  final_volume_gal: number;
  final_abv: number;
  status: BlendStatus;
  notes: string;
  created_at: string;
}

export interface BlendIngredient {
  id: number;
  blend_product_id: number;
  ingredient_type: BlendIngredientType;
  name: string;
  amount: number;
  unit: string;
  notes: string;
}

export interface BlendProductView extends BlendProduct {
  source_tank_name?: string;
}

export interface BlendIngredientInput {
  ingredient_type: BlendIngredientType;
  name: string;
  amount: number;
  unit: string;
  notes: string;
}

export interface ProductionSummary {
  activeMashes: number;
  activeRuns: number;
  barrelsAging: number;
  totalHeartsGal: number;
  bottlesThisMonth: number;
  lowStockItems: number;
}

export interface YieldReport {
  mashBatchNumber: string;
  grainLbs: number;
  washVolumeGal: number;
  heartsVolumeGal: number;
  heartsAbv: number;
  gpa: number;
  yieldPercent: number;
}

export interface EquipmentVolumeReport {
  id: number;
  name: string;
  equipment_type: EquipmentType;
  status: EquipmentStatus;
  capacity_gal: number;
  volume_gal: number;
  abv: number | null;
  detail: string;
}

/** US fluid ounces per gallon */
export const ML_PER_GALLON = 3785.41;

export function mlToGallons(ml: number): number {
  return ml / ML_PER_GALLON;
}
