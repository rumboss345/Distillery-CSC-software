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
  isFermenting?: boolean;
  /** Wash tank (mash tun) actively mashing / washing. */
  isWashing?: boolean;
  /** When set on in-use fermenters, drives red vs green liquid fill from Brix. */
  fermenterLatestBrix?: number | null;
  /** Fermenter wash est. ABV from start vs latest Brix (process labels). */
  estimatedAbv?: number | null;
  detail?: string;
  planName?: string;
}

export interface EquipmentVisualProps {
  data: EquipmentVisualData;
  selected?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Multiplier on top of size preset (process view uses this for tank vs still sizing). */
  scaleMultiplier?: number;
  labelStyle?: 'default' | 'process';
  onClick?: () => void;
  className?: string;
}
