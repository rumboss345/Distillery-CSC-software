import { formatGal } from './equipment-visual-shared';
import {
  classifyProcessLiquid,
  processEquipmentShortName,
  spiritLiquidLabel,
} from './process-floor-label';
import type { EquipmentVisualData } from './equipment-visual.types';
import type { TankVisualData } from './tank-visual.types';

type LabelData = Pick<
  EquipmentVisualData,
  | 'name'
  | 'capacityGal'
  | 'currentVolumeGal'
  | 'fillPercent'
  | 'liquidName'
  | 'abv'
  | 'isFermenting'
  | 'estimatedAbv'
  | 'fermenterLatestBrix'
>;

export function ProcessEquipmentLabels({
  data,
  showVolume = true,
}: {
  data: LabelData | TankVisualData;
  showVolume?: boolean;
}) {
  const isEmpty = data.currentVolumeGal <= 0 && data.fillPercent <= 0 && !data.liquidName;
  const isFermenting = 'isFermenting' in data && data.isFermenting === true;
  const brix = 'fermenterLatestBrix' in data ? data.fermenterLatestBrix : undefined;
  const shortName = processEquipmentShortName(data.name);
  const classified = spiritLiquidLabel(classifyProcessLiquid(data.name, data.liquidName));
  const contents = !isEmpty
    ? (data.liquidName && data.liquidName !== data.name ? data.liquidName : classified)
    : null;
  const volumeText = isEmpty
    ? `EMPTY · ${formatGal(data.capacityGal)} gal`
    : `${formatGal(data.currentVolumeGal)} gal`;
  const showEstimate = !isEmpty && 'estimatedAbv' in data && data.estimatedAbv !== undefined;
  const abvText = showEstimate
    ? `Est. ${data.estimatedAbv != null ? `${data.estimatedAbv.toFixed(1)}%` : '—'} ABV`
    : (!isEmpty && data.abv != null ? `${data.abv.toFixed(1)}% ABV` : null);

  return (
    <div className="process-equipment-labels">
      <div className="process-equipment-id" title={data.name}>{shortName}</div>
      {showVolume && isFermenting && (
        <div className="process-equipment-status process-equipment-status--fermenting">Fermenting</div>
      )}
      {showVolume && contents && (
        <div className="process-equipment-contents" title={contents}>{contents}</div>
      )}
      {showVolume && (
        <div className={`process-equipment-status${isEmpty ? ' process-equipment-status--empty' : ''}`}>
          {volumeText}
        </div>
      )}
      {showVolume && brix != null && !isEmpty && (
        <div className="process-equipment-brix">{brix.toFixed(1)}° Brix</div>
      )}
      {showVolume && abvText && <div className="process-equipment-abv">{abvText}</div>}
    </div>
  );
}
