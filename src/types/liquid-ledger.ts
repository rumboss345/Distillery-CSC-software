export interface LiqLot {
  id: number;
  lot_code: string;
  lot_type: string;
  product_id: number | null;
  bulk_spirit_id: number | null;
  recipe_version_id: number | null;
  description: string;
  initial_volume_litres: number;
  initial_abv: number;
  initial_lpa: number;
  status: string;
  source_type: string;
  source_reference_id: number | null;
  /** @deprecated Use liq_lot_parents for genealogy; not authoritative. */
  parent_lot_id: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  product_name?: string | null;
  bulk_spirit_name?: string | null;
}

export type LiqLotSaveInput = Omit<
  LiqLot,
  'id' | 'lot_code' | 'initial_lpa' | 'created_at' | 'updated_at' | 'product_name' | 'bulk_spirit_name'
>;

export interface LiqLotParent {
  child_lot_id: number;
  parent_lot_id: number;
  contributed_volume_litres: number;
  contributed_lpa: number;
  transaction_id: number | null;
  created_at: string;
  parent_lot_code?: string;
  child_lot_code?: string;
}

export interface LiqTank {
  id: number;
  tank_code: string;
  name: string;
  tank_type: string;
  capacity_litres: number;
  minimum_working_volume_litres: number | null;
  location_id: number | null;
  floor_equipment_id: number | null;
  tracking_mode: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  location_name?: string | null;
  floor_equipment_name?: string | null;
}

export type LiqTankSaveInput = Omit<
  LiqTank,
  'id' | 'tank_code' | 'created_at' | 'updated_at' | 'location_name' | 'floor_equipment_name'
>;

export interface LiqTransaction {
  id: number;
  transaction_code: string;
  transaction_type: string;
  transaction_timestamp: string;
  source_tank_id: number | null;
  destination_tank_id: number | null;
  source_lot_id: number | null;
  destination_lot_id: number | null;
  volume_litres: number;
  abv: number;
  lpa: number;
  reason_code: string | null;
  source_document_type: string | null;
  source_document_id: number | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  reversal_of_transaction_id: number | null;
  transaction_group_id: string | null;
  source_tank_name?: string | null;
  destination_tank_name?: string | null;
  source_lot_code?: string | null;
  destination_lot_code?: string | null;
}

export type LiqTransactionPostInput = Omit<
  LiqTransaction,
  | 'id'
  | 'transaction_code'
  | 'lpa'
  | 'created_at'
  | 'reversal_of_transaction_id'
  | 'transaction_group_id'
  | 'source_tank_name'
  | 'destination_tank_name'
  | 'source_lot_code'
  | 'destination_lot_code'
> & {
  transaction_group_id?: string | null;
};

export interface TankBalance {
  tankId: number;
  volumeLitres: number;
  lpa: number;
  abv: number;
  capacityLitres: number;
  utilizationPercent: number;
  trackingMode: string;
  isMixed: boolean;
  primaryLotCode: string | null;
}

export interface LotBalance {
  lotId: number;
  volumeLitres: number;
  lpa: number;
  abv: number;
  currentTankId: number | null;
  currentTankName: string | null;
}

export interface TankLotComponent {
  lotId: number;
  lotCode: string;
  lotType: string;
  volumeLitres: number;
  abv: number;
  lpa: number;
}

export interface LiqReconciliation {
  id: number;
  tank_id: number;
  calculated_volume_litres: number;
  measured_volume_litres: number;
  variance_litres: number;
  calculated_abv: number;
  measured_abv: number | null;
  adjustment_transaction_id: number | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  tank_name?: string;
}

export interface BulkSpiritReceiptInput {
  bulkSpiritId: number;
  supplierId?: number | null;
  receivedReference?: string;
  receivedDate: string;
  volumeLitres: number;
  abv: number;
  destinationTankId: number;
  notes?: string;
  createdBy?: string | null;
}

export interface TransferLiquidInput {
  sourceTankId: number;
  destinationTankId: number;
  volumeLitres: number;
  sourceLotId?: number | null;
  notes?: string;
  createdBy?: string | null;
}

export interface BlendInput {
  sourceTankId: number;
  destinationTankId: number;
  consumptions: Array<{ lotId: number; volumeLitres: number }>;
  outputLotType: string;
  outputDescription: string;
  productId?: number | null;
  notes?: string;
  createdBy?: string | null;
}

export interface ProofDownInput {
  sourceTankId: number;
  sourceLotId: number;
  sourceVolumeLitres: number;
  sourceAbv: number;
  waterVolumeLitres: number;
  targetAbv: number;
  actualOutputVolumeLitres?: number | null;
  destinationTankId: number;
  notes?: string;
  createdBy?: string | null;
}

export interface OpeningBalanceInput {
  tankId: number;
  lotType: string;
  description: string;
  volumeLitres: number;
  abv: number;
  effectiveDate: string;
  productId?: number | null;
  bulkSpiritId?: number | null;
  notes?: string;
  createdBy?: string | null;
}

export interface ReconcileTankInput {
  tankId: number;
  measuredVolumeLitres: number;
  measuredAbv?: number | null;
  reasonCode: string;
  notes?: string;
  createdBy?: string | null;
}

export interface LiquidLotsRepository {
  createLot(input: LiqLotSaveInput): number;
  getLot(id: number): LiqLot | null;
  listLots(status?: string): LiqLot[];
  getLotParents(lotId: number): LiqLotParent[];
  getLotChildren(lotId: number): LiqLotParent[];
  getLotAncestry(lotId: number): LiqLotParent[];
  getLotBalance(lotId: number): LotBalance;
}

export interface TankRepository {
  listTanks(): LiqTank[];
  getTank(id: number): LiqTank | null;
  saveTank(input: LiqTankSaveInput, id?: number): number;
  getTankBalance(tankId: number): TankBalance;
  getTankLotComponents(tankId: number): TankLotComponent[];
  listLegacyFloorTanks(): Array<{ id: number; name: string; volumeGal: number; abv: number; trackingMode: string }>;
}

export interface LiquidLedgerRepository {
  postTransaction(input: LiqTransactionPostInput): number;
  reverseTransaction(transactionId: number, createdBy?: string | null): number[];
  getTransactions(filters?: {
    tankId?: number;
    lotId?: number;
    transactionType?: string;
    limit?: number;
  }): LiqTransaction[];
  receiveBulkSpirit(input: BulkSpiritReceiptInput): { lotId: number; transactionId: number };
  transferLiquid(input: TransferLiquidInput): number;
  createBlend(input: BlendInput): { lotId: number; transactionIds: number[] };
  proofDown(input: ProofDownInput): { lotId: number; transactionIds: number[] };
  postOpeningBalance(input: OpeningBalanceInput): { lotId: number; transactionId: number };
  reconcileTank(input: ReconcileTankInput): { reconciliationId: number; transactionId: number | null };
  postAdjustment(input: {
    tankId: number;
    lotId?: number | null;
    volumeLitres: number;
    abv: number;
    increase: boolean;
    reasonCode: string;
    notes?: string;
    createdBy?: string | null;
  }): number;
}
