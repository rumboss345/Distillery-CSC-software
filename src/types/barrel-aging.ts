import type { BarrelFillStatus, BarrelStatus } from '../../shared/barrel-aging/constants';

export interface BrlBarrel {
  id: number;
  barrel_code: string;
  cooperage: string;
  wood_type: string;
  capacity_litres: number;
  fill_count: number;
  location_id: number | null;
  purchase_cost_kyd: number;
  barcode: string;
  status: BarrelStatus;
  active_fill_id: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  location_name?: string | null;
}

export interface BrlBarrelSaveInput {
  cooperage: string;
  wood_type: string;
  capacity_litres: number;
  location_id?: number | null;
  purchase_cost_kyd?: number;
  barcode?: string;
  notes?: string;
}

export interface BrlFill {
  id: number;
  fill_code: string;
  barrel_id: number;
  liquid_lot_id: number;
  source_tank_id: number;
  fill_date: string;
  fill_number: number;
  initial_volume_litres: number;
  initial_abv: number;
  initial_lpa: number;
  liquid_cost_kyd: number;
  status: BarrelFillStatus;
  transaction_group_id: string | null;
  liquid_transaction_id: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  barrel_code?: string;
  lot_code?: string;
  source_tank_name?: string;
}

export interface BrlObservation {
  id: number;
  observation_code: string;
  barrel_id: number;
  fill_id: number;
  observation_date: string;
  sequence_number: number;
  volume_litres: number;
  abv: number;
  lpa: number;
  is_fill_event: number;
  is_dump_event: number;
  notes: string;
  created_by: string | null;
  created_at: string;
}

export interface BrlAngelShareEvent {
  id: number;
  fill_id: number;
  from_observation_id: number;
  to_observation_id: number;
  volume_lost_litres: number;
  lpa_lost: number;
  liquid_cost_before_kyd: number;
  liquid_cost_after_kyd: number;
  cost_per_litre_after: number | null;
  notes: string;
  created_at: string;
}

export interface BrlDump {
  id: number;
  dump_code: string;
  fill_id: number;
  barrel_id: number;
  destination_tank_id: number;
  destination_lot_id: number;
  dump_date: string;
  volume_litres: number;
  abv: number;
  lpa: number;
  liquid_cost_kyd: number;
  transaction_group_id: string | null;
  liquid_transaction_id: number | null;
  observation_id: number | null;
  notes: string;
  created_at: string;
  barrel_code?: string;
  destination_tank_name?: string;
  destination_lot_code?: string;
}

export interface BarrelFillPosition {
  fillId: number;
  volumeLitres: number;
  abv: number;
  lpa: number;
  liquidCostKyd: number;
  costPerLitreKyd: number | null;
}

export interface CreateBarrelFillInput {
  barrelId: number;
  sourceTankId: number;
  liquidLotId: number;
  fillDate: string;
  volumeLitres: number;
  abv: number;
  notes?: string;
  createdBy?: string | null;
}

export interface RecordBarrelObservationInput {
  fillId: number;
  observationDate: string;
  volumeLitres: number;
  abv: number;
  notes?: string;
  createdBy?: string | null;
}

export interface DumpBarrelInput {
  fillId: number;
  destinationTankId: number;
  dumpDate: string;
  volumeLitres?: number;
  abv?: number;
  createAgedLot?: boolean;
  agedLotDescription?: string;
  notes?: string;
  createdBy?: string | null;
}
