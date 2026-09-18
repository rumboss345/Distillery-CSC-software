import { useId, useMemo } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LiquidFill } from './LiquidFill';
import {
  POT_CONDENSER,
  POT_CONDENSER_OUTLET,
  POT_FLAME_CX,
  POT_KETTLE_BODY,
  POT_LIQUID_BOUNDS,
  POT_LIQUID_CLIP,
  POT_LYNE_ARM,
  POT_MANWAY,
  POT_ONION,
  POT_STILL_VIEW,
  POT_SWAN_NECK,
} from './pot-still-silhouette';

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
    <EquipmentVisualFrame
      {...props}
      svgWidth={isColumn ? 120 : POT_STILL_VIEW.width}
      svgHeight={POT_STILL_VIEW.height}
    >
      <svg
        viewBox={`0 0 ${isColumn ? 120 : POT_STILL_VIEW.width} ${POT_STILL_VIEW.height}`}
        width="100%"
        height="100%"
        aria-hidden
      >
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
            <stop offset="0%" stopColor="#fff8ee" stopOpacity="0.6" />
            <stop offset="40%" stopColor="#ffd9a8" stopOpacity="0.12" />
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
              <path d={POT_LIQUID_CLIP} />
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
                <ellipse cx={POT_FLAME_CX} cy="192" rx="16" ry="6" fill="#ff6600" opacity="0.25" />
                <path
                  d={`M ${POT_FLAME_CX - 7} 192 Q ${POT_FLAME_CX} 168 ${POT_FLAME_CX + 7} 192 Q ${POT_FLAME_CX} 180 ${POT_FLAME_CX - 7} 192`}
                  fill="#ff8800"
                  opacity="0.9"
                />
                <path
                  d={`M ${POT_FLAME_CX - 3} 192 Q ${POT_FLAME_CX} 176 ${POT_FLAME_CX + 3} 192 Q ${POT_FLAME_CX} 184 ${POT_FLAME_CX - 3} 192`}
                  fill="#ffcc00"
                  opacity="0.85"
                />
              </g>
            )}
            <path
              d={POT_CONDENSER}
              fill={`url(#${uid}-copper-v)`}
              stroke="#3a2010"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
            <rect
              x={POT_CONDENSER_OUTLET.x}
              y={POT_CONDENSER_OUTLET.y}
              width={POT_CONDENSER_OUTLET.width}
              height={POT_CONDENSER_OUTLET.height}
              rx="2"
              fill={`url(#${uid}-copper)`}
              stroke="#3a2010"
              strokeWidth="0.8"
            />
            <path
              d={POT_SWAN_NECK}
              fill="none"
              stroke={`url(#${uid}-copper)`}
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={POT_LYNE_ARM}
              fill="none"
              stroke={`url(#${uid}-copper)`}
              strokeWidth="7.5"
              strokeLinecap="round"
            />
            <circle cx="138" cy="58" r="4.2" fill="#c87937" stroke="#3a2010" strokeWidth="0.6" />
            <circle cx="162" cy="62" r="3.8" fill="#c87937" stroke="#3a2010" strokeWidth="0.6" />
            <path
              d={POT_KETTLE_BODY}
              fill={`url(#${uid}-copper-v)`}
              stroke="#3a2010"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
            <path d={POT_MANWAY} fill="#8b4518" stroke="#3a2010" strokeWidth="0.65" />
            <path d={POT_ONION} fill={`url(#${uid}-copper)`} stroke="#3a2010" strokeWidth="0.9" />
            <g clipPath={`url(#${uid}-pot-clip)`}>
              <LiquidFill
                x={POT_LIQUID_BOUNDS.x}
                y={0}
                width={POT_LIQUID_BOUNDS.width}
                height={0}
                fillPercent={data.fillPercent}
                status={data.status}
                innerHeight={POT_LIQUID_BOUNDS.innerHeight}
                bottomY={POT_LIQUID_BOUNDS.bottomY}
                rx={POT_LIQUID_BOUNDS.rx}
              />
            </g>
            <path
              d="M 22 132 Q 20 110 28 102"
              fill="none"
              stroke={`url(#${uid}-copper-shine)`}
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity="0.85"
            />
            <path
              d="M 168 54 V 128"
              fill="none"
              stroke={`url(#${uid}-copper-shine)`}
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.65"
            />
            <path
              d={POT_SWAN_NECK}
              fill="none"
              stroke="#fff8ee"
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.32"
            />
            <rect x="14" y="170" width="78" height="3" rx="1" fill="#3a2010" opacity="0.35" />
          </g>
        )}
        <circle
          cx={isColumn ? 95 : 212}
          cy="42"
          r="4.5"
          className={`equipment-status-dot equipment-status-dot--${data.status}`}
        />
      </svg>
    </EquipmentVisualFrame>
  );
}
