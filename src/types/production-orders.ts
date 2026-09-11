export interface ProdOrder {
  id: number;
  order_code: string;
  product_id: number;
  recipe_id: number;
  recipe_version_id: number;
  sku_id: number | null;
  production_type: string;
  planned_batch_size: number;
  batch_size_unit: string;
  planned_output_litres: number | null;
  planned_abv: number | null;
  planned_quantity_units: number | null;
  scheduled_date: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  location_id: number | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  released_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  snapshot_target_abv: number | null;
  snapshot_expected_yield_percent: number | null;
  snapshot_target_brix: number | null;
  snapshot_target_ph: number | null;
  snapshot_target_carbonation_volumes: number | null;
  product_name?: string;
  recipe_name?: string;
  recipe_code?: string;
  version_number?: number;
  version_label?: string;
}

export interface ProdOrderRequirement {
  id: number;
  production_order_id: number;
  requirement_type: string;
  raw_material_id: number | null;
  bulk_spirit_id: number | null;
  liquid_lot_id: number | null;
  packaging_material_id: number | null;
  sku_id: number | null;
  description: string;
  planned_quantity: number;
  unit: string;
  planned_volume_litres: number | null;
  planned_abv: number | null;
  planned_lpa: number | null;
  sequence: number;
  notes: string;
  recipe_ingredient_id: number | null;
  recipe_packaging_id: number | null;
}

export interface ProdBatch {
  id: number;
  batch_code: string;
  production_order_id: number;
  batch_sequence: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  operator_id: string | null;
  source_tank_id: number | null;
  destination_tank_id: number | null;
  output_lot_id: number | null;
  actual_output_litres: number | null;
  actual_output_abv: number | null;
  actual_output_lpa: number | null;
  actual_brix: number | null;
  actual_ph: number | null;
  actual_carbonation_volumes: number | null;
  transaction_group_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ProdBatchInput {
  id: number;
  batch_id: number;
  requirement_id: number | null;
  input_type: string;
  raw_material_id: number | null;
  bulk_spirit_id: number | null;
  liquid_lot_id: number | null;
  source_tank_id: number | null;
  packaging_material_id: number | null;
  material_lot_id: number | null;
  source_location_id: number | null;
  actual_quantity: number;
  unit: string;
  actual_volume_litres: number | null;
  actual_abv: number | null;
  actual_lpa: number | null;
  base_quantity: number | null;
  base_unit: string | null;
  transaction_group_id: string | null;
  material_transaction_id: number | null;
  notes: string;
  created_at: string;
}

export interface ProdBatchLoss {
  id: number;
  batch_id: number;
  loss_type: string;
  liquid_lot_id: number | null;
  tank_id: number | null;
  volume_litres: number | null;
  abv: number | null;
  lpa: number | null;
  quantity: number | null;
  unit: string | null;
  reason: string;
  transaction_id: number | null;
  created_at: string;
}

export interface ProdBatchStep {
  id: number;
  batch_id: number;
  recipe_step_id: number | null;
  step_number: number;
  instruction_snapshot: string;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  notes: string;
}

export interface ProdEvent {
  id: number;
  production_order_id: number | null;
  batch_id: number | null;
  event_type: string;
  message: string;
  user_id: string | null;
  created_at: string;
}

export interface CreateProductionOrderInput {
  productId: number;
  recipeId: number;
  recipeVersionId: number;
  skuId?: number | null;
  productionType?: string | null;
  plannedBatchSize: number;
  batchSizeUnit?: string;
  plannedOutputLitres?: number | null;
  plannedAbv?: number | null;
  scheduledDate?: string | null;
  dueDate?: string | null;
  priority?: string;
  assignedTo?: string | null;
  locationId?: number | null;
  notes?: string;
  createdBy?: string | null;
}

export interface UpdateDraftOrderInput {
  orderId: number;
  plannedBatchSize?: number;
  scheduledDate?: string | null;
  dueDate?: string | null;
  priority?: string;
  assignedTo?: string | null;
  locationId?: number | null;
  notes?: string;
}

export interface RecordBatchInputData {
  batchId: number;
  requirementId?: number | null;
  inputType: string;
  rawMaterialId?: number | null;
  bulkSpiritId?: number | null;
  liquidLotId?: number | null;
  sourceTankId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId?: number | null;
  sourceLocationId?: number | null;
  actualQuantity: number;
  unit: string;
  actualVolumeLitres?: number | null;
  actualAbv?: number | null;
  notes?: string;
}

export interface RecordBatchLossInput {
  batchId: number;
  lossType: string;
  liquidLotId?: number | null;
  tankId?: number | null;
  volumeLitres?: number | null;
  abv?: number | null;
  quantity?: number | null;
  unit?: string | null;
  reason: string;
}

export interface CompleteBatchInput {
  batchId: number;
  destinationTankId: number;
  actualOutputLitres: number;
  actualOutputAbv: number;
  outputLotType?: string;
  outputDescription?: string;
  actualBrix?: number | null;
  actualPh?: number | null;
  actualCarbonationVolumes?: number | null;
  operatorId?: string | null;
  notes?: string;
}

export interface ProductionProgress {
  orderId: number;
  plannedTotal: number;
  completedActual: number;
  percentComplete: number | null;
  unit: string;
  batchCount: number;
  completedBatchCount: number;
}

export interface ProductionOrdersRepository {
  listOrders(status?: string): ProdOrder[];
  getOrder(id: number): ProdOrder | null;
  createOrder(input: CreateProductionOrderInput): number;
  updateDraftOrder(input: UpdateDraftOrderInput): void;
  planOrder(orderId: number, userId?: string | null): void;
  releaseOrder(orderId: number, userId?: string | null): number;
  cancelOrder(orderId: number, userId?: string | null): void;
  completeOrder(orderId: number, userId?: string | null): void;
  getRequirements(orderId: number): ProdOrderRequirement[];
  getBatches(orderId: number): ProdBatch[];
  createBatch(orderId: number): number;
  getBatch(id: number): ProdBatch | null;
  startBatch(batchId: number, operatorId?: string | null): void;
  recordInput(input: RecordBatchInputData): number;
  recordLoss(input: RecordBatchLossInput): number;
  completeBatch(input: CompleteBatchInput): { lotId: number; transactionIds: number[] };
  cancelBatch(batchId: number, userId?: string | null): void;
  getPlannedVsActual(batchId: number): import('../../shared/production-orders/yield.js').PlannedVsActualLine[];
  getBatchLedgerTransactions(batchId: number): import('./liquid-ledger.js').LiqTransaction[];
  getBatchSteps(batchId: number): ProdBatchStep[];
  updateBatchStepStatus(stepId: number, status: string, completedBy?: string | null): void;
  getEvents(orderId: number): ProdEvent[];
  getProductionProgress(orderId: number): ProductionProgress;
  lookups: { productionTypes(): string[] };
}
