import { useId, useMemo } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LIQUID_COLORS } from './equipment-visual-shared';

/** Wooden open-top fermenter with conical bottom — ledger-driven fill. */
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

  const slats = useMemo(() => {
    const lines = [];
    for (let x = 50; x <= 100; x += 7) {
      lines.push(<line key={x} x1={x} y1="56" x2={x} y2="120" stroke="#3d2818" strokeWidth="0.7" opacity="0.45" />);
    }
    return lines;
  }, []);

  return (
    <EquipmentVisualFrame {...props} svgWidth={150} svgHeight={200}>
      <svg viewBox="0 0 150 200" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-wood`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5c3d24" />
            <stop offset="25%" stopColor="#a67c52" />
            <stop offset="50%" stopColor="#c9a06c" />
            <stop offset="75%" stopColor="#8b5e3c" />
            <stop offset="100%" stopColor="#4a3020" />
          </linearGradient>
          <linearGradient id={`${uid}-wood-top`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d4b896" />
            <stop offset="100%" stopColor="#7a5438" />
          </linearGradient>
          <linearGradient id={`${uid}-liq`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={liquid.edge} />
            <stop offset="35%" stopColor={liquid.base} />
            <stop offset="55%" stopColor={liquid.highlight} stopOpacity="0.85" />
            <stop offset="100%" stopColor={liquid.edge} />
          </linearGradient>
          <linearGradient id={`${uid}-surf`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="100%" stopColor={liquid.base} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <path d={vesselPath} />
          </clipPath>
        </defs>

        {/* Wooden lattice top frame */}
        <rect x="38" y="42" width="74" height="6" rx="1" fill="#3d2818" />
        <rect x="42" y="36" width="4" height="18" fill="#5c3d24" />
        <rect x="56" y="36" width="4" height="18" fill="#5c3d24" />
        <rect x="70" y="36" width="4" height="18" fill="#5c3d24" />
        <rect x="84" y="36" width="4" height="18" fill="#5c3d24" />
        <rect x="98" y="36" width="4" height="18" fill="#5c3d24" />

        {/* Support legs */}
        <rect x="42" y="118" width="7" height="22" rx="1" fill="#3d2818" />
        <rect x="101" y="118" width="7" height="22" rx="1" fill="#3d2818" />
        <rect x="38" y="138" width="74" height="5" rx="1" fill="#2a2018" />

        {/* Vessel shell — wood slats */}
        <path
          d={vesselPath}
          fill={`url(#${uid}-wood)`}
          stroke="#2a2018"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <g clipPath={`url(#${uid}-clip)`}>{slats}</g>

        {/* Liquid fill */}
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

        {/* Top rim */}
        <ellipse cx="75" cy="55" rx="30" ry="5" fill={`url(#${uid}-wood-top)`} stroke="#2a2018" strokeWidth="0.8" />

        <line x1="46" y1="122" x2="104" y2="122" stroke="#2a2018" strokeWidth="0.8" opacity="0.5" />

        {/* Racking valve */}
        <rect x="71" y="170" width="8" height="10" rx="2" fill="#5a6270" stroke="#2a3038" />
        <circle cx="75" cy="182" r="3" fill="#3a424c" />

        <circle cx="118" cy="58" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
