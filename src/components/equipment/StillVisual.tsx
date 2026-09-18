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
