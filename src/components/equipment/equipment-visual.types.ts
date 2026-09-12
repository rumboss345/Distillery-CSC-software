import type { EquipmentType } from '../../types';
import type { TankVisualStatus } from './tank-visual.types';

export type EquipmentVisualStatus = TankVisualStatus;

export interface EquipmentVisualData {
  id: number;
  code: string;
  name: string;
  equipmentType: EquipmentType;
  typeLabel: string;
  capacityGal: number;
  currentVolumeGal: number;
  fillPercent: number;
  liquidName?: string;
  abv?: number;
  status: EquipmentVisualStatus;
  detail?: string;
  planName?: string;
}

export interface EquipmentVisualProps {
  data: EquipmentVisualData;
  selected?: boolean;
  size?: 'sm' | 'md' | 'lg';
  labelStyle?: 'default' | 'process';
  onClick?: () => void;
  className?: string;
}
