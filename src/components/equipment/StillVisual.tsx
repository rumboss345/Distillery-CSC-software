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
  { cx: 56, r: 2.2, delay: 0 },
  { cx: 62, r: 1.7, delay: 0.55 },
  { cx: 68, r: 2, delay: 1.1 },
  { cx: 59, r: 1.4, delay: 1.65 },
  { cx: 65, r: 1.8, delay: 2.05 },
] as const;

const COLUMN_PLATES = [48, 68, 88, 108, 128] as const;

/** Copper pot still, or a plated column still with a reboiler. */
export function StillVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const isColumn = (data.icon || data.equipmentType) === 'column_still';
  const isRunning = data.status === 'active';

  const columnFillPercent = useMemo(() => {
    if (!isColumn || !isRunning) return 0;
    if (data.fillPercent > 0) return Math.min(100, data.fillPercent);
    return 72;
  }, [isColumn, isRunning, data.fillPercent]);

  const columnInner = useMemo(() => {
    const bottomY = 148;
    const innerHeight = 110;
    const fillH = (columnFillPercent / 100) * innerHeight;
    return { bottomY, innerHeight, surfaceY: bottomY - fillH, fillH };
  }, [columnFillPercent]);

  return (
    <EquipmentVisualFrame {...props} svgWidth={isColumn ? 120 : 150} svgHeight={200}>
      <svg viewBox={`0 0 ${isColumn ? 120 : 150} 200`} width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-copper`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4a240c" />
            <stop offset="22%" stopColor="#a15a22" />
            <stop offset="42%" stopColor="#f0c07a" />
            <stop offset="58%" stopColor="#c47a38" />
            <stop offset="100%" stopColor="#5c2e10" />
          </linearGradient>
          <linearGradient id={`${uid}-copper-head`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f6d7a8" />
            <stop offset="55%" stopColor="#c4843a" />
            <stop offset="100%" stopColor="#6a3412" />
          </linearGradient>
          <linearGradient id={`${uid}-steel`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1b2128" />
            <stop offset="18%" stopColor="#5e6874" />
            <stop offset="40%" stopColor="#c5ced8" />
            <stop offset="52%" stopColor="#f4f7fb" />
            <stop offset="68%" stopColor="#8e99a6" />
            <stop offset="100%" stopColor="#2a313a" />
          </linearGradient>
          <linearGradient id={`${uid}-head`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f7f9fc" />
            <stop offset="50%" stopColor="#b7c0cb" />
            <stop offset="100%" stopColor="#5c6672" />
          </linearGradient>
          <filter id={`${uid}-shadow`} x="-20%" y="-8%" width="140%" height="124%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#000" floodOpacity="0.38" />
          </filter>
          {!isColumn && (
            <clipPath id={`${uid}-pot-clip`}>
              <ellipse cx="58" cy="136" rx="30" ry="24" />
            </clipPath>
          )}
          {isColumn && (
            <>
              <clipPath id={`${uid}-column-clip`}>
                <rect x="48" y="38" width="24" height="110" rx="2" />
              </clipPath>
              <clipPath id={`${uid}-boiler-clip`}>
                <path d="M 24 156 H 96 V 168 C 96 182 24 182 24 168 Z" />
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
          <g filter={`url(#${uid}-shadow)`}>
            <path d="M 28 172 L 18 192 H 34 Z" fill="#3a424c" />
            <path d="M 92 172 L 86 192 H 102 Z" fill="#3a424c" />
            <path d="M 22 150 H 98 V 168 C 98 184 22 184 22 168 Z" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1.1" />
            <ellipse cx="60" cy="150" rx="38" ry="10" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="0.8" />
            {isRunning && (
              <g clipPath={`url(#${uid}-boiler-clip)`}>
                <rect x="22" y="162" width="76" height="22" fill={`url(#${uid}-column-liq)`} opacity="0.9" />
                <ellipse cx="60" cy="162" rx="28" ry="5" fill={`url(#${uid}-column-surf)`} />
              </g>
            )}
            <rect x="46" y="34" width="28" height="118" rx="3" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1.1" />
            {isRunning && columnFillPercent > 0 && (
              <g clipPath={`url(#${uid}-column-clip)`}>
                <rect
                  className="column-still-liquid"
                  x="48"
                  y={columnInner.surfaceY}
                  width="24"
                  height={columnInner.fillH}
                  fill={`url(#${uid}-column-liq)`}
                />
                {columnFillPercent > 8 && (
                  <ellipse
                    className="column-still-liquid-surface"
                    cx="60"
                    cy={columnInner.surfaceY}
                    rx="10"
                    ry="3.2"
                    fill={`url(#${uid}-column-surf)`}
                  />
                )}
                <g className="column-still-vapor">
                  {COLUMN_VAPOR_DOTS.map((dot, index) => (
                    <circle
                      key={index}
                      className="column-still-vapor-dot"
                      cx={dot.cx}
                      cy={columnInner.bottomY - 10}
                      r={dot.r}
                      style={{ animationDelay: `${dot.delay}s` }}
                    />
                  ))}
                </g>
              </g>
            )}
            {COLUMN_PLATES.map((y) => (
              <g key={y}>
                <rect x="40" y={y} width="40" height="5" rx="1.5" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="0.6" />
              </g>
            ))}
            <rect x="56" y="40" width="5" height="108" fill="#fff" opacity="0.16" />
            <ellipse cx="60" cy="34" rx="18" ry="7" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="0.9" />
            <rect x="54" y="18" width="12" height="12" rx="2" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="0.7" />
            <path d="M 78 36 H 98 V 42 H 92 V 70 H 86 V 42 H 78 Z" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="0.7" />
            <rect x="56" y="176" width="8" height="8" rx="1.5" fill="#5a6270" stroke="#2a3038" />
          </g>
        ) : (
          <g filter={`url(#${uid}-shadow)`}>
            {isRunning && (
              <g className="still-flame">
                <ellipse cx="58" cy="186" rx="16" ry="5" fill="#ff6600" opacity="0.28" />
                <path d="M 50 186 Q 58 162 66 186 Q 58 174 50 186" fill="#ff8800" opacity="0.9" />
                <path d="M 54 186 Q 58 170 62 186 Q 58 178 54 186" fill="#ffcc00" opacity="0.85" />
              </g>
            )}
            <path d="M 36 154 L 24 190 H 40 Z" fill="#3a2414" />
            <path d="M 80 154 L 76 190 H 92 Z" fill="#3a2414" />
            <ellipse cx="58" cy="140" rx="36" ry="30" fill={`url(#${uid}-copper)`} stroke="#3a2010" strokeWidth="1.15" />
            <ellipse cx="58" cy="118" rx="22" ry="8" fill={`url(#${uid}-copper-head)`} stroke="#3a2010" strokeWidth="0.7" />
            <path d="M 42 116 C 36 92 46 78 58 74 C 70 78 80 92 74 116 Z" fill={`url(#${uid}-copper)`} stroke="#3a2010" strokeWidth="1" />
            <path
              d="M 54 76 C 54 52 86 40 102 54 C 112 64 110 78 106 90 L 114 92 C 120 76 122 58 108 46 C 88 28 50 42 50 76 Z"
              fill={`url(#${uid}-copper)`}
              stroke="#3a2010"
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <rect x="100" y="84" width="18" height="58" rx="4" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="0.9" />
            {[96, 108, 120, 132].map((y) => (
              <path key={y} d={`M 102 ${y} Q 109 ${y + 4} 116 ${y}`} fill="none" stroke="#1a1f26" strokeWidth="0.8" opacity="0.55" />
            ))}
            <rect x="106" y="140" width="6" height="10" rx="1" fill="#5a6270" />
            <g clipPath={`url(#${uid}-pot-clip)`}>
              <LiquidFill x={26} y={0} width={64} height={0} fillPercent={data.fillPercent} status={data.status} innerHeight={44} bottomY={160} rx={8} />
            </g>
            <ellipse cx="46" cy="128" rx="6" ry="16" fill="#fff" opacity="0.16" />
            <rect x="54" y="168" width="8" height="8" rx="1.5" fill="#5a4030" stroke="#3a2010" />
          </g>
        )}
        <circle cx={isColumn ? 108 : 132} cy="28" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
