export type InventoryCategory = string;

export type MashStatus =
  | 'planned'
  | 'mashing'
  | 'fermenting'
  | 'complete'
  | 'discarded';

export type RunStatus = 'planned' | 'running' | 'complete';

export type DistillationRunType = 'wash' | 'low_wines' | 'heavy_rum';

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
  process_pos_x: number | null;
  process_pos_y: number | null;
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
  active_mash_status?: MashStatus;
  /** Latest fermentation log Brix for this fermenter, or mash starting Brix if no logs yet. */
  active_latest_brix?: number | null;
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

export interface Recipe {
  id: number;
  name: string;
  spirit_type: string;
  grain_type: string;
  grain_lbs: number;
  water_gal: number;
  yeast_strain: string;
  yeast_lbs: number;
  target_brix: number | null;
  target_final_brix: number | null;
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
  assigned_user_id: number | null;
  assigned_user_name: string | null;
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
  assigned_user_id: number | null;
  assigned_user_name: string | null;
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

export type HoldingTankIntakeKind = 'cut' | 'transfer' | 'blend';

/** A single distillation cut, transfer, or blend that added spirit to a holding tank. */
export interface HoldingTankIntakeEntry {
  kind: HoldingTankIntakeKind;
  id: number;
  occurred_at: string;
  volume_gal: number;
  abv: number;
  summary: string;
  detail?: string;
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

export interface BarrelFill {
  id: number;
  barrel_id: number;
  source_holding_tank_equipment_id: number;
  volume_gal: number;
  abv: number;
  fill_date: string;
  notes: string;
  created_at: string;
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
  source_holding_tank_equipment_id: number | null;
  source_volume_gal: number | null;
  source_run_id: number | null;
  bottling_date: string;
  packaging_bottle: string;
  bottle_size_ml: number;
  bottle_count: number;
  final_abv: number;
  product_name: string;
  lot_number: string;
  notes: string;
  created_at: string;
}

export interface BottlingRunLine {
  id: number;
  bottling_run_id: number;
  packaging_bottle: string;
  bottle_size_ml: number;
  bottle_count: number;
  sort_order: number;
}

export interface BottlingRunLineInput {
  packaging_bottle: string;
  bottle_size_ml: number;
  bottle_count: number;
}

export interface BottlingRunView extends BottlingRun {
  lines: BottlingRunLine[];
}

export type BlendStatus = 'draft' | 'trial' | 'approved' | 'executed' | 'bottled';

/** @deprecated Use executed — kept for legacy records */
export type LegacyBlendStatus = 'blended';

export type BlendFormulationPhase = 'theoretical' | 'trial' | 'production';

export type BlendIngredientType = 'water' | 'sugar' | 'syrup' | 'flavoring' | 'color' | 'other';

export interface BlendProduct {
  id: number;
  batch_number: string;
  product_name: string;
  source_holding_tank_equipment_id: number;
  base_spirit_volume_gal: number;
  base_spirit_abv: number;
  blend_date: string;
  target_abv: number | null;
  target_brix: number | null;
  scale_factor: number;
  formula_version: number;
  formulation_phase: BlendFormulationPhase;
  final_volume_gal: number;
  final_abv: number;
  theoretical_volume_gal: number | null;
  theoretical_abv: number | null;
  theoretical_density: number | null;
  theoretical_brix: number | null;
  actual_volume_gal: number | null;
  actual_weight_lbs: number | null;
  actual_abv: number | null;
  actual_density: number | null;
  actual_brix: number | null;
  status: BlendStatus | LegacyBlendStatus;
  executed_at: string | null;
  output_holding_tank_equipment_id: number | null;
  blend_recipe_id: number | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  notes: string;
  created_at: string;
}

export interface BlendSpiritSource {
  id: number;
  blend_product_id: number;
  holding_tank_equipment_id: number;
  barrel_id?: number | null;
  volume_gal: number;
  abv: number;
  sort_order: number;
  tank_name?: string;
  barrel_number?: string;
}

export interface BlendIngredient {
  id: number;
  blend_product_id: number;
  ingredient_type: BlendIngredientType;
  name: string;
  amount: number;
  unit: string;
  cost_per_unit: number | null;
  lot_number: string;
  inventory_item_id: number | null;
  notes: string;
}

export interface BlendProductView extends BlendProduct {
  source_tank_name?: string;
  output_tank_name?: string;
  blend_recipe_name?: string;
}

export interface BlendIngredientInput {
  ingredient_type: BlendIngredientType;
  name: string;
  amount: number;
  unit: string;
  /** ABV % when this additive contributes alcohol (e.g. vanilla extract). */
  abv?: number | null;
  cost_per_unit?: number | null;
  lot_number?: string;
  inventory_item_id?: number | null;
  notes: string;
}

export interface BlendSpiritSourceInput {
  holding_tank_equipment_id: number;
  barrel_id?: number | null;
  volume_gal: number;
  abv: number;
}

export interface BlendRecipe {
  id: number;
  name: string;
  product_name: string;
  target_abv: number | null;
  target_brix: number | null;
  scale_factor: number;
  source_type: BlendRecipeSourceType;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type BlendRecipeSourceType = 'tank' | 'barrel';

export interface BlendRecipeSpiritSourceInput {
  spirit_label: string;
  volume_gal: number;
  abv: number;
  barrel_id?: number | null;
}

export interface BlendRecipeSpiritSource {
  id: number;
  blend_recipe_id: number;
  spirit_label: string;
  volume_gal: number;
  abv: number;
  barrel_id?: number | null;
  sort_order: number;
}

export interface BlendRecipeIngredient {
  id: number;
  blend_recipe_id: number;
  ingredient_type: BlendIngredientType;
  name: string;
  amount: number;
  unit: string;
  cost_per_unit: number | null;
  lot_number: string;
  inventory_item_id: number | null;
  notes: string;
}

export interface BlendRecipeView extends BlendRecipe {
  spirit_sources: BlendRecipeSpiritSource[];
  ingredients: BlendRecipeIngredient[];
}

export interface BlendFormulaVersion {
  id: number;
  blend_product_id: number;
  version_number: number;
  snapshot_json: string;
  notes: string;
  created_at: string;
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
