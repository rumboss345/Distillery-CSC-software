import type {
  LotAllocationMethod,
  ReturnDisposition,
  ReturnStatus,
  SalesChannel,
  SalesOrderStatus,
  SalesOrderType,
  ShipmentStatus,
} from '../../shared/sales/constants';

export type SalCustomer = {
  id: number;
  customer_code: string;
  name: string;
  channel: SalesChannel;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  ship_to_address: string;
  active: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type SalSalesOrder = {
  id: number;
  order_code: string;
  customer_id: number;
  channel: SalesChannel;
  order_type: SalesOrderType;
  order_date: string;
  requested_ship_date: string | null;
  ship_from_location_id: number | null;
  status: SalesOrderStatus;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SalSalesOrderLine = {
  id: number;
  sales_order_id: number;
  line_number: number;
  sku_id: number;
  ordered_quantity: number;
  shipped_quantity: number;
  unit: string;
  notes: string;
};

export type SalShipment = {
  id: number;
  shipment_code: string;
  sales_order_id: number;
  customer_id: number;
  channel: SalesChannel;
  ship_from_location_id: number;
  ship_date: string;
  status: ShipmentStatus;
  posted_at: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SalShipmentLine = {
  id: number;
  shipment_id: number;
  line_number: number;
  sales_order_line_id: number | null;
  sku_id: number;
  fg_lot_id: number;
  source_location_id: number;
  quantity: number;
  allocation_method: LotAllocationMethod;
  unit_cost_kyd_snapshot: number | null;
  extended_cost_kyd: number | null;
  fg_transaction_id: number | null;
  notes: string;
};

export type SalReturn = {
  id: number;
  return_code: string;
  shipment_id: number | null;
  sales_order_id: number | null;
  customer_id: number;
  return_date: string;
  status: ReturnStatus;
  posted_at: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SalReturnLine = {
  id: number;
  return_id: number;
  line_number: number;
  shipment_line_id: number | null;
  fg_lot_id: number;
  sku_id: number;
  quantity: number;
  disposition: ReturnDisposition;
  destination_location_id: number | null;
  unit_cost_kyd_snapshot: number | null;
  extended_cost_kyd: number | null;
  fg_transaction_id: number | null;
  notes: string;
};

export type SalCogsRecord = {
  id: number;
  shipment_id: number;
  shipment_line_id: number;
  sales_order_id: number;
  customer_id: number;
  channel: SalesChannel;
  sku_id: number;
  product_id: number | null;
  fg_lot_id: number;
  source_location_id: number;
  quantity: number;
  unit_cost_kyd_snapshot: number;
  extended_cost_kyd: number;
  recognition_date: string;
  created_at: string;
};

export type CreateCustomerInput = {
  name: string;
  channel: SalesChannel;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  shipToAddress?: string;
  notes?: string;
};

export type CreateSalesOrderInput = {
  customerId: number;
  channel?: SalesChannel;
  orderType?: SalesOrderType;
  orderDate: string;
  requestedShipDate?: string | null;
  shipFromLocationId?: number | null;
  notes?: string;
  createdBy?: string | null;
};

export type AddSalesOrderLineInput = {
  salesOrderId: number;
  skuId: number;
  orderedQuantity: number;
  unit?: string;
  notes?: string;
};

export type LotAllocationSuggestion = {
  fgLotId: number;
  fgLotCode: string;
  skuId: number;
  locationId: number;
  availableQuantity: number;
  productionDate: string;
  expirationDate: string | null;
  unitCostKyd: number | null;
  suggestedQuantity: number;
  allocationMethod: LotAllocationMethod;
};

export type CreateShipmentInput = {
  salesOrderId: number;
  shipDate: string;
  shipFromLocationId: number;
  notes?: string;
  createdBy?: string | null;
};

export type AddShipmentLineInput = {
  shipmentId: number;
  salesOrderLineId?: number | null;
  skuId: number;
  fgLotId: number;
  sourceLocationId: number;
  quantity: number;
  allocationMethod?: LotAllocationMethod;
  notes?: string;
};

export type CreateReturnInput = {
  shipmentId?: number | null;
  salesOrderId?: number | null;
  customerId: number;
  returnDate: string;
  notes?: string;
  createdBy?: string | null;
};

export type AddReturnLineInput = {
  returnId: number;
  shipmentLineId?: number | null;
  fgLotId: number;
  skuId: number;
  quantity: number;
  disposition: ReturnDisposition;
  destinationLocationId?: number | null;
  notes?: string;
};

export type DepletionAnalyticsRow = {
  period: string;
  skuId: number;
  skuCode: string;
  skuName: string;
  productId: number | null;
  productName: string | null;
  customerId: number;
  customerName: string;
  channel: SalesChannel;
  locationId: number;
  locationName: string;
  quantity: number;
  extendedCostKyd: number;
};
