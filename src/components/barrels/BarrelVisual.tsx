import { useId } from 'react';
import type { BarrelStatus } from '../../types';

const HEAD_FILL: Record<BarrelStatus, string> = {
  aging: '#e4c48a',
  empty: '#efe4d0',
  dumped: '#b7b1a8',
};

/** Top-down barrel head only — the body stays hidden so many barrels fit in a location. */
export function BarrelVisual({
  barrelNumber,
  status,
}: {
  barrelNumber: string;
  status: BarrelStatus;
}) {
  const uid = useId().replace(/:/g, '');
  const fontSize = barrelNumber.length > 8 ? 5.2 : barrelNumber.length > 6 ? 6.2 : 7;

  return (
    <svg className="barrel-head-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <clipPath id={`${uid}-head`}>
          <circle cx="24" cy="24" r="18.4" />
        </clipPath>
      </defs>
      <circle cx="24" cy="24" r="23" fill="#5c4030" stroke="#2a1c12" strokeWidth="1" />
      <circle cx="24" cy="24" r="20.4" fill="#8d9096" />
      <circle cx="24" cy="24" r="18.4" fill={HEAD_FILL[status]} />
      <g clipPath={`url(#${uid}-head)`} stroke="#6b4a2a" strokeWidth="0.7" opacity="0.5">
        <line x1="2" y1="15" x2="46" y2="15" />
        <line x1="2" y1="24" x2="46" y2="24" />
        <line x1="2" y1="33" x2="46" y2="33" />
      </g>
      <circle cx="24" cy="14.5" r="2" fill="#2a1c12" />
      <text
        x="24"
        y="30.5"
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill="#2a1c12"
        fontFamily="system-ui, sans-serif"
      >
        {barrelNumber}
      </text>
    </svg>
  );
}
