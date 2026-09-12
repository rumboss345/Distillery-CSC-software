import { useId } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LiquidFill } from './LiquidFill';

export function StillVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const isColumn = data.equipmentType === 'column_still';

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
          {!isColumn && (
            <clipPath id={`${uid}-pot-clip`}>
              <ellipse cx="75" cy="130" rx="38" ry="28" />
            </clipPath>
          )}
        </defs>
        {isColumn ? (
          <g>
            <rect x="48" y="30" width="24" height="140" rx="4" fill={`url(#${uid}-copper)`} stroke="#3a2010" />
            <rect x="52" y="34" width="6" height="130" fill="#fff" opacity="0.12" />
            <ellipse cx="60" cy="30" rx="14" ry="6" fill="#e8a862" stroke="#3a2010" />
            <rect x="54" y="168" width="12" height="10" rx="2" fill="#5a6270" />
          </g>
        ) : (
          <g>
            <ellipse cx="75" cy="130" rx="42" ry="32" fill={`url(#${uid}-copper)`} stroke="#3a2010" strokeWidth="1.2" />
            <g clipPath={`url(#${uid}-pot-clip)`}>
              <LiquidFill x={37} y={0} width={76} height={0} fillPercent={data.fillPercent} status={data.status} innerHeight={56} bottomY={158} rx={8} />
            </g>
            <path d="M 62 98 Q 75 72 88 98 L 85 102 L 65 102 Z" fill={`url(#${uid}-copper)`} stroke="#3a2010" />
            <rect x="70" y="55" width="10" height="45" fill={`url(#${uid}-copper)`} stroke="#3a2010" />
            <ellipse cx="75" cy="55" rx="18" ry="8" fill="#e8a862" stroke="#3a2010" />
            <rect x="71" y="162" width="8" height="14" fill="#3a424c" />
          </g>
        )}
        <circle cx={isColumn ? 95 : 118} cy="42" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
