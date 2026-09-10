import { useState } from 'react';
import {
  getFloorPlan,
  getFloorEquipmentWithContext,
  saveFloorEquipment,
  updateEquipmentPosition,
  deleteFloorEquipment,
  useRefreshKey,
} from '../db/queries';
import { FloorCanvas, FloorLegend } from '../components/FloorCanvas';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import {
  EQUIPMENT_TYPES,
  EQUIPMENT_STATUSES,
  TYPE_DEFAULTS,
  equipmentTypeLabel,
} from '../lib/equipment';
import type { EquipmentStatus, EquipmentType, FloorEquipment } from '../types';

const emptyEquipment = (planId: number, type: EquipmentType = 'fermenter'): Omit<FloorEquipment, 'id' | 'created_at'> => {
  const defaults = TYPE_DEFAULTS[type];
  return {
    floor_plan_id: planId,
    name: '',
    equipment_type: type,
    pos_x_ft: 4,
    pos_y_ft: 4,
    width_ft: defaults.width_ft,
    depth_ft: defaults.depth_ft,
    capacity_gal: defaults.capacity_gal,
    status: 'empty',
    linked_mash_batch_id: null,
    notes: '',
  };
};

export function FloorPlanPage() {
  const { key, refresh } = useRefreshKey();
  const plan = getFloorPlan();
  const equipment = getFloorEquipmentWithContext(plan.id);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyEquipment(plan.id));

  void key;

  const selected = equipment.find((e) => e.id === selectedId) ?? null;

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyEquipment(plan.id));
    setShowForm(true);
  };

  const openEdit = (item: FloorEquipment) => {
    setEditId(item.id);
    setForm({ ...item });
    setShowForm(true);
  };

  const handleTypeChange = (type: EquipmentType) => {
    const defaults = TYPE_DEFAULTS[type];
    setForm({
      ...form,
      equipment_type: type,
      width_ft: defaults.width_ft,
      depth_ft: defaults.depth_ft,
      capacity_gal: defaults.capacity_gal,
    });
  };

  const handleSave = () => {
    saveFloorEquipment(form, editId);
    setShowForm(false);
    refresh();
  };

  const handleDelete = (id: number) => {
    if (confirm('Remove this equipment from the floor plan?')) {
      deleteFloorEquipment(id);
      if (selectedId === id) setSelectedId(null);
      refresh();
    }
  };

  const handleMove = (id: number, x: number, y: number) => {
    updateEquipmentPosition(id, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    refresh();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Floor Plan</h2>
        <p>{plan.name} — {plan.width_ft} × {plan.height_ft} ft · Drag equipment to reposition</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ Add Equipment</button>
        </div>
      </div>

      <div className="floor-layout">
        <div className="floor-main">
          <FloorCanvas
            plan={plan}
            equipment={equipment}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMoveEnd={handleMove}
          />
          <FloorLegend />
        </div>

        <aside className="floor-sidebar">
          {selected ? (
            <div className="card">
              <h3 className="floor-sidebar-title">{selected.name}</h3>
              <dl className="floor-detail-list">
                <dt>Type</dt>
                <dd>{equipmentTypeLabel(selected.equipment_type)}</dd>
                <dt>Status</dt>
                <dd><StatusBadge status={selected.status.replace('_', ' ')} /></dd>
                <dt>Size</dt>
                <dd>{selected.width_ft} × {selected.depth_ft} ft</dd>
                {selected.capacity_gal > 0 && (
                  <>
                    <dt>Capacity</dt>
                    <dd>{selected.capacity_gal} gal</dd>
                  </>
                )}
                {selected.active_batch_number && (
                  <>
                    <dt>Active Batch</dt>
                    <dd>
                      {selected.active_batch_number}
                      {selected.active_volume_gal ? ` · ${selected.active_volume_gal} gal` : ''}
                    </dd>
                  </>
                )}
                {selected.equipment_type === 'fermenter' && selected.status === 'empty' && (
                  <dd className="form-hint" style={{ gridColumn: '1 / -1' }}>
                    Assign this fermenter from Mash & Fermentation.
                  </dd>
                )}
                {selected.notes && (
                  <>
                    <dt>Notes</dt>
                    <dd>{selected.notes}</dd>
                  </>
                )}
              </dl>
              <div className="floor-sidebar-actions">
                <button className="btn btn-sm btn-secondary" onClick={() => openEdit(selected)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(selected.id)}>Remove</button>
              </div>
            </div>
          ) : (
            <div className="card floor-sidebar-hint">
              <p>Click equipment on the floor plan to view details, or add new fermenters and stills.</p>
            </div>
          )}

          <div className="card">
            <h4 className="floor-list-title">All Equipment ({equipment.length})</h4>
            <ul className="floor-equipment-list">
              {equipment.map((item) => (
                <li key={item.id}>
                  <button
                    className={`floor-list-btn${selectedId === item.id ? ' active' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="floor-list-name">{item.name}</span>
                    <span className="floor-list-type">{equipmentTypeLabel(item.equipment_type)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {showForm && (
        <Modal title={editId ? 'Edit Equipment' : 'Add Equipment'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Fermenter #3" />
            </div>
            <div className="form-group">
              <label>Equipment Type</label>
              <select
                value={form.equipment_type}
                onChange={(e) => handleTypeChange(e.target.value as EquipmentType)}
              >
                {EQUIPMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EquipmentStatus })}
              >
                {EQUIPMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Capacity (gal)</label>
              <input
                type="number"
                step="1"
                value={form.capacity_gal || ''}
                onChange={(e) => setForm({ ...form, capacity_gal: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Width (ft)</label>
              <input
                type="number"
                step="0.5"
                value={form.width_ft || ''}
                onChange={(e) => setForm({ ...form, width_ft: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Depth (ft)</label>
              <input
                type="number"
                step="0.5"
                value={form.depth_ft || ''}
                onChange={(e) => setForm({ ...form, depth_ft: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Position X (ft)</label>
              <input
                type="number"
                step="0.5"
                value={form.pos_x_ft || ''}
                onChange={(e) => setForm({ ...form, pos_x_ft: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Position Y (ft)</label>
              <input
                type="number"
                step="0.5"
                value={form.pos_y_ft || ''}
                onChange={(e) => setForm({ ...form, pos_y_ft: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
