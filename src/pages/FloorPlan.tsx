import { useEffect, useState } from 'react';
import {
  getFloorPlans,
  getFloorPlan,
  getFloorEquipmentWithContext,
  getHoldingTanksWithContents,
  addFloorPlan,
  saveFloorEquipment,
  updateEquipmentPosition,
  moveEquipmentToPlan,
  deleteFloorEquipment,
  emptyAllHoldingTanks,
  useRefreshKey,
} from '../db/queries';
import { FloorCanvas, FloorLegend } from '../components/FloorCanvas';
import { HoldingTankIntakeHistory } from '../components/HoldingTankIntakeHistory';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { holdingTankIntakeKey } from '../db/queries';
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
  const plans = getFloorPlans();
  const [activePlanId, setActivePlanId] = useState(plans[0]?.id ?? 1);
  const plan = getFloorPlan(activePlanId);
  const equipment = getFloorEquipmentWithContext(activePlanId);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPageForm, setShowPageForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyEquipment(activePlanId));
  const [pageName, setPageName] = useState('');
  const [draggingEquipmentId, setDraggingEquipmentId] = useState<number | null>(null);
  const [dropTargetPlanId, setDropTargetPlanId] = useState<number | null>(null);
  const [selectedIntakeKey, setSelectedIntakeKey] = useState<string | null>(null);

  void key;

  const selectEquipment = (id: number | null) => {
    setSelectedId(id);
    setSelectedIntakeKey(null);
  };

  useEffect(() => {
    if (!draggingEquipmentId) {
      setDropTargetPlanId(null);
      return;
    }
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tab = el?.closest('[data-plan-drop-id]') as HTMLElement | null;
      setDropTargetPlanId(tab ? Number(tab.dataset.planDropId) : null);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [draggingEquipmentId]);

  const selected = equipment.find((e) => e.id === selectedId) ?? null;

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyEquipment(activePlanId));
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

  const handleAddPage = () => {
    const trimmed = pageName.trim();
    if (!trimmed) return;
    const newId = addFloorPlan(trimmed, plan.width_ft, plan.height_ft);
    setPageName('');
    setShowPageForm(false);
    setActivePlanId(newId);
    refresh();
  };

  const handleDelete = (id: number) => {
    if (confirm('Remove this equipment from the floor plan?')) {
      deleteFloorEquipment(id);
      if (selectedId === id) selectEquipment(null);
      refresh();
    }
  };

  const handleMove = (id: number, x: number, y: number) => {
    updateEquipmentPosition(id, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    refresh();
  };

  const handleMoveToPlan = (equipmentId: number, targetPlanId: number) => {
    moveEquipmentToPlan(equipmentId, targetPlanId);
    if (selectedId === equipmentId) selectEquipment(null);
    setActivePlanId(targetPlanId);
    refresh();
  };

  const handleListDragStart = (e: React.DragEvent, equipmentId: number) => {
    e.dataTransfer.setData('text/equipment-id', String(equipmentId));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingEquipmentId(equipmentId);
  };

  const handleListDragEnd = () => {
    setDraggingEquipmentId(null);
    setDropTargetPlanId(null);
  };

  const handleTabDragOver = (e: React.DragEvent, planId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetPlanId(planId);
  };

  const handleTabDragLeave = () => {
    setDropTargetPlanId(null);
  };

  const tanksWithSpirit = getHoldingTanksWithContents().filter((t) => t.volume_gal > 0);

  const handleEmptyAllTanks = () => {
    if (tanksWithSpirit.length === 0) {
      alert('All holding tanks are already empty.');
      return;
    }
    const tankList = tanksWithSpirit
      .map((t) => `${t.name} (${t.volume_gal.toFixed(1)} gal)`)
      .join('\n');
    if (!confirm(
      `Empty all holding tanks?\n\nThis clears tank spirit from:\n${tankList}\n\n`
      + 'Distillation cut records stay, but tank volumes, transfers, and blend draws are zeroed. '
      + 'This cannot be undone.',
    )) {
      return;
    }
    const result = emptyAllHoldingTanks();
    selectEquipment(null);
    refresh();
    alert(
      `All holding tanks emptied.\n\n`
      + `${result.transfersRemoved} transfer(s) removed\n`
      + `${result.cutsCleared} cut(s) cleared from tanks\n`
      + `${result.runsCleared} low-wines charge(s) cleared\n`
      + `${result.blendsCleared} blend draw(s) cleared`,
    );
  };

  const handleTabDrop = (e: React.DragEvent, targetPlanId: number) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/equipment-id');
    const equipmentId = raw ? parseInt(raw, 10) : draggingEquipmentId;
    if (equipmentId && targetPlanId !== activePlanId) {
      handleMoveToPlan(equipmentId, targetPlanId);
    }
    setDraggingEquipmentId(null);
    setDropTargetPlanId(null);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Floor Plan</h2>
        <p>{plan.name} — {plan.width_ft} × {plan.height_ft} ft · Drag equipment to reposition or drop on another page tab</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ Add Equipment</button>
          <button className="btn btn-secondary" onClick={() => { setPageName(''); setShowPageForm(true); }}>+ Add Page</button>
          {tanksWithSpirit.length > 0 && (
            <button className="btn btn-secondary" onClick={handleEmptyAllTanks}>Empty All Tanks</button>
          )}
        </div>
      </div>

      <div className="floor-plan-tabs">
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            data-plan-drop-id={p.id}
            className={`floor-plan-tab${activePlanId === p.id ? ' active' : ''}${dropTargetPlanId === p.id ? ' drop-target' : ''}`}
            onClick={() => { setActivePlanId(p.id); selectEquipment(null); }}
            onDragOver={(e) => handleTabDragOver(e, p.id)}
            onDragLeave={handleTabDragLeave}
            onDrop={(e) => handleTabDrop(e, p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="floor-layout">
        <div className="floor-main">
          <FloorCanvas
            plan={plan}
            equipment={equipment}
            selectedId={selectedId}
            onSelect={selectEquipment}
            onMoveEnd={handleMove}
            onMoveToPlan={handleMoveToPlan}
            onDragChange={setDraggingEquipmentId}
          />
          <FloorLegend />
          {draggingEquipmentId && (
            <p className="form-hint floor-drag-hint">Drop on a page tab above to move equipment to Inside, Outside, or another page.</p>
          )}
        </div>

        <aside className="floor-sidebar">
          {selected ? (
            <div className="card">
              <h3 className="floor-sidebar-title">{selected.name}</h3>
              <dl className="floor-detail-list">
                <dt>Page</dt>
                <dd>{plan.name}</dd>
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
                {selected.equipment_type === 'holding_tank' && selected.active_volume_gal != null && selected.active_volume_gal > 0 && (
                  <>
                    <dt>Contents</dt>
                    <dd>
                      {selected.active_volume_gal.toFixed(1)} gal
                      {selected.active_abv != null ? ` @ ${selected.active_abv.toFixed(1)}% ABV` : ''}
                      {selected.active_run_count ? ` · ${selected.active_run_count} run${selected.active_run_count === 1 ? '' : 's'}` : ''}
                    </dd>
                  </>
                )}
                {selected.equipment_type === 'fermenter' && selected.status === 'empty' && (
                  <dd className="form-hint" style={{ gridColumn: '1 / -1' }}>
                    Assign this fermenter from Wash & Fermentation.
                  </dd>
                )}
                {selected.notes && (
                  <>
                    <dt>Notes</dt>
                    <dd>{selected.notes}</dd>
                  </>
                )}
              </dl>
              {selected.equipment_type === 'holding_tank' && (
                <HoldingTankIntakeHistory
                  tankId={selected.id}
                  selectedKey={selectedIntakeKey}
                  title="Where it came from"
                  emptyMessage="No cuts or transfers into this tank yet."
                  onSelect={(entry) => {
                    setSelectedIntakeKey(
                      selectedIntakeKey === holdingTankIntakeKey(entry)
                        ? null
                        : holdingTankIntakeKey(entry),
                    );
                  }}
                />
              )}
              <div className="floor-sidebar-actions">
                <button className="btn btn-sm btn-secondary" onClick={() => openEdit(selected)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(selected.id)}>Remove</button>
              </div>
            </div>
          ) : (
            <div className="card floor-sidebar-hint">
              <p>Click equipment on the floor plan to view details, or drag items to another page tab.</p>
            </div>
          )}

          <div className="card">
            <h4 className="floor-list-title">Equipment on {plan.name} ({equipment.length})</h4>
            <ul className="floor-equipment-list">
              {equipment.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    draggable
                    className={`floor-list-btn${selectedId === item.id ? ' active' : ''}${draggingEquipmentId === item.id ? ' dragging' : ''}`}
                    onClick={() => selectEquipment(item.id)}
                    onDragStart={(e) => handleListDragStart(e, item.id)}
                    onDragEnd={handleListDragEnd}
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
              <label>Page</label>
              <select
                value={form.floor_plan_id}
                onChange={(e) => setForm({ ...form, floor_plan_id: parseInt(e.target.value, 10) })}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
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

      {showPageForm && (
        <Modal title="Add Floor Plan Page" onClose={() => setShowPageForm(false)}>
          <div className="form-group">
            <label>Page Name</label>
            <input
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder="e.g. Warehouse, Tank farm"
              autoFocus
            />
          </div>
          <p className="form-hint">Default pages are <strong>Inside</strong> and <strong>Outside</strong>. Add more as needed.</p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowPageForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddPage} disabled={!pageName.trim()}>Add Page</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
