import { useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import {
  getBarrels,
  saveBarrel,
  deleteBarrel,
  getDistillationRuns,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { AssignedUsersBar } from '../components/AssignedUsersBar';
import { logUserAction } from '../lib/activity-log';
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
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyBarrel());

  void key;

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
    void logUserAction('barrels', `${editId ? 'Updated' : 'Created'} barrel ${form.barrel_number}`);
    setShowForm(false);
    refresh();
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this barrel record?')) {
      deleteBarrel(id);
      refresh();
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
          <button className="btn btn-primary" onClick={openNew}>+ New Barrel</button>
        </div>
      </div>

      <AssignedUsersBar actionKey="barrels" refreshKey={key} />

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
              <input type="date" value={form.fill_date} onChange={(e) => setForm({ ...form, fill_date: e.target.value })} />
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
