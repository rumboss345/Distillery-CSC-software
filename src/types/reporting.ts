/** Phase 1O Management Dashboard, Reports & KPI Analytics. */

export type ReportPeriodFilter = {
  periodStart?: string;
  periodEnd?: string;
};

export type ExecutiveDashboardSummary = {
  fgValueKyd: number | null;
  materialValueKyd: number | null;
  liquidValueKyd: number | null;
  productionInProgress: number;
  poOutstanding: number;
  shortages: number;
  qaHolds: number;
  maintenanceDue: number;
  fgDepletionUnits: number;
  operationalCogsKyd: number;
  unvaluedInventoryWarnings: number;
  valuationStatus: 'FULLY_VALUED' | 'PARTIALLY_VALUED' | 'UNVALUED' | 'NO_INVENTORY';
};

export type ProductionKpiRow = {
  period: string;
  ordersReleased: number;
  ordersCompleted: number;
  batchesStarted: number;
  batchesCompleted: number;
  avgBatchCostKyd: number | null;
  totalOutputLitres: number;
};

export type MaterialInventoryReportRow = {
  materialType: string;
  materialCode: string;
  materialName: string;
  lotCode: string;
  remainingQty: number;
  unitCostKyd: number | null;
  extendedValueKyd: number | null;
  costStatus: string;
};

export type LiquidInventoryReportRow = {
  lotCode: string;
  lotType: string;
  tankName: string;
  volumeLitres: number;
  abv: number;
  lpa: number;
  positionCostKyd: number;
  costStatus: string;
};

export type FgInventoryReportRow = {
  skuCode: string;
  skuName: string;
  fgLotCode: string;
  locationName: string | null;
  quantity: number;
  unitCostKyd: number | null;
  extendedValueKyd: number | null;
  costStatus: string;
};

export type PurchasingReportRow = {
  poCode: string;
  supplierName: string;
  orderDate: string;
  status: string;
  materialName: string;
  orderedQty: number;
  receivedQty: number;
  remainingQty: number;
  currency: string;
};

export type BarrelReportRow = {
  barrelCode: string;
  status: string;
  locationName: string | null;
  fillDate: string | null;
  volumeLitres: number;
  liquidCostKyd: number;
  assetCostKyd: number;
  ageDays: number | null;
};

export type CostingReportRow = {
  category: string;
  entityCode: string;
  description: string;
  quantity: number;
  unit: string;
  totalCostKyd: number | null;
  costStatus: string;
};

export type UnvaluedInventoryWarning = {
  inventoryType: 'Material' | 'Liquid' | 'Finished Goods';
  entityCode: string;
  description: string;
  quantity: number;
  unit: string;
};
