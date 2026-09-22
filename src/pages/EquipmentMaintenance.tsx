import { useMemo, useState } from 'react';
import {
  getAllFloorEquipment,
  getFloorPlans,
  updateEquipmentMaintenance,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { equipmentTypeLabel } from '../lib/equipment';
import { equipmentCleaningStatusLabel, equipmentNeedsCleaning } from '../lib/equipment-cleaning';
import {
  equipmentBlocksProduction,
  groupEquipmentByCategory,
  MAINTENANCE_STATUS_OPTIONS,
  maintenanceStatusLabel,
} from '../lib/equipment-maintenance';
import type { EquipmentMaintenanceStatus, FloorEquipment } from '../types';

export function EquipmentMaintenance() {
  const { key, refresh } = useRefreshKey();
  const equipment = getAllFloorEquipment();
  const planNameById = useMemo(
    () => new Map(getFloorPlans().map((p) => [p.id, p.name])),
    [key],
  );
  void key;

  const groups = useMemo(() => groupEquipmentByCategory(equipment), [equipment]);

  const [editItem, setEditItem] = useState<FloorEquipment | null>(null);
  const [status, setStatus] = useState<EquipmentMaintenanceStatus>('broken');
  const [notes, setNotes] = useState('');

  const openEdit = (item: FloorEquipment) => {
    setEditItem(item);
    setStatus(item.maintenance_status ?? 'broken');
    setNotes(item.maintenance_notes ?? '');
  };

  const closeEdit = () => setEditItem(null);

  const handleSave = () => {
    if (!editItem) return;
    updateEquipmentMaintenance(editItem.id, status, notes);
    closeEdit();
    refresh();
  };

  const handleReturnToService = (item: FloorEquipment) => {
    if (!confirm(`Return ${item.name} to service?`)) return;
    updateEquipmentMaintenance(item.id, null, '');
    refresh();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Equipment Maintenance</h2>
        <p>
          Mark equipment broken or under maintenance to block production use and show a red X on the process view.
          After use, emptied equipment shows a mop on the process view until someone marks it cleaned.
          Suggested repairs show a wrench in the upper-left; right-click tagged equipment there to view details.
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.type} className="card equipment-maintenance-section">
          <h3 className="equipment-maintenance-category">{group.label}</h3>
          <ul className="equipment-maintenance-list">
            {group.items.map((item) => {
              const blocked = equipmentBlocksProduction(item);
              const dirty = equipmentNeedsCleaning(item);
              const statusLabel = dirty
                ? equipmentCleaningStatusLabel()
                : maintenanceStatusLabel(item.maintenance_status);
              return (
                <li key={item.id} className="equipment-maintenance-row">
                  <div className="equipment-maintenance-row-main">
                    <span className="equipment-maintenance-name">{item.name}</span>
                    <span className="equipment-maintenance-meta">
                      {equipmentTypeLabel(item.equipment_type)}
                      {' · '}
                      {planNameById.get(item.floor_plan_id) ?? 'Floor plan'}
                      {item.capacity_gal > 0 ? ` · ${item.capacity_gal} gal` : ''}
                    </span>
                    {item.maintenance_notes && (
                      <p className="equipment-maintenance-notes">{item.maintenance_notes}</p>
                    )}
                  </div>
                  <div className="equipment-maintenance-row-actions">
                    <span
                      className={`badge equipment-maintenance-badge${
                        blocked
                          ? ' equipment-maintenance-badge--blocked'
                          : dirty
                            ? ' equipment-maintenance-badge--note'
                            : item.maintenance_status === 'repair_note'
                              ? ' equipment-maintenance-badge--note'
                              : ''
                      }`}
                    >
                      {statusLabel}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => openEdit(item)}
                    >
                      {item.maintenance_status ? 'Update' : 'Mark issue'}
                    </button>
                    {item.maintenance_status && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleReturnToService(item)}
                      >
                        Return to service
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editItem && (
        <Modal title={`Maintenance — ${editItem.name}`} onClose={closeEdit}>
          <div className="form-grid">
            <div className="form-group form-group--full">
              <label>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EquipmentMaintenanceStatus)}
              >
                {MAINTENANCE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                    {opt.blocksProduction ? ' (blocks use)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group form-group--full">
              <label>Notes / suggested repairs</label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe the issue, parts needed, or repair steps…"
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeEdit}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
