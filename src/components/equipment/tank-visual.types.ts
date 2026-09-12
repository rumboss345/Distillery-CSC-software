import type { EquipmentStatus } from '../../types';

/** Visual status mapped from equipment + fill state (presentation only). */
export type TankVisualStatus =
  | 'available'
  | 'active'
  | 'warning'
  | 'hold'
  | 'offline'
  | 'empty';

/** Props derived from ledger-backed equipment data — no duplicate inventory math in UI. */
export interface TankVisualData {
  id: number;
  code: string;
  name: string;
  tankType: string;
  capacityGal: number;
  currentVolumeGal: number;
  /** 0–100 from currentVolumeGal / capacityGal */
  fillPercent: number;
  liquidName?: string;
  abv?: number;
  status: TankVisualStatus;
  equipmentStatus: EquipmentStatus;
}

export interface TankVisualProps {
  tank: TankVisualData;
  selected?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}
