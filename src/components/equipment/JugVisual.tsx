import { useId, useMemo } from 'react';
import type { TankVisualProps, TankVisualStatus } from './tank-visual.types';
import { ProcessEquipmentLabels } from './ProcessEquipmentLabels';
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

/** Glass jug. Fill, gallons, and ABV follow the same ledger as a holding tank. */
export function JugVisual({
  tank,
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
  const fillHeight = useMemo(() => (tank.fillPercent / 100) * 112, [tank.fillPercent]);

  const tooltip = [
    `${tank.code} — ${tank.name}`,
    tank.liquidName,
    `${formatGal(tank.currentVolumeGal)} / ${formatGal(tank.capacityGal)} gal`,
    `${Math.round(tank.fillPercent)}%`,
    tank.abv != null ? `${tank.abv.toFixed(1)}% ABV` : null,
    STATUS_LABELS[tank.status],
  ].filter(Boolean).join('\n');

  const Root = preview ? 'div' : 'button';

  const svg = (
    <svg className="tank-visual-svg" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-glass`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8ea4b8" />
          <stop offset="22%" stopColor="#e7eef5" />
          <stop offset="48%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#c5d2df" />
          <stop offset="100%" stopColor="#6d8498" />
        </linearGradient>
        <linearGradient id={`${uid}-liquid`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={liquid.edge} />
          <stop offset="35%" stopColor={liquid.base} />
          <stop offset="58%" stopColor={liquid.highlight} stopOpacity="0.9" />
          <stop offset="100%" stopColor={liquid.edge} />
        </linearGradient>
        <linearGradient id={`${uid}-surface`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor={liquid.base} stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${uid}-body`}>
          <path d="M68 34 H92 V58 C112 64 126 82 126 110 C126 152 108 170 80 170 C52 170 34 152 34 110 C34 82 48 64 68 58 Z" />
        </clipPath>
        <filter id={`${uid}-shadow`} x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter={`url(#${uid}-shadow)`}>
        <path
          d="M122 92 C148 90 150 136 122 138"
          fill="none"
          stroke={`url(#${uid}-glass)`}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M68 34 H92 V58 C112 64 126 82 126 110 C126 152 108 170 80 170 C52 170 34 152 34 110 C34 82 48 64 68 58 Z"
          fill={`url(#${uid}-glass)`}
          fillOpacity="0.55"
          stroke="#243140"
          strokeWidth="1.4"
        />
        <ellipse cx="80" cy="34" rx="16" ry="5" fill="#f4f7fb" stroke="#243140" strokeWidth="1.2" />
        <g clipPath={`url(#${uid}-body)`}>
          <rect
            className="tank-visual-liquid"
            x="32"
            y={170 - fillHeight}
            width="96"
            height={fillHeight}
            fill={`url(#${uid}-liquid)`}
            opacity={tank.fillPercent > 0 ? 0.9 : 0}
          />
          {tank.fillPercent > 2 && (
            <ellipse
              cx="80"
              cy={170 - fillHeight}
              rx="36"
              ry="5"
              fill={`url(#${uid}-surface)`}
            />
          )}
        </g>
        <path d="M74 40 C70 70 66 90 70 120" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      </g>
      <circle cx="128" cy="48" r="5" className={`tank-visual-status-dot tank-visual-status-dot--${tank.status}`} />
    </svg>
  );

  return (
    <Root
      {...(preview ? {} : {
        type: 'button' as const,
        onClick,
        title: tooltip,
        'aria-label': `${tank.name}, jug, ${Math.round(tank.fillPercent)} percent full`,
        'aria-pressed': selected,
      })}
      className={`tank-visual${selected ? ' tank-visual--selected' : ''}${onClick ? ' tank-visual--interactive' : ''}${isProcess ? ' tank-visual--process' : ''} ${className}`.trim()}
      style={isProcess ? undefined : ({ '--tank-scale': scale } as React.CSSProperties)}
    >
      {!isProcess && !preview && (
        <div className="tank-visual-tooltip" role="tooltip">
          <strong>{tank.code} — {tank.name}</strong>
          {tank.liquidName && <span>{tank.liquidName}</span>}
          <span>{formatGal(tank.currentVolumeGal)} / {formatGal(tank.capacityGal)} gal</span>
          <span>{Math.round(tank.fillPercent)}%{tank.abv != null ? ` · ${tank.abv.toFixed(1)}% ABV` : ''}</span>
          <span className="tank-visual-tooltip-status">{STATUS_LABELS[tank.status]}</span>
        </div>
      )}
      {isProcess ? (
        <div className="tank-visual-svg-wrap equipment-visual-svg-wrap">{svg}</div>
      ) : svg}
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
