import { useId } from 'react';

export function SteelDefs() {
  const uid = useId().replace(/:/g, '');
  return (
    <defs>
      <linearGradient id={`${uid}-steel-h`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#2a3038" />
        <stop offset="18%" stopColor="#6b7380" />
        <stop offset="42%" stopColor="#c8ced8" />
        <stop offset="55%" stopColor="#eef2f7" />
        <stop offset="68%" stopColor="#9aa3b0" />
        <stop offset="100%" stopColor="#3a424c" />
      </linearGradient>
      <linearGradient id={`${uid}-copper-h`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#6b3a12" />
        <stop offset="25%" stopColor="#b87333" />
        <stop offset="50%" stopColor="#e8a862" />
        <stop offset="75%" stopColor="#b87333" />
        <stop offset="100%" stopColor="#5a3010" />
      </linearGradient>
      <linearGradient id={`${uid}-dome`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e8edf3" />
        <stop offset="50%" stopColor="#9aa3b0" />
        <stop offset="100%" stopColor="#4a525c" />
      </linearGradient>
      <filter id={`${uid}-shadow`} x="-15%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.4" />
      </filter>
    </defs>
  );
}

export function useSteelGradients() {
  const uid = useId().replace(/:/g, '');
  return {
    steel: `url(#${uid}-steel-h)`,
    copper: `url(#${uid}-copper-h)`,
    dome: `url(#${uid}-dome)`,
    shadow: `url(#${uid}-shadow)`,
    uid,
  };
}
