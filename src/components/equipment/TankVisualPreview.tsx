import type { FloorEquipmentView } from '../../types';
import { TankVisual } from './TankVisual';
import { tankVisualDataFromEquipment } from './tank-visual-data';

interface TankVisualPreviewProps {
  tank: FloorEquipmentView;
  selected?: boolean;
  onSelect?: (id: number) => void;
}

/**
 * First-pass demo wrapper — one real tank from the ledger on an industrial SCADA-style stage.
 * Does not replace the existing floor canvas.
 */
export function TankVisualPreview({ tank, selected, onSelect }: TankVisualPreviewProps) {
  const visualData = tankVisualDataFromEquipment(tank);

  return (
    <section className="equipment-visual-preview" aria-label="Equipment visual first pass preview">
      <header className="equipment-visual-preview-header">
        <h3>
          Equipment Visual — First Pass
          <span className="equipment-visual-preview-badge">Preview</span>
        </h3>
        <p>
          Real-time tank level from the liquid ledger · Click to open the existing detail panel
        </p>
      </header>
      <div className="equipment-visual-preview-stage">
        <TankVisual
          tank={visualData}
          selected={selected}
          size="lg"
          onClick={() => onSelect?.(tank.id)}
        />
        <p className="equipment-visual-preview-note">
          Prototype component using live data for <strong>{tank.name}</strong>.
          {' '}Full process layout, piping, and tank panel will follow after visual approval.
        </p>
      </div>
    </section>
  );
}
