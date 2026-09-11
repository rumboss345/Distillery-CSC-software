import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ActiveBadge } from '../../components/master-data/ActiveBadge';
import { masterDataRepository } from '../../db/repositories/master-data-repository';
import { useRefreshKey } from '../../db/queries';
import { LOOKUP_TYPES } from '../../../shared/master-data/constants';
import type { MdSupplier, MdSupplierSaveInput } from '../../types/master-data';

const empty = (): MdSupplierSaveInput => ({
  company_name: '', contact_name: '', email: '', phone: '', country: '', address: '', website: '',
  classifications: ['Raw Materials'], payment_terms: '', currency: 'USD', active: 1, notes: '',
});

export function SuppliersPage() {
  const { key, refresh } = useRefreshKey();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number>();
  const [form, setForm] = useState(empty());
  const [error, setError] = useState('');

  void key;
  const supplierTypes = masterDataRepository.lookups.get(LOOKUP_TYPES.SUPPLIER_TYPE);
  const items = useMemo(() => {
    let rows = masterDataRepository.suppliers.list(activeFilter === 'active');
    if (activeFilter === 'inactive') {
      rows = masterDataRepository.suppliers.list().filter((r) => !r.active);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.company_name.toLowerCase().includes(q)
        || r.supplier_code.toLowerCase().includes(q)
        || r.classifications.some((c) => c.toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [key, search, activeFilter]);

  const toggleClassification = (type: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      classifications: checked
        ? [...prev.classifications, type]
        : prev.classifications.filter((c) => c !== type),
    }));
  };

  const openNew = () => { setEditId(undefined); setForm(empty()); setError(''); setShowForm(true); };
  const openEdit = (row: MdSupplier) => {
    setEditId(row.id);
    setForm({
      company_name: row.company_name, contact_name: row.contact_name, email: row.email, phone: row.phone,
      country: row.country, address: row.address, website: row.website,
      classifications: [...row.classifications], payment_terms: row.payment_terms,
      currency: row.currency, active: row.active, notes: row.notes,
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = () => {
    try {
      masterDataRepository.suppliers.save(form, editId);
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const toggleActive = (id: number, active: number) => {
    masterDataRepository.suppliers.setActive(id, !active);
    refresh();
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <input className="form-control" placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <select className="form-control" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)} style={{ maxWidth: 160 }}>
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}>+ Add Supplier</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Company</th><th>Classifications</th><th>Contact</th><th>Country</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.supplier_code}</td><td>{row.company_name}</td>
                <td>{row.classifications.join(', ')}</td>
                <td>{row.contact_name || '—'}</td><td>{row.country || '—'}</td>
                <td><ActiveBadge active={row.active} /></td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(row.id, row.active)}>{row.active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="empty-state">No suppliers defined.</p>}
      </div>
      {showForm && (
        <Modal title={editId ? 'Edit Supplier' : 'Add Supplier'} onClose={() => setShowForm(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Company Name *</label><input className="form-control" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
            <div className="form-group full-width">
              <label>Classifications *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', marginTop: '0.35rem' }}>
                {supplierTypes.map((t) => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <input
                      type="checkbox"
                      checked={form.classifications.includes(t)}
                      onChange={(e) => toggleClassification(t, e.target.checked)}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group"><label>Contact Name</label><input className="form-control" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
            <div className="form-group"><label>Email</label><input className="form-control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-group"><label>Country</label><input className="form-control" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            <div className="form-group full-width"><label>Address</label><textarea className="form-control" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="form-group full-width"><label>Notes</label><textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={handleSave}>Save</button></div>
        </Modal>
      )}
    </div>
  );
}
