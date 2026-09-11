import type { MaterialType } from '../../shared/material-inventory/constants';

export interface MatLot {
  id: number;
  lot_code: string;
  material_type: MaterialType;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  supplier_id: number | null;
  supplier_lot_number: string | null;
  manufacturer_lot_number: string | null;
  received_date: string | null;
  manufacture_date: string | null;
  expiration_date: string | null;
  best_before_date: string | null;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  material_name?: string;
}

export interface MatUomConversion {
  id: number;
  material_type: MaterialType;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  from_unit: string;
  to_unit: string;
  conversion_factor: number;
  description: string;
  active: number;
}

export interface MatTransaction {
  id: number;
  transaction_code: string;
  transaction_group_id: string | null;
  transaction_type: string;
  transaction_timestamp: string;
  material_type: MaterialType;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  material_lot_id: number | null;
  source_location_id: number | null;
  source_bin_id: number | null;
  destination_location_id: number | null;
  destination_bin_id: number | null;
  quantity: number;
  unit: string;
  base_quantity: number;
  base_unit: string;
  reason_code: string | null;
  source_document_type: string | null;
  source_document_id: number | null;
  purchase_order_id: number | null;
  receipt_id: number | null;
  production_order_id: number | null;
  production_batch_id: number | null;
  unit_cost: number | null;
  cost_unit: string | null;
  currency: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  reversal_of_transaction_id: number | null;
  material_name?: string;
  lot_code?: string;
}

export interface MaterialBalance {
  materialType: MaterialType;
  rawMaterialId: number | null;
  packagingMaterialId: number | null;
  baseUnit: string;
  onHand: number;
}

export interface LocationBalance {
  locationId: number;
  locationName?: string;
  onHand: number;
  baseUnit: string;
}

export interface MatReconciliation {
  id: number;
  material_type: MaterialType;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  material_lot_id: number | null;
  location_id: number;
  system_quantity: number;
  physical_quantity: number;
  variance_quantity: number;
  unit: string;
  base_unit: string;
  status: string;
  reason: string;
  transaction_id: number | null;
  counted_by: string | null;
  counted_at: string | null;
  posted_at: string | null;
  notes: string;
}

export interface CreateMatLotInput {
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  supplierId?: number | null;
  supplierLotNumber?: string | null;
  manufacturerLotNumber?: string | null;
  receivedDate?: string | null;
  manufactureDate?: string | null;
  expirationDate?: string | null;
  bestBeforeDate?: string | null;
  status?: string;
  notes?: string;
}

export interface PostMaterialTransactionInput {
  transactionType: string;
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId?: number | null;
  sourceLocationId?: number | null;
  destinationLocationId?: number | null;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  reasonCode?: string | null;
  sourceDocumentType?: string | null;
  sourceDocumentId?: number | null;
  purchaseOrderId?: number | null;
  receiptId?: number | null;
  productionOrderId?: number | null;
  productionBatchId?: number | null;
  unitCost?: number | null;
  costUnit?: string | null;
  currency?: string | null;
  transactionGroupId?: string | null;
  transactionTimestamp?: string;
  notes?: string;
  createdBy?: string | null;
}

export interface TransferMaterialInput {
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId: number;
  sourceLocationId: number;
  destinationLocationId: number;
  quantity: number;
  unit: string;
  notes?: string;
  createdBy?: string | null;
}

export interface MaterialInventoryRepository {
  lots: {
    create: (input: CreateMatLotInput) => number;
    get: (id: number) => MatLot | null;
    list: (filters?: { materialType?: MaterialType; rawMaterialId?: number; packagingMaterialId?: number }) => MatLot[];
    getAvailableLots: (materialType: MaterialType, rawMaterialId: number | null, packagingMaterialId: number | null, locationId?: number) => MatLot[];
  };
  balance: {
    getMaterialBalance: (materialType: MaterialType, rawMaterialId: number | null, packagingMaterialId: number | null) => MaterialBalance;
    getMaterialBalanceByLocation: (materialType: MaterialType, rawMaterialId: number | null, packagingMaterialId: number | null, locationId: number) => number;
    getLotBalance: (lotId: number) => number;
    getLotBalanceByLocation: (lotId: number, locationId: number) => number;
  };
  ledger: {
    postTransaction: (input: PostMaterialTransactionInput) => number;
    reverseTransaction: (transactionId: number, createdBy?: string | null) => number[];
    transferMaterial: (input: TransferMaterialInput) => string;
    postOpeningBalance: (input: {
      materialType: MaterialType;
      rawMaterialId?: number | null;
      packagingMaterialId?: number | null;
      materialLotId: number;
      locationId: number;
      quantity: number;
      unit: string;
      effectiveDate?: string;
      notes?: string;
      createdBy?: string | null;
    }) => number;
    getTransactions: (filters?: Record<string, unknown>) => MatTransaction[];
  };
  uom: {
    saveConversion: (input: Omit<MatUomConversion, 'id'>) => number;
    getConversions: (materialType: MaterialType, rawMaterialId: number | null, packagingMaterialId: number | null) => MatUomConversion[];
    normalizeQuantity: (materialType: MaterialType, rawMaterialId: number | null, packagingMaterialId: number | null, quantity: number, unit: string) => { baseQuantity: number; baseUnit: string };
  };
  reconcile: {
    preview: (input: Omit<MatReconciliation, 'id' | 'status' | 'transaction_id' | 'posted_at'>) => MatReconciliation;
    post: (reconciliationId: number, countedBy?: string | null) => number;
  };
}
