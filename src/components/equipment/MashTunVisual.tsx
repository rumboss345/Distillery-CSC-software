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

/** One fan blade pointing +X from the hub; rotated for a propeller-style impeller. */
const FAN_BLADE_PATH =
  'M 6 0 C 12 -1.2 28 -4.8 41 -4.2 L 43.5 0 C 28 5.2 12 1.2 6 0 Z';

const FAN_BLADE_ANGLES = [0, 72, 144, 216, 288] as const;

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
          <linearGradient id={`${uid}-blade`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#71717a" />
            <stop offset="45%" stopColor="#d4d4d8" />
            <stop offset="100%" stopColor="#9ca3af" />
          </linearGradient>
          <radialGradient id={`${uid}-hub`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#e4e4e7" />
            <stop offset="100%" stopColor="#71717a" />
          </radialGradient>
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
              <g transform="translate(75 118)">
                <g className="mash-tun-mixing-blade">
                  {FAN_BLADE_ANGLES.map((angle) => (
                    <path
                      key={angle}
                      d={FAN_BLADE_PATH}
                      fill={`url(#${uid}-blade)`}
                      stroke="#52525b"
                      strokeWidth="0.55"
                      transform={`rotate(${angle})`}
                    />
                  ))}
                  <circle r="6" fill={`url(#${uid}-hub)`} stroke="#3f3f46" strokeWidth="0.85" />
                  <circle r="2.2" fill="#52525b" />
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
