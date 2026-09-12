import { useState } from 'react';
import { format } from 'date-fns';
import {
  getBottlingRuns,
  saveBottlingRun,
  deleteBottlingRun,
  getBarrels,
  getInventoryByCategory,
  generateBatchNumber,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { AssignedUsersBar } from '../components/AssignedUsersBar';
import { mlToGallons } from '../types';
import { PACKAGING_BOTTLES, packagingBottleByName } from '../lib/packaging-bottles';
import { logUserAction } from '../lib/activity-log';

const emptyRun = () => ({
  batch_number: generateBatchNumber('BT'),
  source_barrel_id: null as number | null,
  source_run_id: null as number | null,
  bottling_date: new Date().toISOString().slice(0, 10),
  packaging_bottle: '',
  bottle_size_ml: 750,
  bottle_count: 0,
  final_abv: 0,
  product_name: '',
  lot_number: '',
  notes: '',
});

export function Bottling() {
  const { key, refresh } = useRefreshKey();
  const runs = getBottlingRuns();
  const barrels = getBarrels().filter((b) => b.status === 'aging' || b.status === 'empty');
  const packagingInventory = getInventoryByCategory('packaging');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyRun());

  void key;

  const totalBottles = runs.reduce((s, r) => s + r.bottle_count, 0);
  const totalVolume = runs.reduce((s, r) => s + mlToGallons(r.bottle_count * r.bottle_size_ml), 0);

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyRun());
    setShowForm(true);
  };

  const openEdit = (run: ReturnType<typeof getBottlingRuns>[0]) => {
    setEditId(run.id);
    setForm({
      ...run,
      packaging_bottle: run.packaging_bottle ?? '',
    });
    setShowForm(true);
  };

  const handlePackagingSelect = (name: string) => {
    const bottle = packagingBottleByName(name);
    setForm({
      ...form,
      packaging_bottle: name,
      bottle_size_ml: bottle?.sizeMl ?? form.bottle_size_ml,
    });
  };

  const handleSave = () => {
    saveBottlingRun(form, editId);
    void logUserAction('bottling', `${editId ? 'Updated' : 'Created'} bottling run ${form.batch_number}`);
    setShowForm(false);
    refresh();
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this bottling run?')) {
      deleteBottlingRun(id);
      refresh();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Bottling</h2>
        <p>Record finished goods and bottling runs</p>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={openNew}>+ New Bottling Run</button>
        </div>
      </div>

      <AssignedUsersBar actionKey="bottling" refreshKey={key} />

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>Packaging Bottles</h3>
        <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
          Standard bottle SKUs tracked in inventory under Packaging.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bottle</th>
                <th>Size</th>
                <th>On Hand</th>
                <th>Reorder At</th>
              </tr>
            </thead>
            <tbody>
              {PACKAGING_BOTTLES.map((bottle) => {
                const inv = packagingInventory.find(
                  (i) => i.name.toLowerCase() === bottle.name.toLowerCase(),
                );
                return (
                  <tr key={bottle.name}>
                    <td><strong>{bottle.name}</strong></td>
                    <td>{bottle.sizeMl} ml</td>
                    <td>{inv ? `${inv.quantity.toLocaleString()} ${inv.unit}` : '—'}</td>
                    <td>{inv ? inv.reorder_level.toLocaleString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="label">Total Bottling Runs</div>
          <div className="value">{runs.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Bottles</div>
          <div className="value accent">{totalBottles.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Volume Bottled</div>
          <div className="value">{totalVolume.toFixed(1)} gal</div>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty-state">
          <p>No bottling runs recorded yet.</p>
          <button type="button" className="btn btn-primary" onClick={openNew} style={{ marginTop: '1rem' }}>Record first bottling</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Product</th>
                <th>Packaging</th>
                <th>Lot</th>
                <th>Date</th>
                <th>Bottle Size</th>
                <th>Count</th>
                <th>ABV</th>
                <th>Source Barrel</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const barrel = barrels.find((b) => b.id === r.source_barrel_id);
                return (
                  <tr key={r.id}>
                    <td><strong>{r.batch_number}</strong></td>
                    <td>{r.product_name}</td>
                    <td>{r.packaging_bottle || '—'}</td>
                    <td>{r.lot_number}</td>
                    <td>{format(new Date(r.bottling_date), 'MMM d, yyyy')}</td>
                    <td>{r.bottle_size_ml} ml</td>
                    <td>{r.bottle_count.toLocaleString()}</td>
                    <td>{r.final_abv}%</td>
                    <td>{barrel?.barrel_number ?? '—'}</td>
                    <td className="td-actions">
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(r)}>Edit</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDelete(r.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Bottling Run' : 'New Bottling Run'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Batch Number</label>
              <input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Product Name</label>
              <input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Packaging Bottle</label>
              <select
                value={form.packaging_bottle}
                onChange={(e) => handlePackagingSelect(e.target.value)}
              >
                <option value="">— Select packaging bottle —</option>
                {PACKAGING_BOTTLES.map((b) => (
                  <option key={b.name} value={b.name}>{b.name} ({b.sizeMl} ml)</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Lot Number</label>
              <input value={form.lot_number} onChange={(e) => setForm({ ...form, lot_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Bottling Date</label>
              <input type="date" value={form.bottling_date} onChange={(e) => setForm({ ...form, bottling_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Source Barrel</label>
              <select
                value={form.source_barrel_id ?? ''}
                onChange={(e) => setForm({ ...form, source_barrel_id: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">— None —</option>
                {barrels.map((b) => <option key={b.id} value={b.id}>{b.barrel_number} — {b.spirit_type}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Bottle Size (ml)</label>
              <input type="number" value={form.bottle_size_ml || ''} onChange={(e) => setForm({ ...form, bottle_size_ml: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Bottle Count</label>
              <input type="number" value={form.bottle_count || ''} onChange={(e) => setForm({ ...form, bottle_count: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Final ABV (%)</label>
              <input type="number" step="0.1" value={form.final_abv || ''} onChange={(e) => setForm({ ...form, final_abv: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
