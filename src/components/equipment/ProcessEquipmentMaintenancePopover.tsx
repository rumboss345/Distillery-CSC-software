import { Link } from 'react-router-dom';
import {
  equipmentBlocksProduction,
  maintenanceStatusLabel,
} from '../../lib/equipment-maintenance';
import type { FloorEquipmentView } from '../../types';

interface ProcessEquipmentMaintenancePopoverProps {
  equipment: FloorEquipmentView;
  x: number;
  y: number;
  onClose: () => void;
}

export function ProcessEquipmentMaintenancePopover({
  equipment,
  x,
  y,
  onClose,
}: ProcessEquipmentMaintenancePopoverProps) {
  const status = equipment.maintenance_status;
  if (!status) return null;

  return (
    <>
      <button
        type="button"
        className="process-maintenance-popover-backdrop"
        aria-label="Close maintenance details"
        onClick={onClose}
      />
      <div
        className="process-maintenance-popover"
        style={{ left: x, top: y }}
        role="dialog"
        aria-labelledby="process-maintenance-popover-title"
      >
        <h5 id="process-maintenance-popover-title" className="process-maintenance-popover-title">
          {equipment.name}
        </h5>
        <p className="process-maintenance-popover-status">
          <span className="process-maintenance-popover-label">Status</span>
          {maintenanceStatusLabel(status)}
          {equipmentBlocksProduction(equipment) ? ' · not available for production' : ''}
        </p>
        {equipment.maintenance_notes ? (
          <p className="process-maintenance-popover-notes">{equipment.maintenance_notes}</p>
        ) : (
          <p className="process-maintenance-popover-notes process-maintenance-popover-notes--empty">
            No notes recorded.
          </p>
        )}
        <Link
          to="/equipment-maintenance"
          className="process-maintenance-popover-link"
          onClick={onClose}
        >
          Open Equipment Maintenance
        </Link>
      </div>
    </>
  );
}
