import type { TankVisualStatus } from './tank-visual.types';

export type TankVesselShape = 'holding' | 'stillage' | 'collection';

interface LiquidPaint {
  base: string;
  highlight: string;
  edge: string;
}

interface TankVesselArtProps {
  uid: string;
  shape: TankVesselShape;
  fillPercent: number;
  liquid: LiquidPaint;
  status: TankVisualStatus;
}

function SteelDefs({ uid, liquid }: { uid: string; liquid: LiquidPaint }) {
  return (
    <defs>
      <linearGradient id={`${uid}-steel`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#1b2128" />
        <stop offset="16%" stopColor="#5e6874" />
        <stop offset="38%" stopColor="#c5ced8" />
        <stop offset="50%" stopColor="#f4f7fb" />
        <stop offset="64%" stopColor="#8e99a6" />
        <stop offset="100%" stopColor="#2a313a" />
      </linearGradient>
      <linearGradient id={`${uid}-head`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#f7f9fc" />
        <stop offset="45%" stopColor="#b7c0cb" />
        <stop offset="100%" stopColor="#5c6672" />
      </linearGradient>
      <linearGradient id={`${uid}-dark`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#6d7783" />
        <stop offset="100%" stopColor="#2c333b" />
      </linearGradient>
      <linearGradient id={`${uid}-liquid`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor={liquid.edge} />
        <stop offset="32%" stopColor={liquid.base} />
        <stop offset="55%" stopColor={liquid.highlight} stopOpacity="0.9" />
        <stop offset="100%" stopColor={liquid.edge} />
      </linearGradient>
      <linearGradient id={`${uid}-surface`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="100%" stopColor={liquid.base} stopOpacity="0" />
      </linearGradient>
      <filter id={`${uid}-shadow`} x="-20%" y="-8%" width="140%" height="124%">
        <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.4" />
      </filter>
    </defs>
  );
}

function Liquid({
  uid,
  x,
  width,
  bottom,
  height,
  fillPercent,
  rx,
  ry,
}: {
  uid: string;
  x: number;
  width: number;
  bottom: number;
  height: number;
  fillPercent: number;
  rx: number;
  ry: number;
}) {
  const fillHeight = (Math.min(100, Math.max(0, fillPercent)) / 100) * height;
  const surfaceY = bottom - fillHeight;
  if (!(fillPercent > 0)) return null;
  return (
    <g clipPath={`url(#${uid}-clip)`}>
      <rect
        className="tank-visual-liquid"
        x={x}
        y={surfaceY}
        width={width}
        height={fillHeight}
        fill={`url(#${uid}-liquid)`}
        opacity="0.92"
      />
      {fillPercent > 2 && (
        <>
          <ellipse
            className="tank-visual-liquid-surface"
            cx={x + width / 2}
            cy={surfaceY}
            rx={rx}
            ry={ry}
            fill={`url(#${uid}-surface)`}
          />
          <ellipse
            cx={x + width / 2}
            cy={surfaceY}
            rx={rx}
            ry={ry}
            fill="none"
            stroke="#ffffff"
            strokeWidth="0.6"
            opacity="0.45"
          />
        </>
      )}
    </g>
  );
}

function StatusDot({ status, cx, cy }: { status: TankVisualStatus; cx: number; cy: number }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r="5"
      className={`tank-visual-status-dot tank-visual-status-dot--${status}`}
    />
  );
}

/** Closed vertical stainless storage tank with dished heads, a manway, and legs. */
function HoldingTank(props: TankVesselArtProps) {
  const { uid, fillPercent, status } = props;
  return (
    <svg className="tank-visual-svg" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <SteelDefs uid={uid} liquid={props.liquid} />
      <clipPath id={`${uid}-clip`}>
        <rect x="43" y="46" width="74" height="112" />
      </clipPath>
      <g filter={`url(#${uid}-shadow)`}>
        <line x1="56" y1="166" x2="48" y2="188" stroke="#3a424c" strokeWidth="5" strokeLinecap="round" />
        <line x1="104" y1="166" x2="112" y2="188" stroke="#3a424c" strokeWidth="5" strokeLinecap="round" />
        <rect x="42" y="186" width="14" height="4" rx="1" fill="#2a3038" />
        <rect x="104" y="186" width="14" height="4" rx="1" fill="#2a3038" />

        <ellipse cx="80" cy="156" rx="38" ry="12" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1" />
        <rect x="42" y="46" width="76" height="110" fill={`url(#${uid}-steel)`} />
        <rect x="42" y="82" width="76" height="2.4" fill="#1e242b" opacity="0.55" />
        <rect x="42" y="118" width="76" height="2.4" fill="#1e242b" opacity="0.55" />
        <rect x="50" y="50" width="7" height="100" rx="3" fill="#ffffff" opacity="0.16" />
        <ellipse cx="80" cy="46" rx="38" ry="14" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="1" />
        <rect x="42" y="46" width="76" height="110" fill="none" stroke="#1a1f26" strokeWidth="1.1" />

        <Liquid uid={uid} x={43} width={74} bottom={156} height={110} fillPercent={fillPercent} rx={34} ry={5} />

        <rect x="74" y="24" width="12" height="16" rx="1" fill={`url(#${uid}-dark)`} stroke="#1a1f26" strokeWidth="0.8" />
        <ellipse cx="80" cy="24" rx="11" ry="4" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="0.9" />
        <rect x="78" y="162" width="4" height="10" fill="#4a525c" />
        <circle cx="80" cy="174" r="5" fill="none" stroke="#8e99a6" strokeWidth="1.6" />
        <circle cx="80" cy="174" r="1.4" fill="#2a3038" />
      </g>
      <StatusDot status={status} cx={132} cy={40} />
    </svg>
  );
}

/** Cone-bottom process tank used for stillage, with a vented top. */
function StillageTank(props: TankVesselArtProps) {
  const { uid, fillPercent, status } = props;
  const body = 'M 36 54 H 124 V 122 L 80 176 L 36 122 Z';
  return (
    <svg className="tank-visual-svg" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <SteelDefs uid={uid} liquid={props.liquid} />
      <clipPath id={`${uid}-clip`}>
        <path d={body} />
      </clipPath>
      <g filter={`url(#${uid}-shadow)`}>
        <line x1="48" y1="124" x2="40" y2="188" stroke="#3a424c" strokeWidth="5" strokeLinecap="round" />
        <line x1="112" y1="124" x2="120" y2="188" stroke="#3a424c" strokeWidth="5" strokeLinecap="round" />
        <rect x="32" y="186" width="16" height="4" rx="1" fill="#2a3038" />
        <rect x="112" y="186" width="16" height="4" rx="1" fill="#2a3038" />

        <path d={body} fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1.15" strokeLinejoin="round" />
        <rect x="36" y="86" width="88" height="2.4" fill="#1e242b" opacity="0.5" />
        <rect x="48" y="58" width="6" height="62" rx="3" fill="#ffffff" opacity="0.14" />
        <ellipse cx="80" cy="54" rx="44" ry="13" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="1" />

        <Liquid uid={uid} x={36} width={88} bottom={176} height={122} fillPercent={fillPercent} rx={36} ry={5} />

        <rect x="76" y="28" width="8" height="20" fill={`url(#${uid}-dark)`} stroke="#1a1f26" strokeWidth="0.7" />
        <ellipse cx="80" cy="28" rx="9" ry="3.2" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="0.8" />
        <path d="M 72 176 H 88 L 84 184 H 76 Z" fill="#4a525c" stroke="#1a1f26" strokeWidth="0.6" />
      </g>
      <StatusDot status={status} cx={136} cy={48} />
    </svg>
  );
}

/** Low, wide stainless receiver for cuts and collection. */
function CollectionVessel(props: TankVesselArtProps) {
  const { uid, fillPercent, status } = props;
  return (
    <svg className="tank-visual-svg" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <SteelDefs uid={uid} liquid={props.liquid} />
      <clipPath id={`${uid}-clip`}>
        <rect x="28" y="86" width="104" height="72" />
      </clipPath>
      <g filter={`url(#${uid}-shadow)`}>
        <rect x="36" y="164" width="6" height="18" rx="1" fill="#3a424c" />
        <rect x="76" y="166" width="6" height="16" rx="1" fill="#3a424c" />
        <rect x="118" y="164" width="6" height="18" rx="1" fill="#3a424c" />
        <rect x="30" y="180" width="18" height="4" rx="1" fill="#2a3038" />
        <rect x="70" y="180" width="18" height="4" rx="1" fill="#2a3038" />
        <rect x="112" y="180" width="18" height="4" rx="1" fill="#2a3038" />

        <ellipse cx="80" cy="156" rx="54" ry="13" fill={`url(#${uid}-steel)`} stroke="#1a1f26" strokeWidth="1" />
        <rect x="26" y="86" width="108" height="70" fill={`url(#${uid}-steel)`} />
        <rect x="26" y="112" width="108" height="2.4" fill="#1e242b" opacity="0.5" />
        <rect x="34" y="90" width="7" height="58" rx="3" fill="#ffffff" opacity="0.16" />
        <ellipse cx="80" cy="86" rx="54" ry="14" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="1" />
        <rect x="26" y="86" width="108" height="70" fill="none" stroke="#1a1f26" strokeWidth="1.1" />

        <Liquid uid={uid} x={28} width={104} bottom={156} height={70} fillPercent={fillPercent} rx={48} ry={6} />

        <ellipse cx="80" cy="74" rx="22" ry="7" fill={`url(#${uid}-dark)`} stroke="#1a1f26" strokeWidth="0.9" />
        <rect x="76" y="58" width="8" height="14" fill={`url(#${uid}-dark)`} stroke="#1a1f26" strokeWidth="0.7" />
        <ellipse cx="80" cy="58" rx="8" ry="3" fill={`url(#${uid}-head)`} stroke="#1a1f26" strokeWidth="0.8" />
        <rect x="132" y="124" width="16" height="7" rx="2" fill="#4a525c" stroke="#1a1f26" strokeWidth="0.7" />
        <circle cx="150" cy="127.5" r="3.2" fill="none" stroke="#8e99a6" strokeWidth="1.3" />
      </g>
      <StatusDot status={status} cx={22} cy={70} />
    </svg>
  );
}

export function TankVesselArt(props: TankVesselArtProps) {
  if (props.shape === 'stillage') return <StillageTank {...props} />;
  if (props.shape === 'collection') return <CollectionVessel {...props} />;
  return <HoldingTank {...props} />;
}
