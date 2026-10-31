import { useId } from 'react';
import type { EquipmentVisualProps } from './equipment-visual.types';
import { EquipmentVisualFrame } from './EquipmentVisualFrame';

function steelGradient(uid: string) {
  return (
    <linearGradient id={`${uid}-steel`} x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#2a3038" />
      <stop offset="45%" stopColor="#9aa3b0" />
      <stop offset="100%" stopColor="#3a424c" />
    </linearGradient>
  );
}

function StatusDot({ status }: { status: string }) {
  return <circle cx="124" cy="18" r="4.5" className={`equipment-status-dot equipment-status-dot--${status}`} />;
}

function useRunning(props: EquipmentVisualProps) {
  return props.data.status === 'active' || Boolean(props.preview);
}

/** Bottle labeler with a turning roll. */
export function LabelerVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const running = useRunning(props);

  return (
    <EquipmentVisualFrame {...props} svgWidth={140} svgHeight={150} showVolume={false}>
      <svg viewBox="0 0 140 150" width="100%" height="100%" aria-hidden>
        <defs>{steelGradient(uid)}</defs>
        <rect x="18" y="118" width="104" height="10" rx="2" fill="#2a3038" />
        <rect x="36" y="72" width="22" height="46" rx="6" fill="#7ec8e8" stroke="#1a1f26" />
        <rect x="42" y="58" width="10" height="16" rx="2" fill="#7ec8e8" stroke="#1a1f26" />
        <rect x="38" y="88" width="18" height="16" rx="2" fill="#f4e3b8" />
        <rect x="78" y="36" width="36" height="70" rx="4" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
        <g transform="translate(96 62)">
          <g className={running ? 'labeler-roll' : undefined}>
            <circle r="18" fill="#d4a04a" stroke="#1a1f26" />
            <circle r="8" fill="#3a424c" />
            <path d="M0 -18 L2 -8 L-2 -8 Z" fill="#f4e3b8" />
          </g>
        </g>
        <rect x="64" y="86" width="16" height="6" rx="1" fill="#f4e3b8" className={running ? 'labeler-arm' : undefined} />
        <StatusDot status={data.status} />
      </svg>
    </EquipmentVisualFrame>
  );
}

/** Copper gin basket / botanical chamber. */
export function GinBasketVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const running = useRunning(props);

  return (
    <EquipmentVisualFrame {...props} svgWidth={140} svgHeight={150} showVolume={false}>
      <svg viewBox="0 0 140 150" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-copper`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7a3e1c" />
            <stop offset="45%" stopColor="#e0a36a" />
            <stop offset="100%" stopColor="#8a4a22" />
          </linearGradient>
        </defs>
        <rect x="58" y="18" width="24" height="16" rx="3" fill={`url(#${uid}-copper)`} stroke="#4a2410" />
        <ellipse cx="70" cy="44" rx="32" ry="10" fill={`url(#${uid}-copper)`} stroke="#4a2410" />
        <path d="M38 44 V98 A32 12 0 0 0 102 98 V44" fill={`url(#${uid}-copper)`} stroke="#4a2410" />
        <ellipse cx="70" cy="98" rx="32" ry="12" fill="#8a4a22" stroke="#4a2410" />
        {[52, 70, 88].map((x) => (
          <line key={x} x1={x} y1="48" x2={x} y2="94" stroke="#4a2410" strokeWidth="1.4" opacity="0.55" />
        ))}
        {running && (
          <>
            <circle cx="56" cy="36" r="3" className="gin-basket-steam" />
            <circle cx="70" cy="28" r="3.5" className="gin-basket-steam" style={{ animationDelay: '0.4s' }} />
            <circle cx="84" cy="34" r="3" className="gin-basket-steam" style={{ animationDelay: '0.8s' }} />
          </>
        )}
        <StatusDot status={data.status} />
      </svg>
    </EquipmentVisualFrame>
  );
}

/** Stacked barrel rack. */
export function BarrelRackVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const running = useRunning(props);

  return (
    <EquipmentVisualFrame {...props} svgWidth={150} svgHeight={140} showVolume={false}>
      <svg viewBox="0 0 150 140" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-oak`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c8956c" />
            <stop offset="100%" stopColor="#6b3d1f" />
          </linearGradient>
        </defs>
        <rect x="16" y="18" width="10" height="110" rx="2" fill="#3a2a1c" />
        <rect x="124" y="18" width="10" height="110" rx="2" fill="#3a2a1c" />
        <ellipse cx="75" cy="48" rx="42" ry="22" fill={`url(#${uid}-oak)`} stroke="#3a2a1c" className={running ? 'barrel-rack-glow' : undefined} />
        <ellipse cx="75" cy="92" rx="42" ry="22" fill={`url(#${uid}-oak)`} stroke="#3a2a1c" />
        <rect x="33" y="46" width="84" height="4" fill="#2a1c12" opacity="0.45" />
        <rect x="33" y="90" width="84" height="4" fill="#2a1c12" opacity="0.45" />
        <StatusDot status={data.status} />
      </svg>
    </EquipmentVisualFrame>
  );
}

