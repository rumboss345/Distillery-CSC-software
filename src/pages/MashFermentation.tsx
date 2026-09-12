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
  getInventoryByCategory,
  getLatestFermentationBrix,
  getRecipes,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { estimateAbvFromBrix, estimateSugarWash, formatAbvEstimate } from '../lib/fermentation';
import type { MashBatch, MashStatus } from '../types';

const STATUSES: MashStatus[] = ['planned', 'mashing', 'fermenting', 'complete', 'discarded'];

const STATUS_LABELS: Record<MashStatus, string> = {
  planned: 'planned',
  mashing: 'washing',
  fermenting: 'fermenting',
  complete: 'complete',
  discarded: 'discarded',
};

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
  startBrix,
  refreshKey,
  onAdded,
}: {
  mashBatchId: number;
  equipmentId: number | null;
  equipmentName?: string;
  volumeGal?: number;
  startBrix: number | null;
  refreshKey: number;
  onAdded: () => void;
}) {
  void refreshKey;
  const [logForm, setLogForm] = useState(emptyLogForm());
  const logs = getFermentationLogs(mashBatchId, equipmentId);
  const currentBrix = logs.find((l) => l.brix != null)?.brix ?? null;
  const currentAbv = startBrix != null && currentBrix != null
    ? estimateAbvFromBrix(startBrix, currentBrix)
    : null;

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
          {currentBrix != null ? ` · current ${currentBrix}° Brix` : ''}
          {currentAbv != null ? ` · est. ${formatAbvEstimate(currentAbv)} ABV` : ''}
        </h5>
      )}
      <p className="form-hint">
        Estimated ABV uses starting Brix ({startBrix ?? 'set actual start Brix on the wash'}) vs each log’s Brix.
      </p>
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
              <tr><th>Time</th><th>Temp (°F)</th><th>Brix</th><th>Est. ABV</th><th>pH</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{format(new Date(l.logged_at), 'MMM d HH:mm')}</td>
                  <td>{l.temperature_f ?? '—'}°F</td>
                  <td>{l.brix ?? '—'}°</td>
                  <td>
                    {startBrix != null && l.brix != null
                      ? formatAbvEstimate(estimateAbvFromBrix(startBrix, l.brix))
                      : '—'}
                  </td>
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
  batch_number: generateBatchNumber('W'),
  recipe_name: '',
  grain_type: '',
  grain_lbs: 0,
  water_gal: 0,
  yeast_strain: '',
  yeast_lbs: 0,
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

  const sugarItems = getInventoryByCategory('sugar');
  const yeastItems = getInventoryByCategory('yeast');
  const recipes = getRecipes();
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
    setForm({ ...batch, yeast_lbs: batch.yeast_lbs ?? 0 });
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
        if (!confirm(`Split volumes (${total} gal) don't match batch size (${form.water_gal} gal). Save anyway?`)) {
          return;
        }
      }
    }

    const previous = editId ? batches.find((b) => b.id === editId) : undefined;
    const sugarItem = sugarItems.find((i) => i.name === form.grain_type);
    const yeastItem = yeastItems.find((i) => i.name === form.yeast_strain);
    const sugarNeeded = form.grain_lbs - (previous && previous.grain_type === form.grain_type ? previous.grain_lbs : 0);
    const yeastNeeded = form.yeast_lbs - (previous && previous.yeast_strain === form.yeast_strain ? previous.yeast_lbs : 0);

    if (sugarItem && sugarNeeded > sugarItem.quantity + 0.0001) {
      if (!confirm(`${form.grain_type} inventory is ${sugarItem.quantity} ${sugarItem.unit}, but this batch uses ${form.grain_lbs} lbs. Save anyway?`)) {
        return;
      }
    }
    if (yeastItem && yeastNeeded > yeastItem.quantity + 0.0001) {
      if (!confirm(`${form.yeast_strain} inventory is ${yeastItem.quantity} ${yeastItem.unit}, but this batch uses ${form.yeast_lbs} lbs. Save anyway?`)) {
        return;
      }
    }

    saveMashBatchWithFermenters(form, buildAssignments(), editId);
    setShowForm(false);
    refresh();
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this wash batch?')) {
      deleteMashBatch(id);
      if (selectedId === id) setSelectedId(null);
      refresh();
    }
  };

  const getBatchFermenters = (mashId: number) =>
    allAssignments.filter((a) => a.mash_batch_id === mashId);

  const selectedAssignments = selectedId ? getMashFermenterAssignments(selectedId) : [];
  const selectedBatch = batches.find((b) => b.id === selectedId);
  const canLogSelectedBatch = selectedBatch?.status === 'fermenting';

  useEffect(() => {
    if (selectedId && !canLogSelectedBatch) {
      setSelectedId(null);
    }
  }, [selectedId, canLogSelectedBatch]);

  const selectedStartBrix = selectedBatch
    ? selectedBatch.actual_brix ?? selectedBatch.target_brix
    : null;
  const sugarWash = estimateSugarWash(form.grain_lbs, form.water_gal);

  return (
    <div>
      <div className="page-header">
        <h2>Wash & Fermentation</h2>
        <p>Sugar type in lbs, wash in gallons, fermentation temperature in °F</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ New Wash Batch</button>
        </div>
      </div>

      {batches.length === 0 ? (
        <div className="empty-state">
          <p>No wash batches recorded yet.</p>
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
                <th>Sugar (lbs)</th>
                <th>Batch Size</th>
                <th>Fermenter(s)</th>
                <th>Start → Current Brix</th>
                <th>Est. ABV</th>
                <th>Started</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const fermenters = getBatchFermenters(b.id);
                const startBrix = b.actual_brix ?? b.target_brix;
                const currentBrix = getLatestFermentationBrix(b.id) ?? b.actual_final_brix;
                const estAbv = startBrix != null && currentBrix != null
                  ? estimateAbvFromBrix(startBrix, currentBrix)
                  : null;
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
                      {startBrix ?? '—'} → {currentBrix ?? b.target_final_brix ?? '—'}
                    </td>
                    <td>{formatAbvEstimate(estAbv)}</td>
                    <td>{format(new Date(b.start_date), 'MMM d, yyyy')}</td>
                    <td><StatusBadge status={STATUS_LABELS[b.status] ?? b.status} /></td>
                    <td className="td-actions">
                      <button
                        className="btn btn-sm btn-secondary"
                        disabled={b.status !== 'fermenting'}
                        title={b.status !== 'fermenting' ? 'Set status to fermenting to log readings' : undefined}
                        onClick={() => setSelectedId(b.id === selectedId ? null : b.id)}
                      >
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

      {selectedId && selectedBatch && canLogSelectedBatch && (
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
                  startBrix={selectedStartBrix}
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
              startBrix={selectedStartBrix}
              refreshKey={key}
              onAdded={refresh}
            />
          )}
        </div>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Wash Batch' : 'New Wash Batch'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Batch Number</label>
              <input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
            </div>
            <div className="form-group full-width">
              <label>Load from Recipe</label>
              <select
                value=""
                onChange={(e) => {
                  const recipeId = Number(e.target.value);
                  if (!recipeId) return;
                  const recipe = recipes.find((r) => r.id === recipeId);
                  if (!recipe) return;
                  setForm({
                    ...form,
                    recipe_name: recipe.name,
                    grain_type: recipe.grain_type,
                    grain_lbs: recipe.grain_lbs,
                    water_gal: recipe.water_gal,
                    yeast_strain: recipe.yeast_strain,
                    yeast_lbs: recipe.yeast_lbs,
                    target_brix: recipe.target_brix,
                    target_final_brix: recipe.target_final_brix,
                    notes: recipe.notes || form.notes,
                  });
                }}
              >
                <option value="">— Select a saved recipe —</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.spirit_type ? ` (${r.spirit_type})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Recipe Name</label>
              <input value={form.recipe_name} onChange={(e) => setForm({ ...form, recipe_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Sugar Type</label>
              <select
                value={form.grain_type}
                onChange={(e) => setForm({ ...form, grain_type: e.target.value })}
              >
                <option value="">— Select sugar from inventory —</option>
                {sugarItems.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name} ({item.quantity} {item.unit} on hand)
                  </option>
                ))}
                {form.grain_type && !sugarItems.some((i) => i.name === form.grain_type) && (
                  <option value={form.grain_type}>{form.grain_type} (not in inventory)</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>Sugar (lbs)</label>
              <input type="number" min="0" step="0.1" value={form.grain_lbs || ''} onChange={(e) => setForm({ ...form, grain_lbs: parseFloat(e.target.value) || 0 })} placeholder="400" />
            </div>
            <div className="form-group">
              <label>Batch Size</label>
              <input type="number" step="0.1" value={form.water_gal || ''} onChange={(e) => setForm({ ...form, water_gal: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Yeast Strain</label>
              <select
                value={form.yeast_strain}
                onChange={(e) => setForm({ ...form, yeast_strain: e.target.value })}
              >
                <option value="">— Select yeast from inventory —</option>
                {yeastItems.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name} ({item.quantity} {item.unit} on hand)
                  </option>
                ))}
                {form.yeast_strain && !yeastItems.some((i) => i.name === form.yeast_strain) && (
                  <option value={form.yeast_strain}>{form.yeast_strain} (not in inventory)</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>Yeast (lbs)</label>
              <input type="number" min="0" step="0.01" value={form.yeast_lbs || ''} onChange={(e) => setForm({ ...form, yeast_lbs: parseFloat(e.target.value) || 0 })} placeholder="2" />
            </div>
            <div className="form-group">
              <label>Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MashStatus })}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
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

            <div className="form-group full-width sugar-wash-calc">
              <label>Sugar Wash Calculator</label>
              <p className="form-hint">
                Sugar (lbs) made up to batch size (gal) — same method as Essential Distilling.
              </p>
              {sugarWash ? (
                <>
                  <div className="sugar-wash-results">
                    <span>Est. SG <strong>{sugarWash.sg.toFixed(3)}</strong></span>
                    <span>Target Brix <strong>{sugarWash.brix.toFixed(1)}°</strong></span>
                    <span>Water to add <strong>{sugarWash.waterGal.toFixed(1)} gal</strong></span>
                    <span>Potential ABV <strong>{sugarWash.potentialAbv.toFixed(1)}%</strong></span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setForm({ ...form, target_brix: sugarWash.brix })}
                  >
                    Use as Target Start Brix
                  </button>
                </>
              ) : (
                <p className="form-hint">Enter sugar lbs and batch size to estimate target Brix.</p>
              )}
            </div>

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
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <p className="form-hint">Saving deducts sugar and yeast from inventory. Assigned fermenters show as <strong>in use</strong> on the floor plan until this wash is charged to a still.</p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save Batch</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
