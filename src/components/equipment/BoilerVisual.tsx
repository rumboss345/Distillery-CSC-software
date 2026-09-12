import { useId } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';

export function BoilerVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');

  return (
    <EquipmentVisualFrame {...props} svgWidth={130} svgHeight={150} showVolume={false}>
      <svg viewBox="0 0 130 150" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-steel`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a3038" />
            <stop offset="50%" stopColor="#9aa3b0" />
            <stop offset="100%" stopColor="#3a424c" />
          </linearGradient>
        </defs>
        <rect x="35" y="40" width="60" height="80" rx="6" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
        <rect x="55" y="25" width="20" height="20" rx="3" fill="#5a6270" stroke="#1a1f26" />
        <circle cx="65" cy="80" r="14" fill="none" stroke="#5ec8e8" strokeWidth="2" opacity={data.status === 'active' ? 0.8 : 0.25} />
        <circle cx="65" cy="80" r="4" fill="#5ec8e8" opacity={data.status === 'active' ? 1 : 0.3} />
        <rect x="40" y="120" width="50" height="6" rx="2" fill="#3a424c" />
        <circle cx="108" cy="48" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}
