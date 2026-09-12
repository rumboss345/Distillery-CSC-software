import { useId } from 'react';
import type { EquipmentVisualStatus } from './equipment-visual.types';
import { LIQUID_COLORS } from './equipment-visual-shared';

interface LiquidFillProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fillPercent: number;
  status: EquipmentVisualStatus;
  innerHeight: number;
  bottomY: number;
  rx?: number;
}

/** Renders ledger-driven liquid inside a vessel clip region. */
export function LiquidFill({
  x,
  width,
  fillPercent,
  status,
  innerHeight,
  bottomY,
  rx = 4,
}: LiquidFillProps) {
  const uid = useId().replace(/:/g, '');
  const liquid = LIQUID_COLORS[status];
  const fillH = (fillPercent / 100) * innerHeight;
  const surfaceY = bottomY - fillH;

  if (fillPercent <= 0) return null;

  return (
    <g>
      <defs>
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
      </defs>
      <rect
        className="equipment-liquid-fill"
        x={x}
        y={surfaceY}
        width={width}
        height={fillH}
        rx={rx}
        fill={`url(#${uid}-liq)`}
        opacity="0.9"
      />
      {fillPercent > 3 && (
        <ellipse
          className="equipment-liquid-surface"
          cx={x + width / 2}
          cy={surfaceY}
          rx={width / 2 - 2}
          ry={4}
          fill={`url(#${uid}-surf)`}
        />
      )}
    </g>
  );
}
