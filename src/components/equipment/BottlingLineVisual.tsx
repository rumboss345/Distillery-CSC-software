import { useId } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';

/** Inline bottling line: filler, conveyor, and bottles. */
export function BottlingLineVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const running = data.status === 'active' || Boolean(props.preview);

  return (
    <EquipmentVisualFrame {...props} svgWidth={180} svgHeight={140} showVolume={false}>
      <svg viewBox="0 0 180 140" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-steel`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a3038" />
            <stop offset="45%" stopColor="#9aa3b0" />
            <stop offset="100%" stopColor="#3a424c" />
          </linearGradient>
          <linearGradient id={`${uid}-glass`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7ec8e8" />
            <stop offset="50%" stopColor="#d7f3ff" />
            <stop offset="100%" stopColor="#4aa0c4" />
          </linearGradient>
          <linearGradient id={`${uid}-spirit`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#c8956c" />
            <stop offset="100%" stopColor="#e8c49a" />
          </linearGradient>
          <clipPath id={`${uid}-belt`}>
            <rect x="14" y="78" width="152" height="28" rx="4" />
          </clipPath>
        </defs>
        <rect x="18" y="118" width="12" height="14" rx="1.5" fill="#2a3038" />
        <rect x="150" y="118" width="12" height="14" rx="1.5" fill="#2a3038" />
        <rect x="10" y="96" width="160" height="24" rx="5" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
        <rect x="14" y="100" width="152" height="12" rx="3" fill="#1a1f26" />
        <g className={running ? 'bottling-belt' : undefined} clipPath={`url(#${uid}-belt)`}>
          {[-40, 0, 40, 80, 120, 160].map((x) => (
            <rect key={x} x={x} y="101" width="22" height="10" rx="1" fill="#5a6270" opacity="0.85" />
          ))}
        </g>
        <rect x="48" y="18" width="84" height="36" rx="4" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
        <rect x="58" y="8" width="64" height="14" rx="3" fill="#3a424c" stroke="#1a1f26" />
        <rect x="66" y="48" width="8" height="18" rx="1.5" fill="#5a6270" className={running ? 'bottling-nozzle' : undefined} />
        <rect x="86" y="48" width="8" height="18" rx="1.5" fill="#5a6270" className={running ? 'bottling-nozzle' : undefined} />
        <rect x="106" y="48" width="8" height="18" rx="1.5" fill="#5a6270" className={running ? 'bottling-nozzle' : undefined} />
        <g className={running ? 'bottling-bottles' : undefined} clipPath={`url(#${uid}-belt)`}>
          <BottlingBottle x={22} glassId={`${uid}-glass`} spiritId={`${uid}-spirit`} />
          <BottlingBottle x={62} glassId={`${uid}-glass`} spiritId={`${uid}-spirit`} />
          <BottlingBottle x={102} glassId={`${uid}-glass`} spiritId={`${uid}-spirit`} />
          <BottlingBottle x={142} glassId={`${uid}-glass`} spiritId={`${uid}-spirit`} />
        </g>
        <circle cx="166" cy="20" r="4.5" className={`equipment-status-dot equipment-status-dot--${data.status}`} />
      </svg>
    </EquipmentVisualFrame>
  );
}

function BottlingBottle({ x, glassId, spiritId }: { x: number; glassId: string; spiritId: string }) {
  return (
    <g transform={`translate(${x} 70)`}>
      <rect x="6" y="0" width="10" height="8" rx="2" fill={`url(#${glassId})`} />
      <rect x="3" y="8" width="16" height="22" rx="3" fill={`url(#${glassId})`} stroke="#1a1f26" />
      <rect x="4" y="16" width="14" height="12" rx="2" fill={`url(#${spiritId})`} opacity="0.85" />
    </g>
  );
}
