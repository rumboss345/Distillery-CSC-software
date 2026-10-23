import { useId } from 'react';
import { barrelAgingMonths, barrelHeadFill, barrelHeadInk } from '../../lib/barrel-head-color';
import type { BarrelStatus } from '../../types';

/** Top-down barrel head only — the body stays hidden so many barrels fit in a location. */
export function BarrelVisual({
  barrelNumber,
  status,
  volumeGal = 0,
  fillDate = null,
}: {
  barrelNumber: string;
  status: BarrelStatus;
  volumeGal?: number;
  fillDate?: string | null;
}) {
  const uid = useId().replace(/:/g, '');
  const fontSize = barrelNumber.length > 8 ? 5.2 : barrelNumber.length > 6 ? 6.2 : 7;
  const headFill = barrelHeadFill({ status, volumeGal, fillDate });
  const ink = barrelHeadInk(headFill);
  const ageMonths = status === 'aging' && volumeGal > 0.01 ? barrelAgingMonths(fillDate) : null;

  return (
    <svg
      className="barrel-head-svg"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      data-head-fill={headFill}
      data-age-months={ageMonths ?? ''}
    >
      <defs>
        <clipPath id={`${uid}-head`}>
          <circle cx="24" cy="24" r="18.4" />
        </clipPath>
      </defs>
      <circle cx="24" cy="24" r="23" fill="#5c4030" stroke="#2a1c12" strokeWidth="1" />
      <circle cx="24" cy="24" r="20.4" fill="#8d9096" />
      <circle cx="24" cy="24" r="18.4" fill={headFill} />
      <g clipPath={`url(#${uid}-head)`} stroke={ink.stave} strokeWidth="0.7" opacity="0.55">
        <line x1="2" y1="15" x2="46" y2="15" />
        <line x1="2" y1="24" x2="46" y2="24" />
        <line x1="2" y1="33" x2="46" y2="33" />
      </g>
      <circle cx="24" cy="14.5" r="2" fill={ink.number} />
      <text
        x="24"
        y="30.5"
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill={ink.number}
        fontFamily="system-ui, sans-serif"
      >
        {barrelNumber}
      </text>
    </svg>
  );
}
