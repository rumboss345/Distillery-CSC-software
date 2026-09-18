import { useId, useMemo } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LIQUID_COLORS, MASH_WASH_LIQUID } from './equipment-visual-shared';

const WASH_BUBBLES = [
  { cx: 52, r: 2.2, delay: 0 },
  { cx: 68, r: 1.8, delay: 0.5 },
  { cx: 82, r: 2.1, delay: 1 },
  { cx: 58, r: 1.5, delay: 1.45 },
  { cx: 88, r: 1.7, delay: 1.95 },
] as const;

/** Stainless mash/cook tank with domed lid — matches production floor reference style. */
export function MashTunVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const isWashing = !!data.isWashing;
  const liquid = isWashing ? MASH_WASH_LIQUID : LIQUID_COLORS[data.status];

  const innerHeight = 95;
  const bottomY = 153;
  const fillH = (data.fillPercent / 100) * innerHeight;
  const surfaceY = bottomY - fillH;

  const showFill = data.fillPercent > 0;

  const slosh = useMemo(
    () => (isWashing ? ' mash-tun-wash-fill' : ''),
    [isWashing],
  );

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
          <linearGradient id={`${uid}-liq`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={liquid.edge} />
            <stop offset="35%" stopColor={liquid.base} />
            <stop offset="55%" stopColor={liquid.highlight} stopOpacity="0.88" />
            <stop offset="100%" stopColor={liquid.edge} />
          </linearGradient>
          <linearGradient id={`${uid}-surf`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={isWashing ? 0.22 : 0.4} />
            <stop offset="100%" stopColor={liquid.base} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <rect x="30" y="58" width="90" height="95" rx="6" />
          </clipPath>
        </defs>

        <rect x="34" y="150" width="8" height="18" fill="#3a424c" />
        <rect x="108" y="150" width="8" height="18" fill="#3a424c" />

        <rect x="28" y="56" width="94" height="98" rx="8" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1.2" />

        <ellipse cx="75" cy="56" rx="48" ry="14" fill={`url(#${uid}-dome)`} stroke="#1a1f26" strokeWidth="1" />
        <rect x="68" y="44" width="14" height="8" rx="3" fill="#5a6270" stroke="#2a3038" />

        <g clipPath={`url(#${uid}-clip)`}>
          {showFill && (
            <>
              <rect
                className={`equipment-liquid-fill${slosh}`}
                x="30"
                y={surfaceY}
                width="90"
                height={fillH}
                rx="6"
                fill={`url(#${uid}-liq)`}
                opacity="0.92"
              />
              {data.fillPercent > 4 && (
                <ellipse
                  className={`equipment-liquid-surface${isWashing ? ' mash-tun-wash-surface' : ''}`}
                  cx="75"
                  cy={surfaceY}
                  rx="42"
                  ry="4"
                  fill={`url(#${uid}-surf)`}
                />
              )}
              {isWashing && (
                <g className="mash-tun-wash-bubbles">
                  {WASH_BUBBLES.map((bubble, index) => (
                    <circle
                      key={index}
                      className="mash-tun-wash-bubble"
                      cx={bubble.cx}
                      cy={bottomY - 8}
                      r={bubble.r}
                      style={{ animationDelay: `${bubble.delay}s` }}
                    />
                  ))}
                </g>
              )}
            </>
          )}
          {isWashing && (
            <g aria-hidden>
              <line
                x1="75"
                y1="58"
                x2="75"
                y2="138"
                stroke="#52525b"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <g className="mash-tun-mixing-blade">
                <g transform="translate(75 118)">
                  <rect x="-24" y="-3.5" width="48" height="7" rx="2" fill="#a1a1aa" stroke="#52525b" strokeWidth="0.7" />
                  <rect x="-3.5" y="-24" width="7" height="48" rx="2" fill="#a1a1aa" stroke="#52525b" strokeWidth="0.7" />
                  <g transform="translate(0 -26)">
                    <rect x="-18" y="-2.5" width="36" height="5" rx="1.5" fill="#9ca3af" stroke="#52525b" strokeWidth="0.6" opacity="0.92" />
                    <rect x="-2.5" y="-18" width="5" height="36" rx="1.5" fill="#9ca3af" stroke="#52525b" strokeWidth="0.6" opacity="0.92" />
                  </g>
                </g>
              </g>
            </g>
          )}
        </g>

        <rect x="32" y="62" width="10" height="85" rx="4" fill="#fff" opacity="0.08" />
        <circle cx="122" cy="64" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
