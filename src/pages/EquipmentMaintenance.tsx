import { useMemo, useState } from 'react';
import {
  getAllEquipmentMaintenanceLog,
  getAllFloorEquipment,
  getEquipmentMaintenanceLog,
  getFloorPlans,
  updateEquipmentMaintenance,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { AssigneeSelect } from '../components/AssigneeSelect';
import { EquipmentMaintenanceLogTable } from '../components/equipment/EquipmentMaintenanceLogTable';
import { equipmentTypeLabel } from '../lib/equipment';
import { equipmentCleaningStatusLabel, equipmentNeedsCleaning } from '../lib/equipment-cleaning';
import {
  equipmentBlocksProduction,
  groupEquipmentByCategory,
  MAINTENANCE_STATUS_OPTIONS,
  maintenanceStatusLabel,
} from '../lib/equipment-maintenance';
import type { AssignedEmployee } from '../lib/assignee';
import type { EquipmentMaintenanceStatus, FloorEquipment } from '../types';

const emptyAssignee = (): AssignedEmployee => ({
  assigned_user_id: null,
  assigned_user_name: null,
});

export function EquipmentMaintenance() {
  const { key, refresh } = useRefreshKey();
  const equipment = getAllFloorEquipment();
  const planNameById = useMemo(
    () => new Map(getFloorPlans().map((p) => [p.id, p.name])),
    [key],
  );
  void key;

  const groups = useMemo(() => groupEquipmentByCategory(equipment), [equipment]);
  const allLogEntries = useMemo(() => getAllEquipmentMaintenanceLog(300), [key]);

  const [editItem, setEditItem] = useState<FloorEquipment | null>(null);
  const [status, setStatus] = useState<EquipmentMaintenanceStatus>('broken');
  const [notes, setNotes] = useState('');
  const [recordedBy, setRecordedBy] = useState<AssignedEmployee>(emptyAssignee());

  const [returnItem, setReturnItem] = useState<FloorEquipment | null>(null);
  const [returnRecordedBy, setReturnRecordedBy] = useState<AssignedEmployee>(emptyAssignee());

  const [historyItem, setHistoryItem] = useState<FloorEquipment | null>(null);
  const historyEntries = historyItem ? getEquipmentMaintenanceLog(historyItem.id, 200) : [];

  const openEdit = (item: FloorEquipment) => {
    setEditItem(item);
    setStatus(item.maintenance_status ?? 'broken');
    setNotes(item.maintenance_notes ?? '');
    setRecordedBy(emptyAssignee());
  };

  const closeEdit = () => setEditItem(null);

  const handleSave = () => {
    if (!editItem) return;
    if (!recordedBy.assigned_user_id) {
      alert('Select who recorded this maintenance action.');
      return;
    }
    try {
      updateEquipmentMaintenance(
        editItem.id,
        status,
        notes,
        recordedBy.assigned_user_id,
        recordedBy.assigned_user_name ?? '',
      );
      closeEdit();
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save maintenance.');
    }
  };

  const handleReturnToService = () => {
    if (!returnItem || !returnRecordedBy.assigned_user_id) {
      alert('Select who returned this equipment to service.');
      return;
    }
    try {
      updateEquipmentMaintenance(
        returnItem.id,
        null,
        '',
        returnRecordedBy.assigned_user_id,
        returnRecordedBy.assigned_user_name ?? '',
      );
      setReturnItem(null);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not return to service.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Equipment Maintenance</h2>
        <p>
          Mark equipment broken or under maintenance to block production use and show a red X on the process view.
          After use, emptied equipment shows a mop on the process view until someone marks it cleaned.
          Every cleaning and maintenance action is stored in the traceable log below.
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
                      className="btn btn-sm btn-ghost"
                      onClick={() => setHistoryItem(item)}
                    >
                      History
                    </button>
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
                        onClick={() => {
                          setReturnItem(item);
                          setReturnRecordedBy(emptyAssignee());
                        }}
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

      <section className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Maintenance &amp; cleaning log</h3>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Newest first — includes automatic “needs cleaning” after production use and manual clean / repair entries.
        </p>
        <EquipmentMaintenanceLogTable entries={allLogEntries} showEquipment />
      </section>

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
            <div className="form-group form-group--full">
              <label>Recorded by</label>
              <AssigneeSelect value={recordedBy} onChange={setRecordedBy} required />
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

      {returnItem && (
        <Modal title={`Return to service — ${returnItem.name}`} onClose={() => setReturnItem(null)}>
          <p className="field-hint">Clears the maintenance tag and logs who returned this unit to production use.</p>
          <div className="form-group full-width">
            <label>Recorded by</label>
            <AssigneeSelect value={returnRecordedBy} onChange={setReturnRecordedBy} required />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setReturnItem(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleReturnToService}>
              Return to service
            </button>
          </div>
        </Modal>
      )}

      {historyItem && (
        <Modal wide title={`Maintenance history — ${historyItem.name}`} onClose={() => setHistoryItem(null)}>
          <EquipmentMaintenanceLogTable entries={historyEntries} />
        </Modal>
      )}
    </div>
  );
}
