import { useId } from 'react';
import type { BarrelStatus } from '../../types';

const WOOD = {
  edge: '#4a2814',
  mid: '#a86b3c',
  highlight: '#e2b07a',
};

const LIQUID = {
  aging: { edge: '#713f12', base: '#b45309', highlight: '#fbbf24' },
  dumped: { edge: '#44403c', base: '#57534e', highlight: '#a8a29e' },
};

export function BarrelVisual({
  barrelNumber,
  status,
  fillPercent,
}: {
  barrelNumber: string;
  status: BarrelStatus;
  fillPercent: number;
}) {
  const uid = useId().replace(/:/g, '');
  const fill = Math.max(0, Math.min(100, fillPercent));
  const liquid = status === 'dumped' ? LIQUID.dumped : LIQUID.aging;
  const innerTop = 36;
  const innerHeight = 96;
  const fillHeight = (fill / 100) * innerHeight;
  const fillY = innerTop + innerHeight - fillHeight;

  return (
    <svg className="barrel-visual-svg" viewBox="0 0 160 150" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-wood`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={WOOD.edge} />
          <stop offset="22%" stopColor={WOOD.mid} />
          <stop offset="48%" stopColor={WOOD.highlight} />
          <stop offset="70%" stopColor={WOOD.mid} />
          <stop offset="100%" stopColor={WOOD.edge} />
        </linearGradient>
        <linearGradient id={`${uid}-liquid`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={liquid.edge} />
          <stop offset="35%" stopColor={liquid.base} />
          <stop offset="55%" stopColor={liquid.highlight} stopOpacity="0.9" />
          <stop offset="100%" stopColor={liquid.edge} />
        </linearGradient>
        <clipPath id={`${uid}-body`}>
          <path d="M52 28 C40 28 32 58 32 84 C32 110 40 140 52 140 L108 140 C120 140 128 110 128 84 C128 58 120 28 108 28 Z" />
        </clipPath>
        <filter id={`${uid}-shadow`} x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter={`url(#${uid}-shadow)`}>
        <path
          d="M52 28 C40 28 32 58 32 84 C32 110 40 140 52 140 L108 140 C120 140 128 110 128 84 C128 58 120 28 108 28 Z"
          fill={`url(#${uid}-wood)`}
          stroke="#2a160c"
          strokeWidth="1.2"
        />
        <g clipPath={`url(#${uid}-body)`}>
          {fill > 0 && (
            <rect
              className="barrel-visual-liquid"
              x="28"
              y={fillY}
              width="104"
              height={fillHeight}
              fill={`url(#${uid}-liquid)`}
              opacity="0.9"
            />
          )}
          {fill > 2 && (
            <ellipse cx="80" cy={fillY} rx="42" ry="5" fill="#fff" opacity="0.28" />
          )}
          <path d="M58 30 V138" stroke="#4a2814" strokeWidth="0.6" opacity="0.35" />
          <path d="M72 28 V140" stroke="#4a2814" strokeWidth="0.7" opacity="0.28" />
          <path d="M88 28 V140" stroke="#4a2814" strokeWidth="0.7" opacity="0.28" />
          <path d="M102 30 V138" stroke="#4a2814" strokeWidth="0.6" opacity="0.35" />
        </g>
        <ellipse cx="80" cy="28" rx="28" ry="8" fill="#d7a56a" stroke="#2a160c" strokeWidth="1" />
        <ellipse cx="80" cy="28" rx="10" ry="3.2" fill="#3a2416" />
        {[48, 72, 108].map((y) => (
          <path
            key={y}
            d={`M34 ${y - 6} C50 ${y + 8} 110 ${y + 8} 126 ${y - 6}`}
            fill="none"
            stroke="#8b95a3"
            strokeWidth="5"
            strokeLinecap="round"
          />
        ))}
        <path
          d="M34 42 C50 56 110 56 126 42"
          fill="none"
          stroke="#c5ced8"
          strokeWidth="1.2"
          opacity="0.7"
        />
      </g>
      <title>{barrelNumber}</title>
    </svg>
  );
}
