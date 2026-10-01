import { useId } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';

/** Centrifugal pump: volute, impeller, and suction/discharge connections. */
export function PumpVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const running = data.status === 'active';

  return (
    <EquipmentVisualFrame {...props} svgWidth={140} svgHeight={150} showVolume={false}>
      <svg viewBox="0 0 140 150" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-steel`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a3038" />
            <stop offset="45%" stopColor="#9aa3b0" />
            <stop offset="100%" stopColor="#3a424c" />
          </linearGradient>
          <linearGradient id={`${uid}-body`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1f6f6a" />
            <stop offset="45%" stopColor="#5ec8c0" />
            <stop offset="100%" stopColor="#14524e" />
          </linearGradient>
        </defs>
        <rect x="22" y="112" width="96" height="8" rx="2" fill="#2a3038" />
        <rect x="30" y="104" width="10" height="12" fill="#3a424c" />
        <rect x="100" y="104" width="10" height="12" fill="#3a424c" />
        <rect x="8" y="70" width="28" height="16" rx="3" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
        <rect x="58" y="22" width="16" height="28" rx="3" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
        <circle cx="66" cy="74" r="30" fill={`url(#${uid}-body)`} stroke="#0e3330" strokeWidth="1.4" />
        <circle cx="66" cy="74" r="16" fill="none" stroke="#e8fff9" strokeWidth="1.2" opacity="0.35" />
        <path d="M66 58 L72 74 L66 70 L60 74 Z" fill="#e8fff9" opacity={running ? 0.95 : 0.45} />
        <path d="M82 74 L66 68 L70 74 L66 80 Z" fill="#e8fff9" opacity={running ? 0.85 : 0.35} />
        <path d="M66 90 L60 74 L66 78 L72 74 Z" fill="#e8fff9" opacity={running ? 0.85 : 0.35} />
        <circle cx="66" cy="74" r="4" fill="#0e3330" />
        <rect x="92" y="58" width="32" height="32" rx="4" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
        <circle cx="108" cy="74" r="6" fill="none" stroke="#5ec8e8" strokeWidth="1.5" opacity={running ? 0.9 : 0.3} />
        <circle cx="124" cy="36" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
