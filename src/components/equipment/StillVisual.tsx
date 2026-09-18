import { useId, useMemo } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LiquidFill } from './LiquidFill';

const COLUMN_STILL_LIQUID = {
  base: '#c43a3a',
  highlight: '#f07070',
  edge: '#8a2020',
} as const;

const COLUMN_VAPOR_DOTS = [
  { cx: 54, r: 2.2, delay: 0 },
  { cx: 60, r: 1.7, delay: 0.55 },
  { cx: 66, r: 2, delay: 1.1 },
  { cx: 57, r: 1.4, delay: 1.65 },
  { cx: 63, r: 1.8, delay: 2.05 },
] as const;

/** Pot still + lyne arm + condenser silhouette (reference-style side view). */
const POT_KETTLE =
  'M 16 168 H 84 L 86 158 Q 90 128 78 108 Q 68 96 52 96 Q 36 96 26 108 Q 16 128 16 158 Z';

const POT_HATCH = 'M 20 118 Q 14 118 14 124 Q 14 130 20 130 Q 26 130 26 124 Q 26 118 20 118 Z';

const POT_ONION = 'M 38 96 Q 52 84 66 96 Q 72 104 66 112 Q 52 120 38 112 Q 32 104 38 96 Z';

const POT_SWAN_NECK =
  'M 62 92 Q 62 68 68 50 Q 78 36 98 34 Q 118 34 128 46 Q 134 54 134 54';

const POT_LYNE_ARM =
  'M 134 54 L 158 56';

const POT_CONDENSER =
  'M 158 44 H 182 V 88 Q 186 98 188 108 Q 192 128 174 136 Q 156 136 160 108 Q 162 98 158 88 Z';


