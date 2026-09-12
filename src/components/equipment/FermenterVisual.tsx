import { useId, useMemo } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LIQUID_COLORS } from './equipment-visual-shared';

/** Conical-bottom fermenter — cylinder + tapered cone with ledger-driven fill. */
export function FermenterVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');

  const bottomY = 172;
  const topY = 52;
  const innerHeight = bottomY - topY;
  const liquid = LIQUID_COLORS[data.status];
  const fillH = (data.fillPercent / 100) * innerHeight;
  const surfaceY = bottomY - fillH;

  const vesselPath = useMemo(
    () => 'M 46 55 L 104 55 L 104 122 L 75 172 L 46 122 Z',
    [],
  );

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
          <linearGradient id={`${uid}-liq`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={liquid.edge} />
            <stop offset="35%" stopColor={liquid.base} />
            <stop offset="55%" stopColor={liquid.highlight} stopOpacity="0.85" />
            <stop offset="100%" stopColor={liquid.edge} />
          </linearGradient>
          <linearGradient id={`${uid}-surf`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="100%" stopColor={liquid.base} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <path d={vesselPath} />
          </clipPath>
        </defs>

        {/* Support legs on cylinder skirt */}
        <rect x="42" y="118" width="7" height="22" rx="1" fill="#3a424c" />
        <rect x="101" y="118" width="7" height="22" rx="1" fill="#3a424c" />
        <rect x="38" y="138" width="74" height="5" rx="1" fill="#2a3038" />

        {/* Top manway / lid */}
        <ellipse cx="75" cy="52" rx="32" ry="9" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1" />
        <ellipse cx="75" cy="50" rx="22" ry="5" fill="#eef2f7" opacity="0.35" />

        {/* Vessel shell — cylinder + cone */}
        <path
          d={vesselPath}
          fill={`url(#${uid}-steel)`}
          stroke="#1a1f26"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />

        {/* Liquid fill clipped to vessel interior */}
        {data.fillPercent > 0 && (
          <g clipPath={`url(#${uid}-clip)`}>
            <rect
              className="equipment-liquid-fill"
              x="44"
              y={surfaceY}
              width="62"
              height={fillH}
              fill={`url(#${uid}-liq)`}
              opacity="0.9"
            />
            {data.fillPercent > 4 && (
              <ellipse
                className="equipment-liquid-surface"
                cx="75"
                cy={surfaceY}
                rx={surfaceY < 122 ? 29 : 8 + (122 - surfaceY) * 0.35}
                ry="4.5"
                fill={`url(#${uid}-surf)`}
              />
            )}
          </g>
        )}

        {/* Cone seam ring */}
        <line x1="46" y1="122" x2="104" y2="122" stroke="#1a1f26" strokeWidth="0.8" opacity="0.5" />

        {/* Racking valve at cone tip */}
        <rect x="71" y="170" width="8" height="10" rx="2" fill="#5a6270" stroke="#2a3038" />
        <circle cx="75" cy="182" r="3" fill="#3a424c" />

        {/* Shell highlight on cylinder */}
        <path d="M 50 58 L 50 118" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.07" />

        <circle cx="118" cy="58" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
