import type {
  FgLotStatus,
  FgTransactionType,
  PkgRunStatus,
} from '../../shared/finished-goods/constants';

export type PkgRun = {
  id: number;
  run_code: string;
  production_order_id: number | null;
  production_batch_id: number;
  sku_id: number;
  liquid_lot_id: number;
  source_tank_id: number;
  destination_location_id: number | null;
  planned_quantity: number;
  actual_good_quantity: number | null;
  rejected_quantity: number;
  sample_quantity: number;
  breakage_quantity: number;
  package_size_ml: number | null;
  units_per_case: number | null;
  packaging_bom_snapshot: string;
  liquid_volume_litres: number | null;
  liquid_lpa: number | null;
  liquid_consumed_litres: number | null;
  liquid_loss_litres: number;
  theoretical_units: number | null;
  packaging_yield_percent: number | null;
  liquid_yield_percent: number | null;
  status: PkgRunStatus;
  started_at: string | null;
  completed_at: string | null;
  operator_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type FgLot = {
  id: number;
  fg_lot_code: string;
  printed_lot_code: string | null;
  sku_id: number;
  production_order_id: number | null;
  production_batch_id: number | null;
  packaging_run_id: number | null;
  production_date: string;
  best_before_date: string | null;
  expiration_date: string | null;
  status: FgLotStatus;
  quality_status: string;
  cost_status: string;
  unit_cost_kyd: number | null;
  total_cost_kyd: number | null;
  initial_quantity: number;
  base_unit: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type FgTransaction = {
  id: number;
  transaction_code: string;
  transaction_type: FgTransactionType | string;
  transaction_timestamp: string;
  fg_lot_id: number;
  sku_id: number;
  source_location_id: number | null;
  destination_location_id: number | null;
  quantity: number;
  base_quantity: number;
  base_unit: string;
  transaction_group_id: string | null;
  reference_type: string | null;
  reference_id: number | null;
  unit_cost_kyd_snapshot: number | null;
  extended_cost_kyd: number | null;
  reason_code: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  reversal_of_transaction_id: number | null;
};

export type FgBalance = {
  skuId: number;
  fgLotId: number;
  locationId: number | null;
  quantity: number;
  baseUnit: string;
};

export type FgInventoryRow = {
  fg_lot_id: number;
  fg_lot_code: string;
  printed_lot_code: string | null;
  sku_id: number;
  sku_code: string;
  sku_name: string;
  location_id: number | null;
  location_name: string | null;
  quantity: number;
  unit_cost_kyd: number | null;
  extended_cost_kyd: number | null;
  cost_status: string;
  status: string;
  production_date: string;
};

export type CreatePackagingRunInput = {
  productionBatchId: number;
  skuId: number;
  liquidLotId: number;
  sourceTankId: number;
  destinationLocationId?: number | null;
  plannedQuantity: number;
  packageSizeMl?: number | null;
  unitsPerCase?: number | null;
  notes?: string;
  operatorId?: string | null;
};

export type CompletePackagingRunInput = {
  runId: number;
  actualGoodQuantity: number;
  rejectedQuantity?: number;
  sampleQuantity?: number;
  breakageQuantity?: number;
  liquidConsumedLitres: number;
  liquidLossLitres?: number;
  printedLotCode?: string | null;
  productionDate?: string;
  bestBeforeDate?: string | null;
  expirationDate?: string | null;
  operatorId?: string | null;
  notes?: string;
};
