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
            <>
              <linearGradient id={`${uid}-copper-v`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#e8a862" />
                <stop offset="45%" stopColor="#b87333" />
                <stop offset="100%" stopColor="#5a3010" />
              </linearGradient>
              <linearGradient id={`${uid}-steel-neck`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4a525c" />
                <stop offset="45%" stopColor="#9aa3b0" />
                <stop offset="100%" stopColor="#2a3038" />
              </linearGradient>
              <clipPath id={`${uid}-pot-clip`}>
                <path d="M 34 160 L 34 132 Q 34 114 58 108 Q 82 108 86 132 L 86 160 Q 82 174 58 176 Q 34 172 34 160 Z" />
              </clipPath>
            </>
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
          <g className="pot-still-visual">
            {/* Stand & burner */}
            <rect x="42" y="178" width="36" height="4" rx="1" fill="#2a3038" />
            <rect x="48" y="174" width="6" height="8" fill="#3a424c" />
            <rect x="66" y="174" width="6" height="8" fill="#3a424c" />
            {isRunning && (
              <g className="still-flame">
                <ellipse cx="60" cy="192" rx="18" ry="7" fill="#ff6600" opacity="0.28" />
                <path d="M 52 192 Q 60 162 68 192 Q 60 178 52 192" fill="#ff8800" opacity="0.92" />
                <path d="M 56 192 Q 60 170 64 192 Q 60 182 56 192" fill="#ffcc00" opacity="0.88" />
              </g>
            )}

            {/* Pot belly */}
            <path
              d="M 30 160 L 30 132 Q 30 108 58 102 Q 86 108 90 132 L 90 160 Q 86 178 58 180 Q 30 176 30 160 Z"
              fill={`url(#${uid}-copper-v)`}
              stroke="#3a2010"
              strokeWidth="1.3"
            />
            <path
              d="M 36 118 Q 58 112 80 118"
              fill="none"
              stroke="#f0c080"
              strokeWidth="1.2"
              opacity="0.35"
            />
            {[44, 58, 72].map((x) => (
              <circle key={x} cx={x} cy="148" r="1.2" fill="#3a2010" opacity="0.55" />
            ))}

            <g clipPath={`url(#${uid}-pot-clip)`}>
              <LiquidFill
                x={34}
                y={0}
                width={52}
                height={0}
                fillPercent={data.fillPercent}
                status={data.status}
                innerHeight={52}
                bottomY={162}
                rx={6}
              />
            </g>

            {/* Onion head & collar */}
            <ellipse cx="60" cy="102" rx="26" ry="11" fill={`url(#${uid}-copper)`} stroke="#3a2010" strokeWidth="1" />
            <ellipse cx="60" cy="98" rx="18" ry="7" fill="#c98545" stroke="#3a2010" strokeWidth="0.8" opacity="0.95" />
            <rect x="54" y="90" width="12" height="6" rx="2" fill={`url(#${uid}-steel-neck)`} stroke="#1a1f26" strokeWidth="0.5" />

            {/* Swan neck & lyne arm */}
            <path
              d="M 72 96 Q 98 88 118 72 Q 132 58 136 44"
              fill="none"
              stroke={`url(#${uid}-steel-neck)`}
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M 72 96 Q 98 88 118 72 Q 132 58 136 44"
              fill="none"
              stroke="#eef2f7"
              strokeWidth="1.2"
              opacity="0.35"
            />

            {/* Condenser / worm box */}
            <rect x="112" y="36" width="32" height="16" rx="4" fill={`url(#${uid}-steel-neck)`} stroke="#1a1f26" strokeWidth="0.9" />
            <rect x="116" y="40" width="24" height="8" rx="2" fill="#5a6270" opacity="0.5" />
            <path d="M 144 44 L 148 44" stroke="#9aa3b0" strokeWidth="2" strokeLinecap="round" />

            {/* Thermometer / sight glass */}
            <rect x="78" y="118" width="4" height="22" rx="1" fill="#eef2f7" stroke="#1a1f26" strokeWidth="0.5" opacity="0.85" />
            <rect x="78.5" y="128" width="3" height="8" fill="#6fd98a" opacity="0.7" />

            {/* Outlet */}
            <rect x="56" y="168" width="8" height="10" rx="2" fill="#3a424c" stroke="#1a1f26" strokeWidth="0.6" />
          </g>
        )}
        <circle cx={isColumn ? 95 : 132} cy="38" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
