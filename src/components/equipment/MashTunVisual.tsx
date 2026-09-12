import { useId } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LiquidFill } from './LiquidFill';

/** Stainless mash/cook tank with domed lid — matches production floor reference style. */
export function MashTunVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');

  return (
    <EquipmentVisualFrame {...props} svgWidth={150} svgHeight={190}>
      <svg viewBox="0 0 150 190" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-steel`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a3038" />
            <stop offset="42%" stopColor="#c8ced8" />
            <stop offset="55%" stopColor="#eef2f7" />
            <stop offset="100%" stopColor="#3a424c" />
          </linearGradient>
          <linearGradient id={`${uid}-dome`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a1f26" />
            <stop offset="40%" stopColor="#2a3038" />
            <stop offset="100%" stopColor="#0d1117" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <rect x="30" y="58" width="90" height="95" rx="6" />
          </clipPath>
        </defs>

        <rect x="34" y="150" width="8" height="18" fill="#3a424c" />
        <rect x="108" y="150" width="8" height="18" fill="#3a424c" />

        {/* Body */}
        <rect x="28" y="56" width="94" height="98" rx="8" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1.2" />

        {/* Black domed lid */}
        <ellipse cx="75" cy="56" rx="48" ry="14" fill={`url(#${uid}-dome)`} stroke="#1a1f26" strokeWidth="1" />
        <rect x="68" y="44" width="14" height="8" rx="3" fill="#5a6270" stroke="#2a3038" />

        <g clipPath={`url(#${uid}-clip)`}>
          <LiquidFill
            x={30}
            y={0}
            width={90}
            height={0}
            fillPercent={data.fillPercent}
            status={data.status}
            innerHeight={95}
            bottomY={153}
            rx={6}
          />
        </g>

        <rect x="32" y="62" width="10" height="85" rx="4" fill="#fff" opacity="0.08" />
        <circle cx="122" cy="64" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
