import { useId } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';

/** Transfer hose with a coupling on each end. */
export function HoseVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');

  return (
    <EquipmentVisualFrame {...props} svgWidth={150} svgHeight={130} showVolume={false}>
      <svg viewBox="0 0 150 130" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-hose`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6fbf7a" />
            <stop offset="50%" stopColor="#2f7a45" />
            <stop offset="100%" stopColor="#1a4a28" />
          </linearGradient>
          <linearGradient id={`${uid}-fit`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a3038" />
            <stop offset="50%" stopColor="#9aa3b0" />
            <stop offset="100%" stopColor="#3a424c" />
          </linearGradient>
        </defs>
        <path
          d="M 28 78 C 40 28, 110 28, 122 78"
          fill="none"
          stroke={`url(#${uid}-hose)`}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 28 78 C 40 28, 110 28, 122 78"
          fill="none"
          stroke="#d9ffe0"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.35"
        />
        <rect x="10" y="64" width="22" height="28" rx="3" fill={`url(#${uid}-fit)`} stroke="#1a1f26" />
        <rect x="14" y="70" width="14" height="4" rx="1" fill="#1a1f26" opacity="0.45" />
        <rect x="14" y="82" width="14" height="4" rx="1" fill="#1a1f26" opacity="0.45" />
        <rect x="118" y="64" width="22" height="28" rx="3" fill={`url(#${uid}-fit)`} stroke="#1a1f26" />
        <rect x="122" y="70" width="14" height="4" rx="1" fill="#1a1f26" opacity="0.45" />
        <rect x="122" y="82" width="14" height="4" rx="1" fill="#1a1f26" opacity="0.45" />
        <circle cx="136" cy="28" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
