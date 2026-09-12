import type { ReactNode } from 'react';
import type { EquipmentVisualData, EquipmentVisualProps } from './equipment-visual.types';
import { STATUS_LABELS, formatGal } from './equipment-visual-shared';
import { ProcessEquipmentLabels } from './ProcessEquipmentLabels';

const SIZE_MAP = { sm: 0.72, md: 0.88, lg: 1 } as const;

interface FrameProps extends EquipmentVisualProps {
  children: ReactNode;
  svgWidth?: number;
  svgHeight?: number;
  showVolume?: boolean;
}

export function EquipmentVisualFrame({
  data,
  selected = false,
  size = 'md',
  labelStyle = 'default',
  onClick,
  className = '',
  children,
  svgWidth = 140,
  svgHeight = 180,
  showVolume = true,
}: FrameProps) {
  const scale = SIZE_MAP[size];
  const tooltip = buildTooltip(data);
  const isProcess = labelStyle === 'process';

  return (
    <button
      type="button"
      className={`equipment-visual${selected ? ' equipment-visual--selected' : ''}${onClick ? ' equipment-visual--interactive' : ''}${isProcess ? ' equipment-visual--process' : ''} ${className}`.trim()}
      style={{ '--eq-scale': scale } as React.CSSProperties}
      onClick={onClick}
      title={tooltip}
      aria-label={`${data.name}, ${Math.round(data.fillPercent)} percent full`}
      aria-pressed={selected}
    >
      {!isProcess && (
        <div className="equipment-visual-tooltip" role="tooltip">
          <TooltipContent data={data} />
        </div>
      )}
      <div className="equipment-visual-svg-wrap" style={{ width: svgWidth * scale, height: svgHeight * scale }}>
        {children}
      </div>
      {isProcess ? (
        <ProcessEquipmentLabels data={data} />
      ) : (
        <div className="equipment-visual-labels">
          <span className="equipment-visual-code">{data.code}</span>
          <span className="equipment-visual-name">{data.name}</span>
          {showVolume && data.capacityGal > 0 && (
            <span className="equipment-visual-volume">
              {formatGal(data.currentVolumeGal)} / {formatGal(data.capacityGal)} gal
            </span>
          )}
          {showVolume && data.capacityGal > 0 && (
            <span className="equipment-visual-percent">{Math.round(data.fillPercent)}%</span>
          )}
          {data.liquidName && !showVolume && (
            <span className="equipment-visual-detail">{data.liquidName}</span>
          )}
        </div>
      )}
    </button>
  );
}

function TooltipContent({ data }: { data: EquipmentVisualData }) {
  return (
    <>
      <strong>{data.code} — {data.name}</strong>
      <span>{data.typeLabel}{data.planName ? ` · ${data.planName}` : ''}</span>
      {data.liquidName && <span>{data.liquidName}</span>}
      {data.capacityGal > 0 && (
        <span>{formatGal(data.currentVolumeGal)} / {formatGal(data.capacityGal)} gal · {Math.round(data.fillPercent)}%</span>
      )}
      {data.abv != null && <span>{data.abv.toFixed(1)}% ABV</span>}
      {data.detail && data.detail !== data.liquidName && <span>{data.detail}</span>}
      <span className="equipment-visual-tooltip-status">{STATUS_LABELS[data.status]}</span>
    </>
  );
}

function buildTooltip(data: EquipmentVisualData): string {
  return [
    `${data.code} — ${data.name}`,
    data.typeLabel,
    data.liquidName,
    data.capacityGal > 0 ? `${formatGal(data.currentVolumeGal)} / ${formatGal(data.capacityGal)} gal` : null,
    data.capacityGal > 0 ? `${Math.round(data.fillPercent)}%` : null,
    data.abv != null ? `${data.abv.toFixed(1)}% ABV` : null,
    STATUS_LABELS[data.status],
  ].filter(Boolean).join('\n');
}
