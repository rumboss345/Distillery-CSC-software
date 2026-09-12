import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ActiveBadge } from '../../components/master-data/ActiveBadge';
import { masterDataRepository } from '../../db/repositories/master-data-repository';
import { useRefreshKey } from '../../db/queries';
import { LOOKUP_TYPES } from '../../../shared/master-data/constants';
import type { MdSku } from '../../types/master-data';

const empty = (): Omit<MdSku, 'id' | 'sku_code' | 'created_at' | 'updated_at' | 'product_name'> => ({
  product_id: 0, name: '', package_type: 'bottle', package_size: 750, package_size_unit: 'mL',
  containers_per_case: 12, cases_per_pallet: null, target_abv: null, barcode_upc: '', case_barcode: '',
  status: 'Active', notes: '',
});

export function SkusPage() {
  const { key, refresh } = useRefreshKey();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number>();
  const [form, setForm] = useState(empty());
  const [error, setError] = useState('');

  void key;
  const products = masterDataRepository.products.listActive();
  const packageTypes = masterDataRepository.lookups.get(LOOKUP_TYPES.PACKAGE_TYPE);
  const items = useMemo(() => {
    let rows = masterDataRepository.skus.list();
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.sku_code.toLowerCase().includes(q) || (r.product_name ?? '').toLowerCase().includes(q));
    }
    return rows;
  }, [key, search]);

  const openNew = () => {
    setEditId(undefined);
    setForm({ ...empty(), product_id: products[0]?.id ?? 0 });
    setError('');
    setShowForm(true);
  };

  const openEdit = (row: MdSku) => {
    setEditId(row.id);
    setForm({ product_id: row.product_id, name: row.name, package_type: row.package_type, package_size: row.package_size,
      package_size_unit: row.package_size_unit, containers_per_case: row.containers_per_case, cases_per_pallet: row.cases_per_pallet,
      target_abv: row.target_abv, barcode_upc: row.barcode_upc, case_barcode: row.case_barcode, status: row.status, notes: row.notes });
    setError('');
    setShowForm(true);
  };

  const handleSave = () => {
    try {
      masterDataRepository.skus.save(form, editId);
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <input className="form-control" placeholder="Search SKUs…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <button className="btn btn-primary" onClick={openNew} disabled={products.length === 0}>+ Add SKU</button>
      </div>
      {products.length === 0 && <p className="alert alert-info">Add a product before creating SKUs.</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Product</th><th>SKU Name</th><th>Package</th><th>Size</th><th>Target ABV</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.sku_code}</td><td>{row.product_name}</td><td>{row.name}</td><td>{row.package_type}</td>
                <td>{row.package_size} {row.package_size_unit}</td>
                <td>{row.target_abv != null ? `${row.target_abv}%` : '—'}</td>
                <td><ActiveBadge active={row.status === 'Active'} label={row.status} /></td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="empty-state">No SKUs found.</p>}
      </div>
      {showForm && (
        <Modal title={editId ? 'Edit SKU' : 'Add SKU'} onClose={() => setShowForm(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Product *</label>
              <select className="form-control" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: Number(e.target.value) })}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div className="form-group"><label>SKU Name *</label><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Package Type</label>
              <select className="form-control" value={form.package_type} onChange={(e) => setForm({ ...form, package_type: e.target.value })}>
                {packageTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="form-group"><label>Package Size *</label><input type="number" className="form-control" value={form.package_size} onChange={(e) => setForm({ ...form, package_size: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Size Unit</label><input className="form-control" value={form.package_size_unit} onChange={(e) => setForm({ ...form, package_size_unit: e.target.value })} /></div>
            <div className="form-group"><label>Containers / Case *</label><input type="number" className="form-control" value={form.containers_per_case} onChange={(e) => setForm({ ...form, containers_per_case: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Target ABV (%)</label><input type="number" className="form-control" value={form.target_abv ?? ''} onChange={(e) => setForm({ ...form, target_abv: e.target.value ? Number(e.target.value) : null })} /></div>
            <div className="form-group"><label>Status</label>
              <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Active</option><option>Inactive</option>
              </select></div>
            <div className="form-group full-width"><label>Notes</label><textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={handleSave}>Save</button></div>
        </Modal>
      )}
    </div>
  );
}
