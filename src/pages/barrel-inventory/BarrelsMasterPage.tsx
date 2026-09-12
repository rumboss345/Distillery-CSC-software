import { useState } from 'react';
import { DEFAULT_COOPERAGE_TYPES, DEFAULT_WOOD_TYPES } from '../../../shared/barrel-aging/constants';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { barrelAgingRepository } from '../../db/repositories/barrel-aging-repository';
import { useRefreshKey } from '../../db/queries';
import { masterDataRepository } from '../../db/repositories/master-data-repository';
import type { MdStorageLocation } from '../../types/master-data';
import type { BrlBarrel, BrlBarrelSaveInput } from '../../types/barrel-aging';

const emptyForm = (): BrlBarrelSaveInput => ({
  cooperage: '53 US gal Standard',
  wood_type: 'American Oak',
  capacity_litres: 200.66,
  location_id: null,
  purchase_cost_kyd: 0,
  barcode: '',
  notes: '',
});

export function BarrelsMasterPage() {
  const { key, refresh } = useRefreshKey();
  const barrels = barrelAgingRepository.listBarrels();
  const locations = masterDataRepository.locations.list(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyForm());

  void key;

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (barrel: BrlBarrel) => {
    setEditId(barrel.id);
    setForm({
      cooperage: barrel.cooperage,
      wood_type: barrel.wood_type,
      capacity_litres: barrel.capacity_litres,
      location_id: barrel.location_id,
      purchase_cost_kyd: barrel.purchase_cost_kyd,
      barcode: barrel.barcode,
      notes: barrel.notes,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (editId) barrelAgingRepository.updateBarrel(editId, form);
    else barrelAgingRepository.createBarrel(form);
    setShowForm(false);
    refresh();
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <button className="btn btn-primary" type="button" onClick={openNew}>+ Register Barrel</button>
      </div>

      {barrels.length === 0 ? (
        <div className="empty-state"><p>No barrels registered yet.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Cooperage</th>
                <th>Wood</th>
                <th>Capacity (L)</th>
                <th>Fills</th>
                <th>Location</th>
                <th>Asset Cost</th>
                <th>Barcode</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {barrels.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.barrel_code}</strong></td>
                  <td>{b.cooperage}</td>
                  <td>{b.wood_type}</td>
                  <td>{b.capacity_litres.toFixed(1)}</td>
                  <td>{b.fill_count}</td>
                  <td>{b.location_name ?? '—'}</td>
                  <td>{b.purchase_cost_kyd.toFixed(2)} KYD</td>
                  <td>{b.barcode || '—'}</td>
                  <td><StatusBadge status={b.status.toLowerCase()} /></td>
                  <td className="td-actions">
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => openEdit(b)} disabled={b.status === 'Aging'}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Barrel' : 'Register Barrel'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Cooperage</label>
              <select value={form.cooperage} onChange={(e) => setForm({ ...form, cooperage: e.target.value })}>
                {DEFAULT_COOPERAGE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Wood Type</label>
              <select value={form.wood_type} onChange={(e) => setForm({ ...form, wood_type: e.target.value })}>
                {DEFAULT_WOOD_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Capacity (litres)</label>
              <input type="number" step="0.01" value={form.capacity_litres || ''} onChange={(e) => setForm({ ...form, capacity_litres: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Location</label>
              <select value={form.location_id ?? ''} onChange={(e) => setForm({ ...form, location_id: e.target.value ? parseInt(e.target.value) : null })}>
                <option value="">— None —</option>
                {locations.map((l: MdStorageLocation) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Purchase Cost (KYD)</label>
              <input type="number" step="0.01" value={form.purchase_cost_kyd ?? ''} onChange={(e) => setForm({ ...form, purchase_cost_kyd: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Barcode</label>
              <input value={form.barcode ?? ''} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" type="button" onClick={handleSave}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
