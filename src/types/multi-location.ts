import type {
  BarcodeEntityType,
  CycleCountStatus,
  HierarchyLevel,
  InventoryItemType,
  TransferDocStatus,
} from '../../shared/multi-location/constants';

export interface TransferDocument {
  id: number;
  transfer_code: string;
  status: TransferDocStatus;
  origin_location_id: number;
  destination_location_id: number;
  ship_date: string | null;
  receive_date: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransferLine {
  id: number;
  transfer_document_id: number;
  line_number: number;
  inventory_type: InventoryItemType;
  material_lot_id: number | null;
  fg_lot_id: number | null;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  sku_id: number | null;
  quantity: number;
  unit: string;
  received_quantity: number;
  transaction_group_id: string | null;
  notes: string;
}

export interface CycleCount {
  id: number;
  count_code: string;
  location_id: number;
  status: CycleCountStatus;
  count_date: string;
  posted_at: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CycleCountLine {
  id: number;
  cycle_count_id: number;
  inventory_type: InventoryItemType;
  material_lot_id: number | null;
  fg_lot_id: number | null;
  sku_id: number | null;
  system_quantity: number;
  counted_quantity: number | null;
  variance_quantity: number | null;
  unit: string;
  posted: number;
  notes: string;
}

export interface BarcodeRecord {
  id: number;
  barcode: string;
  entity_type: BarcodeEntityType;
  entity_id: number;
  label_text: string;
  active: number;
  created_at: string;
}

export interface CreateTransferDocumentInput {
  originLocationId: number;
  destinationLocationId: number;
  shipDate?: string | null;
  notes?: string;
  createdBy?: string | null;
  lines: Array<{
    inventoryType: InventoryItemType;
    materialLotId?: number | null;
    fgLotId?: number | null;
    rawMaterialId?: number | null;
    packagingMaterialId?: number | null;
    skuId?: number | null;
    quantity: number;
    unit: string;
    notes?: string;
  }>;
}

export interface LabelData {
  code: string;
  description: string;
  lot: string;
  date: string;
  barcode: string;
}

export interface LocationHierarchyNode {
  id: number;
  location_code: string;
  name: string;
  hierarchy_level: HierarchyLevel | null;
  location_type: string;
  parent_location_id: number | null;
  children: LocationHierarchyNode[];
}
