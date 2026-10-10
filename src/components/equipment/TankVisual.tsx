import { useId } from 'react';
import type { TankVisualProps, TankVisualStatus } from './tank-visual.types';
import { ProcessEquipmentLabels } from './ProcessEquipmentLabels';
import { TankVesselArt } from './tank-vessel-art';
import './tank-visual.css';

const LIQUID_COLORS: Record<TankVisualStatus, { base: string; highlight: string; edge: string }> = {
  available: { base: '#1a8fb8', highlight: '#5ec8e8', edge: '#0e5f7a' },
  active: { base: '#2a9d4f', highlight: '#6fd98a', edge: '#1a6b35' },
  warning: { base: '#c4841a', highlight: '#f0b84a', edge: '#8a5a0e' },
  hold: { base: '#c43a3a', highlight: '#f07070', edge: '#8a2020' },
  offline: { base: '#5a6270', highlight: '#8a929e', edge: '#3a4048' },
  empty: { base: '#4a5568', highlight: '#718096', edge: '#2d3748' },
};

const STATUS_LABELS: Record<TankVisualStatus, string> = {
  available: 'Available',
  active: 'In use',
  warning: 'Cleaning',
  hold: 'Hold',
  offline: 'Offline',
  empty: 'Empty',
};

const SIZE_MAP = { sm: 0.75, md: 1, lg: 1.35 } as const;

function formatGal(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function TankVisual({
  tank,
  shape = 'holding',
  selected = false,
  size = 'md',
  scaleMultiplier = 1,
  labelStyle = 'default',
  onClick,
  className = '',
  preview = false,
}: TankVisualProps) {
  const uid = useId().replace(/:/g, '');
  const scale = SIZE_MAP[size] * scaleMultiplier;
  const liquid = tank.status === 'offline' || tank.status === 'empty'
    ? LIQUID_COLORS[tank.status]
    : (tank.liquidPalette ?? LIQUID_COLORS[tank.status]);
  const isProcess = labelStyle === 'process';

  const tooltip = [
    `${tank.code} — ${tank.name}`,
    tank.liquidName,
    `${formatGal(tank.currentVolumeGal)} / ${formatGal(tank.capacityGal)} gal`,
    `${Math.round(tank.fillPercent)}%`,
    tank.abv != null ? `${tank.abv.toFixed(1)}% ABV` : null,
    STATUS_LABELS[tank.status],
  ].filter(Boolean).join('\n');

  const Root = preview ? 'div' : 'button';

  return (
    <Root
      {...(preview ? {} : {
        type: 'button' as const,
        onClick,
        title: tooltip,
        'aria-label': `${tank.name}, ${Math.round(tank.fillPercent)} percent full`,
        'aria-pressed': selected,
      })}
      className={`tank-visual${selected ? ' tank-visual--selected' : ''}${onClick ? ' tank-visual--interactive' : ''}${isProcess ? ' tank-visual--process' : ''} ${className}`.trim()}
      style={isProcess ? undefined : ({ '--tank-scale': scale } as React.CSSProperties)}
    >
      {!isProcess && !preview && (
      <div className="tank-visual-tooltip" role="tooltip">
        <strong>{tank.code} — {tank.name}</strong>
        {tank.liquidName && <span>{tank.liquidName}</span>}
        <span>
          {formatGal(tank.currentVolumeGal)} / {formatGal(tank.capacityGal)} gal
        </span>
        <span>{Math.round(tank.fillPercent)}%{tank.abv != null ? ` · ${tank.abv.toFixed(1)}% ABV` : ''}</span>
        <span className="tank-visual-tooltip-status">{STATUS_LABELS[tank.status]}</span>
      </div>
      )}

      {isProcess ? (
        <div className="tank-visual-svg-wrap equipment-visual-svg-wrap">
          <TankVesselArt
            uid={uid}
            shape={shape}
            fillPercent={tank.fillPercent}
            liquid={liquid}
            status={tank.status}
          />
        </div>
      ) : (
        <TankVesselArt
          uid={uid}
          shape={shape}
          fillPercent={tank.fillPercent}
          liquid={liquid}
          status={tank.status}
        />
      )}

      {isProcess ? (
        <ProcessEquipmentLabels data={tank} />
      ) : preview ? null : (
        <div className="tank-visual-labels">
          <span className="tank-visual-code">{tank.code}</span>
          <span className="tank-visual-name">{tank.name}</span>
          <span className="tank-visual-volume">
            {formatGal(tank.currentVolumeGal)} / {formatGal(tank.capacityGal)} gal
          </span>
          <span className="tank-visual-percent">{Math.round(tank.fillPercent)}%</span>
        </div>
      )}
    </Root>
  );
}
