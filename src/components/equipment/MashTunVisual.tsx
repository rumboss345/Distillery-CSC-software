import { useId, useMemo } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { LIQUID_COLORS, MASH_WASH_LIQUID } from './equipment-visual-shared';

const WASH_BUBBLES = [
  { cx: 58, r: 2.2, delay: 0 },
  { cx: 72, r: 1.8, delay: 0.5 },
  { cx: 86, r: 2.1, delay: 1 },
  { cx: 64, r: 1.5, delay: 1.45 },
  { cx: 92, r: 1.7, delay: 1.95 },
] as const;

/** Single curved fan paddle (+X from hub); pair at 180° for a two-blade impeller. */
const FAN_BLADE_PATH =
  'M 5 0 C 14 -7 34 -10 46 -3 L 48 0 L 46 3 C 34 10 14 7 5 0 Z';

const FAN_BLADE_ANGLES = [0, 180] as const;

const KETTLE_PATH = 'M 32 68 H 118 V 124 C 118 152 32 152 32 124 Z';

/** Jacketed stainless cook kettle with a dished bottom and domed cover. */
export function MashTunVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const isWashing = !!data.isWashing;
  const liquid = isWashing ? MASH_WASH_LIQUID : LIQUID_COLORS[data.status];

  const innerHeight = 78;
  const bottomY = 148;
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
            <stop offset="0%" stopColor="#1b2128" />
            <stop offset="18%" stopColor="#5e6874" />
            <stop offset="40%" stopColor="#c5ced8" />
            <stop offset="52%" stopColor="#f4f7fb" />
            <stop offset="68%" stopColor="#8e99a6" />
            <stop offset="100%" stopColor="#2a313a" />
          </linearGradient>
          <linearGradient id={`${uid}-head`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f7f9fc" />
            <stop offset="48%" stopColor="#b7c0cb" />
            <stop offset="100%" stopColor="#5c6672" />
          </linearGradient>
          <linearGradient id={`${uid}-jacket`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2c343d" />
            <stop offset="45%" stopColor="#8b97a4" />
            <stop offset="100%" stopColor="#323a44" />
          </linearGradient>
          <linearGradient id={`${uid}-liq`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={liquid.edge} />
            <stop offset="35%" stopColor={liquid.base} />
            <stop offset="55%" stopColor={liquid.highlight} stopOpacity="0.88" />
            <stop offset="100%" stopColor={liquid.edge} />
          </linearGradient>
          <linearGradient id={`${uid}-surf`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={isWashing ? 0.22 : 0.45} />
            <stop offset="100%" stopColor={liquid.base} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-blade`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#71717a" />
            <stop offset="45%" stopColor="#d4d4d8" />
            <stop offset="100%" stopColor="#9ca3af" />
          </linearGradient>
          <radialGradient id={`${uid}-hub`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#e4e4e7" />
            <stop offset="100%" stopColor="#71717a" />
          </radialGradient>
          <filter id={`${uid}-shadow`} x="-16%" y="-8%" width="132%" height="122%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#000" floodOpacity="0.38" />
          </filter>
          <clipPath id={`${uid}-clip`}>
            <path d="M 36 72 H 114 V 122 C 114 146 36 146 36 122 Z" />
          </clipPath>
        </defs>

        <g filter={`url(#${uid}-shadow)`}>
          <path d="M 42 128 L 26 176 H 40 L 50 136 Z" fill="#3a424c" />
          <path d="M 108 128 L 124 176 H 110 L 100 136 Z" fill="#3a424c" />
          <rect x="22" y="174" width="22" height="5" rx="1.5" fill="#2a313a" />
          <rect x="106" y="174" width="22" height="5" rx="1.5" fill="#2a313a" />

          <path d={KETTLE_PATH} fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1.15" />
          <rect x="30" y="96" width="90" height="14" fill={`url(#${uid}-jacket)`} stroke="#1a1f26" strokeWidth="0.55" />

          <g clipPath={`url(#${uid}-clip)`}>
            {showFill && (
              <>
                <rect
                  className={`equipment-liquid-fill${slosh}`}
                  x="34"
                  y={surfaceY}
                  width="82"
                  height={fillH}
                  fill={`url(#${uid}-liq)`}
                  opacity="0.92"
                />
                {data.fillPercent > 4 && (
                  <ellipse
                    className={`equipment-liquid-surface${isWashing ? ' mash-tun-wash-surface' : ''}`}
                    cx="75"
                    cy={surfaceY}
                    rx={surfaceY > 122 ? 28 : 38}
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
                  y1="72"
                  x2="75"
                  y2="128"
                  stroke="#52525b"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <g transform="translate(75 112)">
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

          <rect x="30" y="96" width="8" height="14" fill={`url(#${uid}-jacket)`} />
          <rect x="112" y="96" width="8" height="14" fill={`url(#${uid}-jacket)`} />
          <rect x="40" y="74" width="5" height="20" rx="1.5" fill="#d5dce4" opacity="0.35" />
          <ellipse cx="75" cy="68" rx="44" ry="13" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="0.9" />
          <ellipse cx="75" cy="60" rx="14" ry="5.5" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="0.7" />
          <rect x="71" y="46" width="8" height="12" rx="2" fill="#6d7783" stroke="#2a313a" strokeWidth="0.6" />
          <rect x="114" y="100" width="10" height="6" rx="1.5" fill="#5a6270" stroke="#2a3038" />
          <rect x="71" y="148" width="8" height="10" rx="2" fill="#5a6270" stroke="#2a3038" />
        </g>

        <circle cx="132" cy="52" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
