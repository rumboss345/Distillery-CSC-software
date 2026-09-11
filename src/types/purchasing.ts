import type { MaterialType } from '../../shared/material-inventory/constants';

export interface PurPurchaseOrder {
  id: number;
  po_code: string;
  supplier_id: number;
  order_date: string;
  expected_date: string | null;
  status: string;
  currency: string;
  supplier_reference: string | null;
  ship_to_location_id: number | null;
  payment_terms: string | null;
  shipping_terms: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  supplier_name?: string;
}

export interface PurPurchaseOrderLine {
  id: number;
  purchase_order_id: number;
  line_number: number;
  material_type: MaterialType;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  description: string;
  ordered_quantity: number;
  unit: string;
  normalized_quantity: number | null;
  normalized_unit: string | null;
  unit_price: number;
  currency: string;
  expected_date: string | null;
  notes: string;
  material_name?: string;
  received_quantity?: number;
  remaining_quantity?: number;
}

export interface PurReceipt {
  id: number;
  receipt_code: string;
  purchase_order_id: number | null;
  supplier_id: number;
  received_date: string;
  receiving_location_id: number;
  packing_slip_number: string | null;
  supplier_invoice_number: string | null;
  container_number: string | null;
  bill_of_lading: string | null;
  customs_reference: string | null;
  import_type: string | null;
  origin_country: string | null;
  freight_amount: number | null;
  duty_amount: number | null;
  brokerage_amount: number | null;
  insurance_amount: number | null;
  local_delivery_amount: number | null;
  other_charges: number | null;
  exchange_rate: number | null;
  status: string;
  transaction_group_id: string | null;
  notes: string;
  received_by: string | null;
  created_at: string;
  posted_at: string | null;
  reversed_at: string | null;
  supplier_name?: string;
}

export interface PurReceiptLine {
  id: number;
  receipt_id: number;
  purchase_order_line_id: number | null;
  material_type: MaterialType;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  received_quantity: number;
  unit: string;
  accepted_quantity: number;
  rejected_quantity: number;
  base_quantity: number;
  base_unit: string;
  material_lot_id: number | null;
  unit_cost: number | null;
  currency: string | null;
  notes: string;
  supplier_lot_number: string | null;
  expiration_date: string | null;
  material_name?: string;
  lot_code?: string;
}

export interface CreatePurchaseOrderInput {
  supplierId: number;
  orderDate: string;
  expectedDate?: string | null;
  currency?: string;
  supplierReference?: string | null;
  shipToLocationId?: number | null;
  paymentTerms?: string | null;
  shippingTerms?: string | null;
  notes?: string;
  createdBy?: string | null;
}

export interface AddPurchaseOrderLineInput {
  purchaseOrderId: number;
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  description?: string;
  orderedQuantity: number;
  unit: string;
  unitPrice: number;
  currency?: string;
  expectedDate?: string | null;
  notes?: string;
}

export interface CreateReceiptInput {
  purchaseOrderId?: number | null;
  supplierId: number;
  receivedDate: string;
  receivingLocationId: number;
  packingSlipNumber?: string | null;
  supplierInvoiceNumber?: string | null;
  containerNumber?: string | null;
  billOfLading?: string | null;
  customsReference?: string | null;
  importType?: string | null;
  originCountry?: string | null;
  notes?: string;
  receivedBy?: string | null;
}

export interface AddReceiptLineInput {
  receiptId: number;
  purchaseOrderLineId?: number | null;
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity?: number;
  unit: string;
  supplierLotNumber?: string | null;
  expirationDate?: string | null;
  unitCost?: number | null;
  currency?: string | null;
  notes?: string;
  createLot?: boolean;
}

export interface PurchasingRepository {
  createPurchaseOrder: (input: CreatePurchaseOrderInput) => number;
  updateDraftPurchaseOrder: (id: number, input: Partial<CreatePurchaseOrderInput>) => void;
  addPurchaseOrderLine: (input: AddPurchaseOrderLineInput) => number;
  submitPurchaseOrder: (id: number, userId?: string | null) => void;
  cancelPurchaseOrder: (id: number, userId?: string | null) => void;
  closePurchaseOrder: (id: number, userId?: string | null) => void;
  getPurchaseOrder: (id: number) => PurPurchaseOrder | null;
  listPurchaseOrders: () => PurPurchaseOrder[];
  getPurchaseOrderLines: (purchaseOrderId: number) => PurPurchaseOrderLine[];
  getReceivedQuantity: (lineId: number) => number;
  getRemainingQuantity: (lineId: number) => number;
  createReceipt: (input: CreateReceiptInput) => number;
  addReceiptLine: (input: AddReceiptLineInput) => number;
  postReceipt: (receiptId: number, receivedBy?: string | null) => string;
  getLegacyMaterialsOnReceipt: (receiptId: number) => Array<{ materialName: string; materialType: import('../../shared/material-inventory/constants').MaterialType }>;
  reverseReceipt: (receiptId: number, createdBy?: string | null) => number[];
  getReceipt: (id: number) => PurReceipt | null;
  listReceipts: (purchaseOrderId?: number) => PurReceipt[];
  getReceiptLines: (receiptId: number) => PurReceiptLine[];
}
