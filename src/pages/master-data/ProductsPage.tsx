import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ActiveBadge } from '../../components/master-data/ActiveBadge';
import { masterDataRepository } from '../../db/repositories/master-data-repository';
import { useRefreshKey } from '../../db/queries';
import { LOOKUP_TYPES } from '../../../shared/master-data/constants';
import type { MdProduct } from '../../types/master-data';

const empty = (): Omit<MdProduct, 'id' | 'product_code' | 'created_at' | 'updated_at'> => ({
  name: '', brand: '', category: 'Rum', description: '', default_abv: null, status: 'Active', notes: '',
});

export function ProductsPage() {
  const { key, refresh } = useRefreshKey();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number>();
  const [form, setForm] = useState(empty());
  const [error, setError] = useState('');

  void key;
  const categories = masterDataRepository.lookups.get(LOOKUP_TYPES.PRODUCT_CATEGORY);
  const items = useMemo(() => {
    let rows = masterDataRepository.products.list(statusFilter === 'all' ? undefined : statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.name.toLowerCase().includes(q)
        || r.product_code.toLowerCase().includes(q)
        || r.brand.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [key, search, statusFilter]);

  const openNew = () => { setEditId(undefined); setForm(empty()); setError(''); setShowForm(true); };
  const openEdit = (row: MdProduct) => {
    setEditId(row.id);
    setForm({ name: row.name, brand: row.brand, category: row.category, description: row.description,
      default_abv: row.default_abv, status: row.status, notes: row.notes });
    setError('');
    setShowForm(true);
  };

  const handleSave = () => {
    try {
      masterDataRepository.products.save(form, editId);
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <input className="form-control" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Development">Development</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}>+ Add Product</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Code</th><th>Name</th><th>Brand</th><th>Category</th><th>ABV</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.product_code}</td>
                <td>{row.name}</td>
                <td>{row.brand}</td>
                <td>{row.category}</td>
                <td>{row.default_abv != null ? `${row.default_abv}%` : '—'}</td>
                <td><ActiveBadge active={row.status === 'Active'} label={row.status} /></td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="empty-state">No products found.</p>}
      </div>
      {showForm && (
        <Modal title={editId ? 'Edit Product' : 'Add Product'} onClose={() => setShowForm(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Brand</label><input className="form-control" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
            <div className="form-group"><label>Category *</label>
              <select className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="form-group"><label>Default ABV (%)</label><input type="number" className="form-control" value={form.default_abv ?? ''} onChange={(e) => setForm({ ...form, default_abv: e.target.value ? Number(e.target.value) : null })} /></div>
            <div className="form-group"><label>Status</label>
              <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Active</option><option>Inactive</option><option>Development</option>
              </select></div>
            <div className="form-group full-width"><label>Description</label><textarea className="form-control" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="form-group full-width"><label>Notes</label><textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={handleSave}>Save</button></div>
        </Modal>
      )}
    </div>
  );
}
