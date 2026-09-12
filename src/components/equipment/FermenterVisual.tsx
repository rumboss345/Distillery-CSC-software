import { useId } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LiquidFill } from './LiquidFill';

export function FermenterVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');

  return (
    <EquipmentVisualFrame {...props} svgWidth={150} svgHeight={200}>
      <svg viewBox="0 0 150 200" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-steel`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a3038" />
            <stop offset="45%" stopColor="#c8ced8" />
            <stop offset="55%" stopColor="#eef2f7" />
            <stop offset="100%" stopColor="#3a424c" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <path d="M 45 55 L 105 55 L 95 165 L 55 165 Z" />
          </clipPath>
        </defs>
        <g>
          <rect x="40" y="165" width="6" height="18" fill="#3a424c" />
          <rect x="104" y="165" width="6" height="18" fill="#3a424c" />
          <path d="M 38 52 Q 75 38 112 52 L 105 55 L 45 55 Z" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
          <path d="M 45 55 L 105 55 L 95 165 L 55 165 Z" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1.2" />
          <g clipPath={`url(#${uid}-clip)`}>
            <LiquidFill x={55} y={0} width={40} height={0} fillPercent={data.fillPercent} status={data.status} innerHeight={110} bottomY={165} />
          </g>
          <rect x="48" y="60" width="8" height="95" rx="3" fill="#fff" opacity="0.07" />
        </g>
        <circle cx="118" cy="58" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
