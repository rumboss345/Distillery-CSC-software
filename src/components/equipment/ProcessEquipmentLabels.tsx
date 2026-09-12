import { formatGal } from './equipment-visual-shared';
import type { EquipmentVisualData } from './equipment-visual.types';
import type { TankVisualData } from './tank-visual.types';

type LabelData = Pick<
  EquipmentVisualData,
  'code' | 'name' | 'capacityGal' | 'fillPercent' | 'liquidName'
>;

export function ProcessEquipmentLabels({ data }: { data: LabelData | TankVisualData }) {
  const isEmpty = data.fillPercent <= 0 && !data.liquidName;
  const statusText = isEmpty
    ? `EMPTY (${formatGal(data.capacityGal)} gal)`
    : (data.liquidName || data.name).toUpperCase();

  return (
    <div className="process-equipment-labels">
      <div className="process-equipment-id">{data.code}</div>
      <div className={`process-equipment-status${isEmpty ? ' process-equipment-status--empty' : ''}`}>
        {statusText}
      </div>
    </div>
  );
}
