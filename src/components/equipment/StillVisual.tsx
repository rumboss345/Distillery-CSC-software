import { useId } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LiquidFill } from './LiquidFill';

export function StillVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const isColumn = data.equipmentType === 'column_still';
  const isRunning = data.status === 'active';

  return (
    <EquipmentVisualFrame {...props} svgWidth={isColumn ? 120 : 150} svgHeight={200}>
      <svg viewBox={`0 0 ${isColumn ? 120 : 150} 200`} width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-copper`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5a3010" />
            <stop offset="30%" stopColor="#b87333" />
            <stop offset="50%" stopColor="#e8a862" />
            <stop offset="100%" stopColor="#6b3a12" />
          </linearGradient>
          <linearGradient id={`${uid}-column`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a3038" />
            <stop offset="40%" stopColor="#5a6270" />
            <stop offset="55%" stopColor="#9aa3b0" />
            <stop offset="100%" stopColor="#3a424c" />
          </linearGradient>
          {!isColumn && (
            <clipPath id={`${uid}-pot-clip`}>
              <ellipse cx="75" cy="130" rx="38" ry="28" />
            </clipPath>
          )}
        </defs>
        {isColumn ? (
          <g>
            <rect x="48" y="30" width="24" height="140" rx="4" fill={`url(#${uid}-column)`} stroke="#1a1f26" />
            {[50, 70, 90, 110, 130, 150].map((y) => (
              <line key={y} x1="46" y1={y} x2="74" y2={y} stroke="#1a1f26" strokeWidth="1.2" opacity="0.35" />
            ))}
            <rect x="52" y="34" width="6" height="130" fill="#fff" opacity="0.1" />
            <ellipse cx="60" cy="30" rx="14" ry="6" fill="#6b7380" stroke="#1a1f26" />
            <rect x="54" y="168" width="12" height="10" rx="2" fill="#5a6270" />
          </g>
        ) : (
          <g>
            {isRunning && (
              <g className="still-flame">
                <ellipse cx="75" cy="192" rx="16" ry="6" fill="#ff6600" opacity="0.25" />
                <path d="M 68 192 Q 75 168 82 192 Q 75 180 68 192" fill="#ff8800" opacity="0.9" />
                <path d="M 72 192 Q 75 176 78 192 Q 75 184 72 192" fill="#ffcc00" opacity="0.85" />
              </g>
            )}
            <ellipse cx="75" cy="130" rx="42" ry="32" fill={`url(#${uid}-copper)`} stroke="#3a2010" strokeWidth="1.2" />
            <g clipPath={`url(#${uid}-pot-clip)`}>
              <LiquidFill x={37} y={0} width={76} height={0} fillPercent={data.fillPercent} status={data.status} innerHeight={56} bottomY={158} rx={8} />
            </g>
            <path d="M 62 98 Q 75 72 88 98 L 85 102 L 65 102 Z" fill={`url(#${uid}-column)`} stroke="#1a1f26" strokeWidth="0.8" />
            <rect x="70" y="55" width="10" height="45" fill={`url(#${uid}-column)`} stroke="#1a1f26" strokeWidth="0.6" />
            {[62, 78, 92].map((y) => (
              <line key={y} x1="68" y1={y} x2="82" y2={y} stroke="#1a1f26" strokeWidth="1" opacity="0.4" />
            ))}
            <ellipse cx="75" cy="55" rx="18" ry="8" fill="#6b7380" stroke="#1a1f26" />
            <rect x="71" y="162" width="8" height="14" fill="#3a424c" />
          </g>
        )}
        <circle cx={isColumn ? 95 : 118} cy="42" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