export function StillVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const isColumn = data.equipmentType === 'column_still';
  const isRunning = data.status === 'active';

  const columnFillPercent = useMemo(() => {
    if (!isColumn || !isRunning) return 0;
    if (data.fillPercent > 0) return Math.min(100, data.fillPercent);
    return 72;
  }, [isColumn, isRunning, data.fillPercent]);

  const columnInner = useMemo(() => {
    const bottomY = 162;
    const innerHeight = 124;
    const fillH = (columnFillPercent / 100) * innerHeight;
    return { bottomY, innerHeight, surfaceY: bottomY - fillH, fillH };
  }, [columnFillPercent]);

  return (
    <EquipmentVisualFrame {...props} svgWidth={isColumn ? 120 : 220} svgHeight={200}>
      <svg viewBox={`0 0 ${isColumn ? 120 : 220} 200`} width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-copper`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5a3010" />
            <stop offset="28%" stopColor="#b87333" />
            <stop offset="52%" stopColor="#e8a862" />
            <stop offset="100%" stopColor="#6b3a12" />
          </linearGradient>
          <linearGradient id={`${uid}-copper-v`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f0c080" />
            <stop offset="45%" stopColor="#c87937" />
            <stop offset="100%" stopColor="#5a3010" />
          </linearGradient>
          <linearGradient id={`${uid}-copper-shine`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fff8ee" stopOpacity="0.55" />
            <stop offset="35%" stopColor="#ffd9a8" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#fff8ee" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-column`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a3038" />
            <stop offset="40%" stopColor="#5a6270" />
            <stop offset="55%" stopColor="#9aa3b0" />
            <stop offset="100%" stopColor="#3a424c" />
          </linearGradient>
          {!isColumn && (
            <clipPath id={`${uid}-pot-clip`}>
              <path d="M 22 166 H 78 Q 86 156 84 132 Q 80 112 52 108 Q 24 112 22 132 Q 20 152 22 166 Z" />
            </clipPath>
          )}
          {isColumn && (
            <>
              <clipPath id={`${uid}-column-clip`}>
                <rect x="50" y="38" width="20" height="124" rx="3" />
              </clipPath>
              <linearGradient id={`${uid}-column-liq`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={COLUMN_STILL_LIQUID.edge} />
                <stop offset="35%" stopColor={COLUMN_STILL_LIQUID.base} />
                <stop offset="55%" stopColor={COLUMN_STILL_LIQUID.highlight} stopOpacity="0.9" />
                <stop offset="100%" stopColor={COLUMN_STILL_LIQUID.edge} />
              </linearGradient>
              <linearGradient id={`${uid}-column-surf`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffd4d4" stopOpacity="0.45" />
                <stop offset="100%" stopColor={COLUMN_STILL_LIQUID.base} stopOpacity="0" />
              </linearGradient>
            </>
          )}
        </defs>
        {isColumn ? (
          <g>
            <rect x="48" y="30" width="24" height="140" rx="4" fill={`url(#${uid}-column)`} stroke="#1a1f26" />
            {[50, 70, 90, 110, 130, 150].map((y) => (
              <line key={y} x1="46" y1={y} x2="74" y2={y} stroke="#1a1f26" strokeWidth="1.2" opacity="0.35" />
            ))}
            {isRunning && columnFillPercent > 0 && (
              <g clipPath={`url(#${uid}-column-clip)`}>
                <rect
                  className="column-still-liquid"
                  x="50"
                  y={columnInner.surfaceY}
                  width="20"
                  height={columnInner.fillH}
                  rx="3"
                  fill={`url(#${uid}-column-liq)`}
                />
                {columnFillPercent > 8 && (
                  <ellipse
                    className="column-still-liquid-surface"
                    cx="60"
                    cy={columnInner.surfaceY}
                    rx="8"
                    ry="3"
                    fill={`url(#${uid}-column-surf)`}
                  />
                )}
                <g className="column-still-vapor">
                  {COLUMN_VAPOR_DOTS.map((dot, index) => (
                    <circle
                      key={index}
                      className="column-still-vapor-dot"
                      cx={dot.cx}
                      cy={columnInner.bottomY - 8}
                      r={dot.r}
                      style={{ animationDelay: `${dot.delay}s` }}
                    />
                  ))}
                </g>
              </g>
            )}
            <rect x="52" y="34" width="6" height="130" fill="#fff" opacity="0.1" />
            <ellipse cx="60" cy="30" rx="14" ry="6" fill="#6b7380" stroke="#1a1f26" />
            <rect x="54" y="168" width="12" height="10" rx="2" fill="#5a6270" />
          </g>
        ) : (
          <g>
            {isRunning && (
              <g className="still-flame">
                <ellipse cx="50" cy="192" rx="16" ry="6" fill="#ff6600" opacity="0.25" />
                <path d="M 43 192 Q 50 168 57 192 Q 50 180 43 192" fill="#ff8800" opacity="0.9" />
                <path d="M 47 192 Q 50 176 53 192 Q 50 184 47 192" fill="#ffcc00" opacity="0.85" />
              </g>
            )}
            <path d={POT_KETTLE} fill={`url(#${uid}-copper-v)`} stroke="#3a2010" strokeWidth="1.1" strokeLinejoin="round" />
            <path d={POT_HATCH} fill="#8b4518" stroke="#3a2010" strokeWidth="0.7" />
            <path d={POT_ONION} fill={`url(#${uid}-copper)`} stroke="#3a2010" strokeWidth="0.9" />
            <path
              d={POT_SWAN_NECK}
              fill="none"
              stroke={`url(#${uid}-copper)`}
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={POT_LYNE_ARM}
              fill="none"
              stroke={`url(#${uid}-copper)`}
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path d={POT_CONDENSER} fill={`url(#${uid}-copper-v)`} stroke="#3a2010" strokeWidth="1.1" strokeLinejoin="round" />
            <rect x="186" y="118" width="18" height="8" rx="2" fill={`url(#${uid}-copper)`} stroke="#3a2010" strokeWidth="0.8" />
            <g clipPath={`url(#${uid}-pot-clip)`}>
              <LiquidFill x={18} y={0} width={68} height={0} fillPercent={data.fillPercent} status={data.status} innerHeight={52} bottomY={164} rx={6} />
            </g>
            <path
              d="M 24 130 Q 22 108 30 102"
              fill="none"
              stroke={`url(#${uid}-copper-shine)`}
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.85"
            />
            <path
              d="M 164 52 V 118"
              fill="none"
              stroke={`url(#${uid}-copper-shine)`}
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              d={POT_SWAN_NECK}
              fill="none"
              stroke="#fff8ee"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.35"
            />
            <rect x="18" y="168" width="68" height="4" rx="1" fill="#3a2010" opacity="0.35" />
          </g>
        )}
        <circle cx={isColumn ? 95 : 205} cy="42" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
