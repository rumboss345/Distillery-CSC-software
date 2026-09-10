import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  getMashBatches,
  saveMashBatchWithFermenters,
  deleteMashBatch,
  getFermentationLogs,
  addFermentationLog,
  generateBatchNumber,
  getAvailableFermenters,
  getMashFermenterAssignments,
  getAllMashFermenterAssignments,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type { MashBatch, MashStatus } from '../types';

const STATUSES: MashStatus[] = ['planned', 'mashing', 'fermenting', 'complete', 'discarded'];

type LogFormState = { temperature_f: string; brix: string; ph: string; notes: string };

const emptyLogForm = (): LogFormState => ({
  temperature_f: '',
  brix: '',
  ph: '',
  notes: '',
});

function FermenterLogPanel({
  mashBatchId,
  equipmentId,
  equipmentName,
  volumeGal,
  refreshKey,
  onAdded,
}: {
  mashBatchId: number;
  equipmentId: number | null;
  equipmentName?: string;
  volumeGal?: number;
  refreshKey: number;
  onAdded: () => void;
}) {
  void refreshKey;
  const [logForm, setLogForm] = useState(emptyLogForm());
  const logs = getFermentationLogs(mashBatchId, equipmentId);

  const handleAddLog = () => {
    addFermentationLog({
      mash_batch_id: mashBatchId,
      floor_equipment_id: equipmentId,
      logged_at: new Date().toISOString(),
      temperature_f: logForm.temperature_f ? parseFloat(logForm.temperature_f) : null,
      brix: logForm.brix ? parseFloat(logForm.brix) : null,
      ph: logForm.ph ? parseFloat(logForm.ph) : null,
      notes: logForm.notes,
    });
    setLogForm(emptyLogForm());
    onAdded();
  };

  return (
    <div className="fermenter-log-panel">
      {equipmentName && (
        <h5 className="fermenter-log-title">
          {equipmentName}
          {volumeGal ? ` · ${volumeGal} gal` : ''}
        </h5>
      )}
      <div className="form-grid" style={{ marginBottom: '1rem' }}>
        <div className="form-group">
          <label>Temp (°F)</label>
          <input value={logForm.temperature_f} onChange={(e) => setLogForm({ ...logForm, temperature_f: e.target.value })} placeholder="72" inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Brix</label>
          <input value={logForm.brix} onChange={(e) => setLogForm({ ...logForm, brix: e.target.value })} placeholder="10.5" />
        </div>
        <div className="form-group">
          <label>pH</label>
          <input value={logForm.ph} onChange={(e) => setLogForm({ ...logForm, ph: e.target.value })} placeholder="4.2" />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <input value={logForm.notes} onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })} />
        </div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={handleAddLog}>+ Log Reading</button>

      {logs.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr><th>Time</th><th>Temp (°F)</th><th>Brix</th><th>pH</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{format(new Date(l.logged_at), 'MMM d HH:mm')}</td>
                  <td>{l.temperature_f ?? '—'}°F</td>
                  <td>{l.brix ?? '—'}°</td>
                  <td>{l.ph ?? '—'}</td>
                  <td>{l.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const emptyBatch = (): Omit<MashBatch, 'id' | 'created_at'> => ({
  batch_number: generateBatchNumber('M'),
  recipe_name: '',
  grain_type: '',
  grain_lbs: 0,
  water_gal: 0,
  yeast_strain: '',
  start_date: new Date().toISOString().slice(0, 10),
  target_brix: null,
  actual_brix: null,
  target_final_brix: null,
  actual_final_brix: null,
  status: 'planned',
  notes: '',
});

const emptyFermenterForm = () => ({
  split: false,
  fermenter1Id: '' as number | '',
  fermenter2Id: '' as number | '',
  volume1: 0,
  volume2: 0,
});

export function MashFermentation() {
  const { key, refresh } = useRefreshKey();
  const batches = getMashBatches();
  const allAssignments = getAllMashFermenterAssignments();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyBatch());
  const [fermenterForm, setFermenterForm] = useState(emptyFermenterForm());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  void key;

  const availableFermenters = getAvailableFermenters(editId);
  const availableFermenters2 = getAvailableFermenters(editId).filter(
    (f) => f.id !== fermenterForm.fermenter1Id,
  );

  useEffect(() => {
    if (fermenterForm.split && form.water_gal > 0) {
      const half = Math.round((form.water_gal / 2) * 10) / 10;
      setFermenterForm((prev) => ({
        ...prev,
        volume1: prev.volume1 || half,
        volume2: prev.volume2 || form.water_gal - half,
      }));
    } else if (!fermenterForm.split && form.water_gal > 0 && fermenterForm.fermenter1Id) {
      setFermenterForm((prev) => ({ ...prev, volume1: form.water_gal }));
    }
  }, [fermenterForm.split, form.water_gal, fermenterForm.fermenter1Id]);

  const loadFermenterForm = (mashId?: number) => {
    if (!mashId) {
      setFermenterForm(emptyFermenterForm());
      return;
    }
    const assignments = getMashFermenterAssignments(mashId);
    if (assignments.length === 0) {
      setFermenterForm(emptyFermenterForm());
      return;
    }
    if (assignments.length >= 2) {
      setFermenterForm({
        split: true,
        fermenter1Id: assignments[0].floor_equipment_id,
        fermenter2Id: assignments[1].floor_equipment_id,
        volume1: assignments[0].volume_gal,
        volume2: assignments[1].volume_gal,
      });
    } else {
      setFermenterForm({
        split: false,
        fermenter1Id: assignments[0].floor_equipment_id,
        fermenter2Id: '',
        volume1: assignments[0].volume_gal,
        volume2: 0,
      });
    }
  };

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyBatch());
    loadFermenterForm();
    setShowForm(true);
  };

  const openEdit = (batch: MashBatch) => {
    setEditId(batch.id);
    setForm({ ...batch });
    loadFermenterForm(batch.id);
    setShowForm(true);
  };

  const buildAssignments = () => {
    const assignments = [];
    if (fermenterForm.fermenter1Id) {
      assignments.push({
        equipmentId: Number(fermenterForm.fermenter1Id),
        volumeGal: fermenterForm.split ? fermenterForm.volume1 : (form.water_gal || fermenterForm.volume1),
      });
    }
    if (fermenterForm.split && fermenterForm.fermenter2Id) {
      assignments.push({
        equipmentId: Number(fermenterForm.fermenter2Id),
        volumeGal: fermenterForm.volume2,
      });
    }
    return assignments;
  };

  const handleSave = () => {
    if (fermenterForm.split && fermenterForm.fermenter1Id && fermenterForm.fermenter2Id) {
      const total = fermenterForm.volume1 + fermenterForm.volume2;
      if (form.water_gal > 0 && Math.abs(total - form.water_gal) > 0.5) {
        if (!confirm(`Split volumes (${total} gal) don't match wash volume (${form.water_gal} gal). Save anyway?`)) {
          return;
        }
      }
    }
    saveMashBatchWithFermenters(form, buildAssignments(), editId);
    setShowForm(false);
    refresh();
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this mash batch?')) {
      deleteMashBatch(id);
      if (selectedId === id) setSelectedId(null);
      refresh();
    }
  };

  const getBatchFermenters = (mashId: number) =>
    allAssignments.filter((a) => a.mash_batch_id === mashId);

  const selectedAssignments = selectedId ? getMashFermenterAssignments(selectedId) : [];
  const selectedBatch = batches.find((b) => b.id === selectedId);

  return (
    <div>
      <div className="page-header">
        <h2>Mash & Fermentation</h2>
        <p>Grain in lbs, wash in gallons, fermentation temperature in °F</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ New Mash Batch</button>
        </div>
      </div>

      {batches.length === 0 ? (
        <div className="empty-state">
          <p>No mash batches recorded yet.</p>
          <button className="btn btn-primary" onClick={openNew} style={{ marginTop: '1rem' }}>
            Create your first batch
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Recipe</th>
                <th>Grain (lbs)</th>
                <th>Water (gal)</th>
                <th>Fermenter(s)</th>
                <th>Start → Final Brix</th>
                <th>Started</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const fermenters = getBatchFermenters(b.id);
                return (
                  <tr key={b.id}>
                    <td><strong>{b.batch_number}</strong></td>
                    <td>{b.recipe_name}</td>
                    <td>{b.grain_lbs} lbs</td>
                    <td>{b.water_gal} gal</td>
                    <td>
                      {fermenters.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        fermenters.map((f) => (
                          <span key={f.id} className="fermenter-tag">
                            {f.equipment_name}{f.volume_gal > 0 ? ` (${f.volume_gal} gal)` : ''}
                          </span>
                        ))
                      )}
                    </td>
                    <td>
                      {b.actual_brix ?? b.target_brix ?? '—'} → {b.actual_final_brix ?? b.target_final_brix ?? '—'}
                    </td>
                    <td>{format(new Date(b.start_date), 'MMM d, yyyy')}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td className="td-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => setSelectedId(b.id === selectedId ? null : b.id)}>
                        Logs
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(b)}>Edit</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(b.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && selectedBatch && (
        <div className="detail-panel">
          <h4>Fermentation Logs — {selectedBatch.batch_number}</h4>
          {selectedAssignments.length > 1 ? (
            <div className="fermenter-log-stack">
              {selectedAssignments.map((a) => (
                <FermenterLogPanel
                  key={a.floor_equipment_id}
                  mashBatchId={selectedId}
                  equipmentId={a.floor_equipment_id}
                  equipmentName={a.equipment_name}
                  volumeGal={a.volume_gal}
                  refreshKey={key}
                  onAdded={refresh}
                />
              ))}
            </div>
          ) : (
            <FermenterLogPanel
              mashBatchId={selectedId}
              equipmentId={selectedAssignments[0]?.floor_equipment_id ?? null}
              equipmentName={selectedAssignments[0]?.equipment_name}
              volumeGal={selectedAssignments[0]?.volume_gal}
              refreshKey={key}
              onAdded={refresh}
            />
          )}
        </div>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Mash Batch' : 'New Mash Batch'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Batch Number</label>
              <input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Recipe Name</label>
              <input value={form.recipe_name} onChange={(e) => setForm({ ...form, recipe_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Grain Type</label>
              <input value={form.grain_type} onChange={(e) => setForm({ ...form, grain_type: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Grain (lbs)</label>
              <input type="number" min="0" step="0.1" value={form.grain_lbs || ''} onChange={(e) => setForm({ ...form, grain_lbs: parseFloat(e.target.value) || 0 })} placeholder="400" />
            </div>
            <div className="form-group">
              <label>Water (gal)</label>
              <input type="number" step="0.1" value={form.water_gal || ''} onChange={(e) => setForm({ ...form, water_gal: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Yeast Strain</label>
              <input value={form.yeast_strain} onChange={(e) => setForm({ ...form, yeast_strain: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MashStatus })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group full-width fermenter-section">
              <label>Fermenter Assignment</label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={fermenterForm.split}
                  onChange={(e) => setFermenterForm({
                    ...fermenterForm,
                    split: e.target.checked,
                    fermenter2Id: '',
                    volume2: 0,
                  })}
                />
                Split wash across 2 fermenters
              </label>
            </div>

            <div className="form-group">
              <label>{fermenterForm.split ? 'Fermenter 1' : 'Fermenter'}</label>
              <select
                value={fermenterForm.fermenter1Id}
                onChange={(e) => setFermenterForm({
                  ...fermenterForm,
                  fermenter1Id: e.target.value ? parseInt(e.target.value) : '',
                  volume1: fermenterForm.split ? fermenterForm.volume1 : form.water_gal,
                })}
              >
                <option value="">— Select fermenter —</option>
                {availableFermenters.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.capacity_gal} gal)</option>
                ))}
              </select>
            </div>

            {fermenterForm.split ? (
              <>
                <div className="form-group">
                  <label>Volume in Fermenter 1 (gal)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={fermenterForm.volume1 || ''}
                    onChange={(e) => setFermenterForm({ ...fermenterForm, volume1: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label>Fermenter 2</label>
                  <select
                    value={fermenterForm.fermenter2Id}
                    onChange={(e) => setFermenterForm({
                      ...fermenterForm,
                      fermenter2Id: e.target.value ? parseInt(e.target.value) : '',
                    })}
                  >
                    <option value="">— Select fermenter —</option>
                    {availableFermenters2.map((f) => (
                      <option key={f.id} value={f.id}>{f.name} ({f.capacity_gal} gal)</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Volume in Fermenter 2 (gal)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={fermenterForm.volume2 || ''}
                    onChange={(e) => setFermenterForm({ ...fermenterForm, volume2: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </>
            ) : null}

            <div className="form-group">
              <label>Target Start Brix</label>
              <input type="number" step="0.1" value={form.target_brix ?? ''} onChange={(e) => setForm({ ...form, target_brix: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="form-group">
              <label>Actual Start Brix</label>
              <input type="number" step="0.1" value={form.actual_brix ?? ''} onChange={(e) => setForm({ ...form, actual_brix: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="form-group">
              <label>Target Final Brix</label>
              <input type="number" step="0.1" value={form.target_final_brix ?? ''} onChange={(e) => setForm({ ...form, target_final_brix: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="form-group">
              <label>Actual Final Brix</label>
              <input type="number" step="0.1" value={form.actual_final_brix ?? ''} onChange={(e) => setForm({ ...form, actual_final_brix: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <p className="form-hint">Assigned fermenters show as <strong>in use</strong> on the floor plan until this mash is charged to a still.</p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save Batch</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