/** Plate filter / filter press. */
export function FilterVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const running = useRunning(props);

  return (
    <EquipmentVisualFrame {...props} svgWidth={150} svgHeight={140} showVolume={false}>
      <svg viewBox="0 0 150 140" width="100%" height="100%" aria-hidden>
        <defs>{steelGradient(uid)}</defs>
        <rect x="20" y="112" width="110" height="8" rx="2" fill="#2a3038" />
        <rect x="24" y="40" width="14" height="74" rx="2" fill={`url(#${uid}-steel)`} />
        <rect x="112" y="40" width="14" height="74" rx="2" fill={`url(#${uid}-steel)`} />
        {[42, 56, 70, 84, 98].map((x, index) => (
          <rect
            key={x}
            x={x}
            y="48"
            width="10"
            height="58"
            rx="1"
            fill={index % 2 ? '#7aa0c4' : '#d7e8f5'}
            stroke="#1a1f26"
            className={running ? 'filter-plate' : undefined}
            style={running ? { animationDelay: `${index * 0.12}s` } : undefined}
          />
        ))}
        <circle cx="31" cy="52" r="3" fill="#5ec8e8" className={running ? 'filter-flow' : undefined} />
        <circle cx="119" cy="96" r="3" fill="#5ec8e8" className={running ? 'filter-flow' : undefined} style={{ animationDelay: '0.6s' }} />
        <StatusDot status={data.status} />
      </svg>
    </EquipmentVisualFrame>
  );
}

/** Shell-and-tube heat exchanger. */
export function HeatExchangerVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const running = useRunning(props);

  return (
    <EquipmentVisualFrame {...props} svgWidth={160} svgHeight={130} showVolume={false}>
      <svg viewBox="0 0 160 130" width="100%" height="100%" aria-hidden>
        <defs>{steelGradient(uid)}</defs>
        <rect x="18" y="44" width="124" height="42" rx="16" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
        <rect x="8" y="54" width="16" height="22" rx="3" fill="#c96a6a" />
        <rect x="136" y="54" width="16" height="22" rx="3" fill="#6a9ec9" />
        {[56, 65, 74].map((y) => (
          <line key={y} x1="28" y1={y} x2="132" y2={y} stroke="#1a1f26" strokeWidth="2" opacity="0.35" />
        ))}
        {running && (
          <>
            <circle cx="36" cy="56" r="2.5" fill="#f97316" className="heat-exchanger-dot" />
            <circle cx="36" cy="74" r="2.5" fill="#38bdf8" className="heat-exchanger-dot" style={{ animationDelay: '0.5s' }} />
          </>
        )}
        <StatusDot status={data.status} />
      </svg>
    </EquipmentVisualFrame>
  );
}

/** Mixing tank with a turning agitator. */
export function MixerVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const running = useRunning(props);

  return (
    <EquipmentVisualFrame {...props} svgWidth={140} svgHeight={150} showVolume={false}>
      <svg viewBox="0 0 140 150" width="100%" height="100%" aria-hidden>
        <defs>
          {steelGradient(uid)}
          <linearGradient id={`${uid}-wash`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#8b7355" />
            <stop offset="100%" stopColor="#c4a574" />
          </linearGradient>
        </defs>
        <rect x="58" y="16" width="24" height="18" rx="3" fill={`url(#${uid}-steel)`} />
        <rect x="32" y="40" width="76" height="78" rx="8" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
        <rect x="38" y="70" width="64" height="40" rx="4" fill={`url(#${uid}-wash)`} opacity="0.85" />
        <g transform="translate(70 78)">
          <g className={running ? 'mixer-blade' : undefined}>
            <rect x="-3" y="-22" width="6" height="44" rx="2" fill="#e8fff9" opacity="0.85" />
            <rect x="-22" y="-3" width="44" height="6" rx="2" fill="#e8fff9" opacity="0.7" />
          </g>
        </g>
        <circle cx="70" cy="78" r="4" fill="#1a1f26" />
        <StatusDot status={data.status} />
      </svg>
    </EquipmentVisualFrame>
  );
}

/** Floor scale for weigh-ins. */
export function ScaleVisual(props: EquipmentVisualProps) {
  const { data } = props;
  const uid = useId().replace(/:/g, '');
  const running = useRunning(props);

  return (
    <EquipmentVisualFrame {...props} svgWidth={140} svgHeight={140} showVolume={false}>
      <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden>
        <defs>{steelGradient(uid)}</defs>
        <rect x="28" y="86" width="84" height="28" rx="4" fill={`url(#${uid}-steel)`} stroke="#1a1f26" />
        <rect x="36" y="58" width="68" height="24" rx="3" fill="#1a1f26" className={running ? 'scale-platform' : undefined} />
        <rect x="50" y="24" width="40" height="28" rx="4" fill="#2a3038" stroke="#5ec8e8" />
        <line
          x1="70"
          y1="38"
          x2="82"
          y2="28"
          stroke="#5ec8e8"
          strokeWidth="2"
          className={running ? 'scale-needle' : undefined}
        />
        <circle cx="70" cy="38" r="2.5" fill="#5ec8e8" />
        <StatusDot status={data.status} />
      </svg>
    </EquipmentVisualFrame>
  );
}
