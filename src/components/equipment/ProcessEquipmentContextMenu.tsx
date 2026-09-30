import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  equipmentBlocksProduction,
  equipmentHasMaintenanceTag,
  maintenanceStatusLabel,
} from '../../lib/equipment-maintenance';
import type { FloorEquipmentView } from '../../types';
import type { ProcessEquipmentContextMenuModel } from './process-equipment-menu';

interface ProcessEquipmentContextMenuProps {
  equipment: FloorEquipmentView;
  menu: ProcessEquipmentContextMenuModel;
  x: number;
  y: number;
  onClose: () => void;
}

export function ProcessEquipmentContextMenu({
  equipment,
  menu,
  x,
  y,
  onClose,
}: ProcessEquipmentContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const tagged = equipmentHasMaintenanceTag(equipment);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x + 8;
    let top = y + 8;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [menu, x, y]);

  return (
    <>
      <button
        type="button"
        className="process-maintenance-popover-backdrop"
        aria-label="Close equipment menu"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        className="process-context-menu"
        style={{ left: x, top: y }}
        role="menu"
        aria-label={`${equipment.name} actions`}
      >
        <h5 className="process-context-menu-title">{equipment.name}</h5>

        {menu.next.length > 0 && (
          <div className="process-context-menu-section">
            <div className="process-context-menu-label">Next step</div>
            {menu.hint && <p className="process-context-menu-hint">{menu.hint}</p>}
            {menu.next.map((item) => (
              <Link
                key={item.key}
                role="menuitem"
                className="process-context-menu-item"
                to={item.to}
                onClick={onClose}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}

        {menu.records.length > 0 && (
          <div className="process-context-menu-section">
            {menu.records.map((item) => (
              <Link
                key={item.key}
                role="menuitem"
                className="process-context-menu-item"
                to={item.to}
                onClick={onClose}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}

        <div className="process-context-menu-section">
          {tagged && (
            <>
              <div className="process-context-menu-label">Equipment Maintenance</div>
              <p className="process-context-menu-status">
                {maintenanceStatusLabel(equipment.maintenance_status)}
                {equipmentBlocksProduction(equipment) ? ' · not available for production' : ''}
              </p>
              {equipment.maintenance_notes ? (
                <p className="process-context-menu-notes">{equipment.maintenance_notes}</p>
              ) : (
                <p className="process-context-menu-notes process-context-menu-notes--empty">
                  No notes recorded.
                </p>
              )}
            </>
          )}
          <Link
            role="menuitem"
            className="process-context-menu-item"
            to={menu.maintenance.to}
            onClick={onClose}
          >
            {tagged ? 'Open Equipment Maintenance' : menu.maintenance.label}
          </Link>
        </div>
      </div>
    </>
  );
}
