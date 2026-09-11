import type {
  AllocationMethod,
  BatchSnapshotType,
  ConversionCostType,
  CostAdjustmentTarget,
  CostStatus,
  LandedCostComponentType,
  LandedCostStatus,
  LiquidCostSourceType,
  MaterialCostSourceType,
  ProductionOutputType,
} from '../../shared/costing/constants';

export type CostLandedCostDocument = {
  id: number;
  landed_cost_code: string;
  status: LandedCostStatus;
  supplier_id: number | null;
  purchase_order_id: number | null;
  receipt_id: number | null;
  shipment_reference: string | null;
  container_number: string | null;
  bill_of_lading: string | null;
  currency: string;
  exchange_rate_to_kyd: number;
  effective_date: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  reversed_at: string | null;
};

export type CostLandedCostComponent = {
  id: number;
  landed_cost_document_id: number;
  component_type: LandedCostComponentType | string;
  description: string;
  original_amount: number;
  currency: string;
  exchange_rate_to_kyd: number;
  kyd_amount: number;
  allocation_method: AllocationMethod;
  notes: string;
};

export type CostMaterialLotLayer = {
  id: number;
  material_lot_id: number;
  source_type: MaterialCostSourceType | string;
  source_id: number | null;
  effective_date: string;
  quantity_basis: number;
  purchase_cost_kyd: number;
  landed_cost_kyd: number;
  total_cost_kyd: number;
  unit_cost_kyd: number | null;
  currency_snapshot: string | null;
  exchange_rate_snapshot: number | null;
  cost_status: CostStatus;
  status: string;
  created_at: string;
};

export type CostMaterialConsumption = {
  id: number;
  material_transaction_id: number;
  production_order_id: number | null;
  production_batch_id: number | null;
  material_lot_id: number;
  base_quantity_consumed: number;
  unit_cost_kyd_snapshot: number | null;
  extended_cost_kyd: number | null;
  cost_status: CostStatus;
  source_cost_layer_id: number | null;
  created_at: string;
};

export type CostLiquidLotLayer = {
  id: number;
  liquid_lot_id: number;
  source_type: LiquidCostSourceType | string;
  source_id: number | null;
  production_batch_id: number | null;
  effective_date: string;
  volume_litres: number;
  lpa: number;
  input_cost_kyd: number;
  conversion_cost_kyd: number;
  total_cost_kyd: number;
  cost_per_litre_kyd: number | null;
  cost_per_lpa_kyd: number | null;
  cost_status: CostStatus;
  status: string;
  created_at: string;
};

export type CostBatchSnapshot = {
  id: number;
  production_batch_id: number;
  snapshot_type: BatchSnapshotType;
  status: string;
  material_cost_kyd: number | null;
  liquid_cost_kyd: number | null;
  conversion_cost_kyd: number;
  total_cost_kyd: number | null;
  output_volume_litres: number | null;
  output_lpa: number | null;
  cost_per_litre_kyd: number | null;
  cost_per_lpa_kyd: number | null;
  planned_cost_kyd: number | null;
  variance_kyd: number | null;
  variance_percent: number | null;
  unvalued_input_count: number;
  created_at: string;
  finalized_at: string | null;
  notes: string;
};

export type CostBatchConversionCost = {
  id: number;
  production_batch_id: number;
  cost_type: ConversionCostType | string;
  description: string;
  quantity: number | null;
  rate: number | null;
  original_currency: string;
  original_amount: number;
  exchange_rate_to_kyd: number;
  amount_kyd: number;
  status: string;
  notes: string;
  created_at: string;
  finalized_at: string | null;
};

export type CostAdjustment = {
  id: number;
  adjustment_code: string;
  target_type: CostAdjustmentTarget;
  target_id: number;
  reason: string;
  amount_kyd: number;
  effective_date: string;
  source_document_type: string | null;
  source_document_id: number | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  reversal_of_adjustment_id: number | null;
};

export type MaterialLotValuationRow = {
  material_lot_id: number;
  lot_code: string;
  material_name: string;
  material_type: string;
  supplier_name: string | null;
  receipt_code: string | null;
  received_qty: number;
  remaining_qty: number;
  purchase_cost_kyd: number;
  landed_cost_kyd: number;
  total_cost_kyd: number;
  unit_cost_kyd: number | null;
  remaining_value_kyd: number | null;
  cost_status: CostStatus;
};

export type LiquidLotValuationRow = {
  liquid_lot_id: number;
  lot_code: string;
  lot_type: string;
  current_volume_litres: number;
  current_abv: number;
  current_lpa: number;
  accumulated_cost_kyd: number;
  cost_per_litre_kyd: number | null;
  cost_per_lpa_kyd: number | null;
  cost_status: CostStatus;
  source_batch_code: string | null;
};

export type LiquidPositionValuationRow = {
  liquid_lot_id: number;
  lot_code: string;
  lot_type: string;
  tank_id: number;
  tank_name: string;
  current_volume_litres: number;
  current_abv: number;
  current_lpa: number;
  position_cost_kyd: number;
  cost_per_litre_kyd: number | null;
  cost_per_lpa_kyd: number | null;
  cost_status: CostStatus;
  lot_economic_cost_kyd: number;
  source_batch_code: string | null;
};

export type CostLiquidMovement = {
  id: number;
  liquid_transaction_id: number | null;
  transaction_group_id: string | null;
  liquid_lot_id: number;
  source_tank_id: number | null;
  destination_tank_id: number | null;
  volume_litres: number;
  lpa: number | null;
  transferred_cost_kyd: number;
  cost_per_litre_snapshot: number | null;
  cost_per_lpa_snapshot: number | null;
  movement_type: string;
  status: string;
  reversal_of_id: number | null;
  costing_status: string;
  source_cost_layer_id: number | null;
  notes: string;
  created_at: string;
};

export type BatchCostBreakdown = {
  batchId: number;
  batchCode: string;
  materialCosts: Array<{
    materialName: string;
    lotCode: string;
    quantity: number;
    unit: string;
    unitCostKyd: number | null;
    extendedCostKyd: number | null;
    costStatus: CostStatus;
    supplierName: string | null;
    receiptCode: string | null;
  }>;
  liquidCosts: Array<{
    lotCode: string;
    volumeLitres: number;
    abv: number;
    lpa: number;
    costPerLitreKyd: number | null;
    costPerLpaKyd: number | null;
    extendedCostKyd: number | null;
    sourceBatchCode: string | null;
  }>;
  conversionCosts: Array<{
    costType: string;
    description: string;
    amountKyd: number;
  }>;
  snapshot: CostBatchSnapshot | null;
};

export type CostTraceabilityNode = {
  entityType: string;
  entityId: number;
  code: string;
  description: string;
  costKyd: number | null;
  children: CostTraceabilityNode[];
};

export type CostDashboardSummary = {
  /** Sum of known-valued material lots only; null when no valued lots exist. */
  knownMaterialInventoryValueKyd: number | null;
  /** Sum of known-valued liquid lots only; null when no valued lots exist. */
  knownLiquidInventoryValueKyd: number | null;
  /** @deprecated use knownMaterialInventoryValueKyd */
  materialInventoryValueKyd: number | null;
  /** @deprecated use knownLiquidInventoryValueKyd */
  liquidInventoryValueKyd: number | null;
  unvaluedMaterialLots: number;
  unvaluedLiquidLots: number;
  batchesAwaitingCostFinalization: number;
  recentLandedCostDocuments: CostLandedCostDocument[];
  recentAdjustments: CostAdjustment[];
  valuationStatus: CostStatus;
};

export type ProductionOutputTypeExport = ProductionOutputType;
