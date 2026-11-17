import {
  PROCESS_LIQUID_COLORS,
  spiritLiquidLabel,
  type SpiritLiquidClass,
} from './process-floor-label';

const LEGEND_ORDER: Exclude<SpiritLiquidClass, 'unknown'>[] = [
  'wash',
  'low_wine',
  'high_proof',
  'heads',
  'tails',
  'heavy_rum',
  'blend',
  'gin',
  'dunder',
  'stillage',
];

export function ProcessLiquidColorKey() {
  return (
    <div className="process-liquid-key" role="region" aria-label="Tank liquid color key">
      <p className="process-liquid-key-title">Liquid colors in tanks</p>
      <ul className="process-liquid-key-list">
        {LEGEND_ORDER.map((kind) => {
          const palette = PROCESS_LIQUID_COLORS[kind];
          const label = spiritLiquidLabel(kind);
          return (
            <li key={kind}>
              <span
                className="process-liquid-key-swatch"
                style={{
                  background: `linear-gradient(165deg, ${palette.highlight} 0%, ${palette.base} 55%, ${palette.edge} 100%)`,
                  borderColor: palette.edge,
                }}
                aria-hidden
              />
              <span className="process-liquid-key-label">{label}</span>
            </li>
          );
        })}
      </ul>
      <p className="field-hint process-liquid-key-note">
        Based on equipment name and what the ledger says is inside. Empty or unmatched tanks use grey or blue status colors.
        Fermenters use brown wash while fermenting and green when Brix is ready.
      </p>
    </div>
  );
}