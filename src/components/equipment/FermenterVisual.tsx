import { useId, useMemo } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';
import { liquidColorsForFermenter } from './equipment-visual-shared';

const FERMENTER_BUBBLES = [
  { cx: 62, r: 2.4, delay: 0 },
  { cx: 72, r: 1.8, delay: 0.45 },
  { cx: 82, r: 2.1, delay: 0.9 },
  { cx: 90, r: 1.6, delay: 1.35 },
  { cx: 68, r: 1.5, delay: 1.8 },
  { cx: 86, r: 2, delay: 2.1 },
] as const;

/** Stainless conical fermenter — ledger-driven fill, bubbles while fermenting. */
export function FermenterVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');

  const bottomY = 168;
  const topY = 52;
  const innerHeight = bottomY - topY;
  const liquid = liquidColorsForFermenter(data.status, data.fermenterLatestBrix);
  const effectiveFillPercent = data.fillPercent > 0
    ? data.fillPercent
    : (data.isFermenting ? 60 : 0);
  const fillH = (effectiveFillPercent / 100) * innerHeight;
  const surfaceY = bottomY - fillH;
  const surfaceRx = surfaceY <= 118 ? 30 : Math.max(4, 30 * ((bottomY - surfaceY) / (bottomY - 118)));

  const vesselPath = useMemo(
    () => 'M 42 50 H 108 V 118 L 75 168 L 42 118 Z',
    [],
  );

  return (
    <EquipmentVisualFrame {...props} svgWidth={150} svgHeight={200}>
      <svg viewBox="0 0 150 200" width="100%" height="100%" aria-hidden>
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
            <stop offset="55%" stopColor={liquid.highlight} stopOpacity="0.85" />
            <stop offset="100%" stopColor={liquid.edge} />
          </linearGradient>
          <linearGradient id={`${uid}-surf`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="100%" stopColor={liquid.base} stopOpacity="0" />
          </linearGradient>
          <filter id={`${uid}-shadow`} x="-20%" y="-8%" width="140%" height="124%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#000" floodOpacity="0.38" />
          </filter>
          <clipPath id={`${uid}-clip`}>
            <path d={vesselPath} />
          </clipPath>
        </defs>

        <g filter={`url(#${uid}-shadow)`}>
          <path d="M 46 116 L 28 186 H 42 L 54 124 Z" fill="#3a424c" />
          <path d="M 104 116 L 122 186 H 108 L 96 124 Z" fill="#3a424c" />
          <rect x="24" y="182" width="22" height="5" rx="1.5" fill="#2a313a" />
          <rect x="104" y="182" width="22" height="5" rx="1.5" fill="#2a313a" />

          <path d={vesselPath} fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1.15" strokeLinejoin="round" />
          <rect x="40" y="78" width="70" height="12" fill={`url(#${uid}-jacket)`} stroke="#1a1f26" strokeWidth="0.6" />
          <rect x="40" y="102" width="70" height="8" fill={`url(#${uid}-jacket)`} stroke="#1a1f26" strokeWidth="0.5" opacity="0.9" />

          {effectiveFillPercent > 0 && (
            <g clipPath={`url(#${uid}-clip)`}>
              <rect
                className="equipment-liquid-fill"
                x="40"
                y={surfaceY}
                width="70"
                height={fillH}
                fill={`url(#${uid}-liq)`}
                opacity="0.92"
              />
              {effectiveFillPercent > 4 && (
                <ellipse
                  className="equipment-liquid-surface"
                  cx="75"
                  cy={surfaceY}
                  rx={surfaceRx}
                  ry="4.2"
                  fill={`url(#${uid}-surf)`}
                />
              )}
              {data.isFermenting && (
                <g className="fermenter-bubbles-svg">
                  {FERMENTER_BUBBLES.map((bubble, index) => (
                    <circle
                      key={index}
                      className="fermenter-bubble"
                      cx={bubble.cx}
                      cy={Math.min(bottomY - 8, surfaceY + fillH - 6)}
                      r={bubble.r}
                      style={{ animationDelay: `${bubble.delay}s` }}
                    />
                  ))}
                </g>
              )}
            </g>
          )}

          <rect x="40" y="78" width="8" height="12" fill={`url(#${uid}-jacket)`} />
          <rect x="102" y="78" width="8" height="12" fill={`url(#${uid}-jacket)`} />
          <rect x="40" y="102" width="8" height="8" fill={`url(#${uid}-jacket)`} />
          <rect x="102" y="102" width="8" height="8" fill={`url(#${uid}-jacket)`} />
          <rect x="48" y="58" width="5" height="18" rx="1.5" fill="#d5dce4" opacity="0.35" />
          <rect x="48" y="112" width="5" height="10" rx="1.5" fill="#d5dce4" opacity="0.28" />
          <ellipse cx="75" cy="50" rx="34" ry="9" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="0.9" />
          <ellipse cx="75" cy="44" rx="12" ry="5" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="0.7" />
          <rect x="72" y="32" width="6" height="10" rx="1.5" fill="#6d7783" stroke="#2a313a" strokeWidth="0.6" />
          <rect x="71" y="166" width="8" height="10" rx="2" fill="#5a6270" stroke="#2a3038" />
          <circle cx="75" cy="178" r="3" fill="#3a424c" />
        </g>

        <circle cx="124" cy="46" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
