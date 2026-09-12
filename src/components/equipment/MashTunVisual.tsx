import { useId } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LiquidFill } from './LiquidFill';

export function MashTunVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');

  return (
    <EquipmentVisualFrame {...props} svgWidth={170} svgHeight={160}>
      <svg viewBox="0 0 170 160" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-copper`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4a3528" />
            <stop offset="40%" stopColor="#8b7355" />
            <stop offset="55%" stopColor="#c4a882" />
            <stop offset="100%" stopColor="#5a4030" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <rect x="25" y="55" width="120" height="70" rx="8" />
          </clipPath>
        </defs>
        <rect x="20" y="125" width="8" height="20" fill="#3a424c" />
        <rect x="142" y="125" width="8" height="20" fill="#3a424c" />
        <rect x="25" y="50" width="120" height="75" rx="10" fill={`url(#${uid}-copper)`} stroke="#2a2018" strokeWidth="1.2" />
        <ellipse cx="85" cy="50" rx="62" ry="12" fill="#c4a882" stroke="#2a2018" />
        <g clipPath={`url(#${uid}-clip)`}>
          <LiquidFill x={25} y={0} width={120} height={0} fillPercent={data.fillPercent} status={data.status} innerHeight={70} bottomY={125} rx={6} />
        </g>
        <rect x="30" y="58" width="10" height="55" rx="4" fill="#fff" opacity="0.08" />
        <circle cx="148" cy="58" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
