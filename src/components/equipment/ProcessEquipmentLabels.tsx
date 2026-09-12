import { formatGal } from './equipment-visual-shared';
import type { EquipmentVisualData } from './equipment-visual.types';
import type { TankVisualData } from './tank-visual.types';

type LabelData = Pick<
  EquipmentVisualData,
  'name' | 'capacityGal' | 'currentVolumeGal' | 'fillPercent' | 'liquidName' | 'abv'
>;

export function ProcessEquipmentLabels({ data }: { data: LabelData | TankVisualData }) {
  const isEmpty = data.currentVolumeGal <= 0 && data.fillPercent <= 0 && !data.liquidName;
  const volumeText = isEmpty
    ? `EMPTY (${formatGal(data.capacityGal)} gal)`
    : `${formatGal(data.currentVolumeGal)} gal`;

  return (
    <div className="process-equipment-labels">
      <div className="process-equipment-id">{data.name}</div>
      <div className={`process-equipment-status${isEmpty ? ' process-equipment-status--empty' : ''}`}>
        {volumeText}
      </div>
      {!isEmpty && (
        <div className="process-equipment-abv">
          {data.abv != null && data.abv > 0 ? `${data.abv.toFixed(1)}% ABV` : '—'}
        </div>
      )}
    </div>
  );
}
