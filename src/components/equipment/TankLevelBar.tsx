import type { EquipmentVisualData } from './equipment-visual.types';
import { formatGal } from './equipment-visual-shared';

interface TankLevelBarProps {
  tank: EquipmentVisualData;
  selected?: boolean;
  onClick?: () => void;
}

export function TankLevelBar({ tank, selected, onClick }: TankLevelBarProps) {
  const pct = Math.round(tank.fillPercent);

  return (
    <button
      type="button"
      className={`tank-level-bar${selected ? ' tank-level-bar--selected' : ''}`}
      onClick={onClick}
    >
      <div className="tank-level-bar-header">
        <span className="tank-level-bar-name">{tank.name}</span>
        <span className="tank-level-bar-pct">{pct}%</span>
      </div>
      <div className="tank-level-bar-type">{tank.typeLabel}{tank.liquidName ? ` · ${tank.liquidName}` : ''}</div>
      <div className="tank-level-bar-vol">
        {formatGal(tank.currentVolumeGal)} / {formatGal(tank.capacityGal)} gal
        {tank.abv != null ? ` · ${tank.abv.toFixed(1)}% ABV` : ''}
      </div>
      <div className="tank-level-bar-track" aria-hidden>
        <div
          className={`tank-level-bar-fill tank-level-bar-fill--${tank.status}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}
