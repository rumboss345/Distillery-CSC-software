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

export function TankVisual({
  tank,
  selected = false,
  size = 'md',
  labelStyle = 'default',
  onClick,
  className = '',
}: TankVisualProps) {
  const uid = useId().replace(/:/g, '');
  const scale = SIZE_MAP[size];
  const liquid = LIQUID_COLORS[tank.status];
  const isProcess = labelStyle === 'process';

  const fillHeight = useMemo(() => {
    const innerH = 118;
    return (tank.fillPercent / 100) * innerH;
  }, [tank.fillPercent]);

  const tooltip = [
    `${tank.code} — ${tank.name}`,
    tank.liquidName,
    `${formatGal(tank.currentVolumeGal)} / ${formatGal(tank.capacityGal)} gal`,
    `${Math.round(tank.fillPercent)}%`,
    tank.abv != null ? `${tank.abv.toFixed(1)}% ABV` : null,
    STATUS_LABELS[tank.status],
  ].filter(Boolean).join('\n');

  return (
    <button
      type="button"
      className={`tank-visual${selected ? ' tank-visual--selected' : ''}${onClick ? ' tank-visual--interactive' : ''}${isProcess ? ' tank-visual--process' : ''} ${className}`.trim()}
      style={{ '--tank-scale': scale } as React.CSSProperties}
      onClick={onClick}
      title={tooltip}
      aria-label={`${tank.name}, ${Math.round(tank.fillPercent)} percent full`}
      aria-pressed={selected}
    >
      {!isProcess && (
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

      <svg
        className="tank-visual-svg"
        viewBox="0 0 160 200"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id={`${uid}-steel`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a3038" />
            <stop offset="18%" stopColor="#6b7380" />
            <stop offset="42%" stopColor="#c8ced8" />
            <stop offset="55%" stopColor="#eef2f7" />
            <stop offset="68%" stopColor="#9aa3b0" />
            <stop offset="100%" stopColor="#3a424c" />
          </linearGradient>
          <linearGradient id={`${uid}-steel-v`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#dfe4eb" />
            <stop offset="100%" stopColor="#6b7380" />
          </linearGradient>
          <linearGradient id={`${uid}-dome`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e8edf3" />
            <stop offset="50%" stopColor="#9aa3b0" />
            <stop offset="100%" stopColor="#4a525c" />
          </linearGradient>
          <linearGradient id={`${uid}-liquid`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={liquid.edge} />
            <stop offset="30%" stopColor={liquid.base} />
            <stop offset="55%" stopColor={liquid.highlight} stopOpacity="0.85" />
            <stop offset="100%" stopColor={liquid.edge} />
          </linearGradient>
          <linearGradient id={`${uid}-liquid-surface`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
            <stop offset="100%" stopColor={liquid.base} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}-body-clip`}>
            <rect x="36" y="52" width="88" height="118" rx="4" />
          </clipPath>
          <filter id={`${uid}-shadow`} x="-20%" y="-10%" width="140%" height="130%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Support legs */}
        <rect x="44" y="168" width="8" height="22" rx="1" fill="#3a424c" />
        <rect x="108" y="168" width="8" height="22" rx="1" fill="#3a424c" />
        <rect x="40" y="188" width="80" height="4" rx="1" fill="#2a3038" />

        {/* Tank body shell */}
        <g filter={`url(#${uid}-shadow)`}>
          <rect x="34" y="50" width="92" height="120" rx="6" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1.2" />
          {/* Conical dome top */}
          <ellipse cx="80" cy="50" rx="46" ry="14" fill={`url(#${uid}-dome)`} stroke="#1a1f26" strokeWidth="1" />
          <rect x="36" y="48" width="88" height="8" fill={`url(#${uid}-steel-v)`} opacity="0.5" />

          {/* Liquid fill (ledger-driven height) */}
          <g clipPath={`url(#${uid}-body-clip)`}>
            <rect
              className="tank-visual-liquid"
              x="36"
              y={170 - fillHeight}
              width="88"
              height={fillHeight}
              fill={`url(#${uid}-liquid)`}
              opacity={tank.fillPercent > 0 ? 0.88 : 0}
            />
            {tank.fillPercent > 2 && (
              <>
                <ellipse
                  className="tank-visual-liquid-surface"
                  cx="80"
                  cy={170 - fillHeight}
                  rx="42"
                  ry="5"
                  fill={`url(#${uid}-liquid-surface)`}
                />
                <ellipse
                  cx="80"
                  cy={170 - fillHeight}
                  rx="42"
                  ry="5"
                  fill="none"
                  stroke={liquid.highlight}
                  strokeWidth="0.6"
                  opacity="0.5"
                />
              </>
            )}
          </g>

          {/* Glass/shell highlight */}
          <rect x="38" y="54" width="12" height="110" rx="4" fill="#ffffff" opacity="0.08" />
          <rect x="34" y="50" width="92" height="120" rx="6" fill="none" stroke="#eef2f7" strokeWidth="0.6" opacity="0.25" />
        </g>

        {/* Valve / outlet */}
        <rect x="74" y="168" width="12" height="8" rx="2" fill="#5a6270" stroke="#2a3038" />
        <circle cx="80" cy="178" r="3" fill="#3a424c" />

        {/* Status indicator */}
        <circle
          cx="128"
          cy="58"
          r="5"
          className={`tank-visual-status-dot tank-visual-status-dot--${tank.status}`}
        />
      </svg>

      {isProcess ? (
        <ProcessEquipmentLabels data={tank} />
      ) : (
        <div className="tank-visual-labels">
          <span className="tank-visual-code">{tank.code}</span>
          <span className="tank-visual-name">{tank.name}</span>
          <span className="tank-visual-volume">
            {formatGal(tank.currentVolumeGal)} / {formatGal(tank.capacityGal)} gal
          </span>
          <span className="tank-visual-percent">{Math.round(tank.fillPercent)}%</span>
        </div>
      )}
    </button>
  );
}
