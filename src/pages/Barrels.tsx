import { useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import {
  fillBarrelFromHoldingTank,
  getBarrels,
  getHoldingTanksWithContents,
  saveBarrel,
  deleteBarrel,
  getDistillationRuns,
  useRefreshKey,
} from '../db/queries';
import { DatePicker } from '../components/DatePicker';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type { Barrel, BarrelStatus } from '../types';

const STATUSES: BarrelStatus[] = ['aging', 'empty', 'dumped'];

const emptyBarrel = (): Omit<Barrel, 'id' | 'created_at'> => ({
  barrel_number: '',
  wood_type: 'American Oak',
  capacity_gal: 53,
  fill_date: new Date().toISOString().slice(0, 10),
  spirit_type: '',
  source_run_id: null,
  initial_abv: 0,
  current_volume_gal: 0,
  warehouse_location: '',
  status: 'aging',
  notes: '',
});

export function Barrels() {
  const { key, refresh } = useRefreshKey();
  const barrels = getBarrels();
  const runs = getDistillationRuns();
  const [showForm, setShowForm] = useState(false);
  const [showFillModal, setShowFillModal] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyBarrel());
  const [fillForm, setFillForm] = useState({
    barrelId: '' as number | '',
    tankId: '' as number | '',
    volumeGal: '',
    fillDate: new Date().toISOString().slice(0, 10),
    spiritType: '',
    notes: '',
  });

  const tanksWithSpirit = getHoldingTanksWithContents().filter((t) => t.volume_gal > 0);
  const fillableBarrels = barrels.filter((b) => b.status !== 'dumped' && b.current_volume_gal < b.capacity_gal - 0.01);

  void key;

  const selectedFillTank = fillForm.tankId
    ? tanksWithSpirit.find((t) => t.id === Number(fillForm.tankId))
    : undefined;
  const selectedFillBarrel = fillForm.barrelId
    ? barrels.find((b) => b.id === Number(fillForm.barrelId))
    : undefined;
  const fillHeadroom = selectedFillBarrel
    ? selectedFillBarrel.capacity_gal - selectedFillBarrel.current_volume_gal
    : 0;

  const openNew = () => {
    setEditId(undefined);
    const num = String(barrels.length + 1).padStart(3, '0');
    setForm({ ...emptyBarrel(), barrel_number: `B-${num}` });
    setShowForm(true);
  };

  const openEdit = (barrel: Barrel) => {
    setEditId(barrel.id);
    setForm({ ...barrel });
    setShowForm(true);
  };

  const handleSave = () => {
    saveBarrel(form, editId);
    setShowForm(false);
    refresh();
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this barrel record?')) {
      deleteBarrel(id);
      refresh();
    }
  };

  const openFillFromTank = () => {
    setFillForm({
      barrelId: fillableBarrels[0]?.id ?? '',
      tankId: tanksWithSpirit[0]?.id ?? '',
      volumeGal: '',
      fillDate: new Date().toISOString().slice(0, 10),
      spiritType: fillableBarrels[0]?.spirit_type ?? '',
      notes: '',
    });
    setShowFillModal(true);
  };

  const handleFillFromTank = () => {
    if (!fillForm.barrelId || !fillForm.tankId) {
      alert('Select a holding tank and a barrel.');
      return;
    }
    const volumeGal = parseFloat(fillForm.volumeGal);
    if (!(volumeGal > 0)) {
      alert('Enter how many gallons to transfer.');
      return;
    }
    try {
      fillBarrelFromHoldingTank({
        barrelId: Number(fillForm.barrelId),
        sourceHoldingTankEquipmentId: Number(fillForm.tankId),
        volumeGal,
        fillDate: fillForm.fillDate,
        spiritType: fillForm.spiritType.trim() || undefined,
        notes: fillForm.notes.trim() || undefined,
      });
      setShowFillModal(false);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not fill barrel.');
    }
  };

  const agingCount = barrels.filter((b) => b.status === 'aging').length;
  const totalVolume = barrels.filter((b) => b.status === 'aging').reduce((s, b) => s + b.current_volume_gal, 0);

  return (
    <div>
      <div className="page-header">
        <h2>Barrel Aging</h2>
        <p>Track spirit maturation in warehouse</p>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={openNew}>+ New Barrel</button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={openFillFromTank}
            disabled={tanksWithSpirit.length === 0 || fillableBarrels.length === 0}
          >
            Fill from holding tank
          </button>
        </div>
      </div>

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="label">Barrels Aging</div>
          <div className="value accent">{agingCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Volume Aging</div>
          <div className="value">{totalVolume.toFixed(0)} gal</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Barrels</div>
          <div className="value">{barrels.length}</div>
        </div>
      </div>

      {barrels.length === 0 ? (
        <div className="empty-state">
          <p>No barrels registered yet.</p>
          <button className="btn btn-primary" onClick={openNew} style={{ marginTop: '1rem' }}>Register first barrel</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Barrel #</th>
                <th>Spirit</th>
                <th>Wood</th>
                <th>Fill Date</th>
                <th>Age (days)</th>
                <th>Volume</th>
                <th>ABV</th>
                <th>Location</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {barrels.map((b) => {
                const age = differenceInDays(new Date(), new Date(b.fill_date));
                const run = runs.find((r) => r.id === b.source_run_id);
                return (
                  <tr key={b.id}>
                    <td><strong>{b.barrel_number}</strong></td>
                    <td>{b.spirit_type}{run ? ` (${run.batch_number})` : ''}</td>
                    <td>{b.wood_type}</td>
                    <td>{format(new Date(b.fill_date), 'MMM d, yyyy')}</td>
                    <td>{age}</td>
                    <td>{b.current_volume_gal} / {b.capacity_gal} gal</td>
                    <td>{b.initial_abv}%</td>
                    <td>{b.warehouse_location}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td className="td-actions">
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

      {showFillModal && (
        <Modal title="Fill barrel from holding tank" onClose={() => setShowFillModal(false)}>
          <p className="field-hint" style={{ marginBottom: '1rem' }}>
            Spirit is deducted from the tank ledger and added to the barrel. Use this instead of typing volume manually when filling from production tanks.
          </p>
          {tanksWithSpirit.length === 0 ? (
            <p className="field-hint">No holding tanks with spirit available.</p>
          ) : fillableBarrels.length === 0 ? (
            <p className="field-hint">No barrels with capacity — add a barrel or empty one first.</p>
          ) : (
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Source holding tank</label>
                <select
                  value={fillForm.tankId}
                  onChange={(e) => {
                    const tankId = e.target.value ? parseInt(e.target.value, 10) : '';
                    const tank = tanksWithSpirit.find((t) => t.id === tankId);
                    setFillForm((prev) => ({
                      ...prev,
                      tankId,
                      volumeGal: tank ? Math.min(tank.volume_gal, fillHeadroom || tank.volume_gal).toFixed(1) : prev.volumeGal,
                    }));
                  }}
                >
                  <option value="">— Select tank —</option>
                  {tanksWithSpirit.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.volume_gal.toFixed(1)} gal @ {t.abv.toFixed(1)}% ABV
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group full-width">
                <label>Barrel</label>
                <select
                  value={fillForm.barrelId}
                  onChange={(e) => {
                    const barrelId = e.target.value ? parseInt(e.target.value, 10) : '';
                    const barrel = barrels.find((b) => b.id === barrelId);
                    setFillForm((prev) => ({
                      ...prev,
                      barrelId,
                      spiritType: barrel?.spirit_type ?? prev.spiritType,
                    }));
                  }}
                >
                  <option value="">— Select barrel —</option>
                  {fillableBarrels.map((b) => {
                    const headroom = b.capacity_gal - b.current_volume_gal;
                    return (
                      <option key={b.id} value={b.id}>
                        {b.barrel_number} — {headroom.toFixed(1)} gal headroom
                        {b.current_volume_gal > 0 ? ` (${b.current_volume_gal.toFixed(1)} gal in barrel)` : ' (empty)'}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="form-group">
                <label>Volume to transfer (gal)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={fillForm.volumeGal}
                  onChange={(e) => setFillForm({ ...fillForm, volumeGal: e.target.value })}
                />
                {selectedFillTank && selectedFillBarrel && (
                  <span className="field-hint">
                    Max {Math.min(selectedFillTank.volume_gal, fillHeadroom).toFixed(1)} gal
                    (tank {selectedFillTank.volume_gal.toFixed(1)} · barrel headroom {fillHeadroom.toFixed(1)})
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Fill date</label>
                <DatePicker
                  value={fillForm.fillDate}
                  onChange={(fillDate) => setFillForm({ ...fillForm, fillDate })}
                />
              </div>
              <div className="form-group">
                <label>Spirit type (optional)</label>
                <input
                  value={fillForm.spiritType}
                  onChange={(e) => setFillForm({ ...fillForm, spiritType: e.target.value })}
                  placeholder="e.g. Bourbon, Rum"
                />
              </div>
              <div className="form-group full-width">
                <label>Notes</label>
                <input
                  value={fillForm.notes}
                  onChange={(e) => setFillForm({ ...fillForm, notes: e.target.value })}
                  placeholder="Optional fill note"
                />
              </div>
              {selectedFillTank && (
                <p className="field-hint full-width">
                  Tank proof at fill: <strong>{selectedFillTank.abv.toFixed(1)}% ABV</strong> (used for barrel proof).
                </p>
              )}
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowFillModal(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleFillFromTank}
              disabled={tanksWithSpirit.length === 0 || fillableBarrels.length === 0}
            >
              Transfer to barrel
            </button>
          </div>
        </Modal>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Barrel' : 'New Barrel'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Barrel Number</label>
              <input value={form.barrel_number} onChange={(e) => setForm({ ...form, barrel_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Spirit Type</label>
              <input value={form.spirit_type} onChange={(e) => setForm({ ...form, spirit_type: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Wood Type</label>
              <input value={form.wood_type} onChange={(e) => setForm({ ...form, wood_type: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Capacity (gal)</label>
              <input type="number" step="0.1" value={form.capacity_gal || ''} onChange={(e) => setForm({ ...form, capacity_gal: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Fill Date</label>
              <DatePicker
                value={form.fill_date}
                onChange={(fill_date) => setForm({ ...form, fill_date })}
              />
            </div>
            <div className="form-group">
              <label>Source Run</label>
              <select
                value={form.source_run_id ?? ''}
                onChange={(e) => setForm({ ...form, source_run_id: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">— None —</option>
                {runs.map((r) => <option key={r.id} value={r.id}>{r.batch_number}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Initial ABV (%)</label>
              <input type="number" step="0.1" value={form.initial_abv || ''} onChange={(e) => setForm({ ...form, initial_abv: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Current Volume (gal)</label>
              <input type="number" step="0.1" value={form.current_volume_gal || ''} onChange={(e) => setForm({ ...form, current_volume_gal: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Warehouse Location</label>
              <input value={form.warehouse_location} onChange={(e) => setForm({ ...form, warehouse_location: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BarrelStatus })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save Barrel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
