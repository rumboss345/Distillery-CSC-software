import type { EquipmentVisualData } from './equipment-visual.types';
import { TankLevelBar } from './TankLevelBar';

interface TankLevelsPanelProps {
  tanks: EquipmentVisualData[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function TankLevelsPanel({ tanks, selectedId, onSelect }: TankLevelsPanelProps) {
  const active = tanks.filter((t) => t.currentVolumeGal > 0 || t.capacityGal > 0);

  return (
    <div className="process-panel card">
      <h4 className="process-panel-title">Tank Levels</h4>
      {active.length === 0 ? (
        <p className="process-panel-empty">No holding tanks configured.</p>
      ) : (
        <ul className="tank-level-list">
          {active.map((t) => (
            <li key={t.id}>
              <TankLevelBar
                tank={t}
                selected={selectedId === t.id}
                onClick={() => onSelect(t.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
