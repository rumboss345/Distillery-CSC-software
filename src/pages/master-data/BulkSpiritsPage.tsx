import { useMemo, useState } from 'react';
import { litresPureAlcohol, litresToUsGallons } from '../../../shared/master-data/conversions';
import { Modal } from '../../components/Modal';
import { ActiveBadge } from '../../components/master-data/ActiveBadge';
import { masterDataRepository } from '../../db/repositories/master-data-repository';
import { useRefreshKey } from '../../db/queries';
import { LOOKUP_TYPES } from '../../../shared/master-data/constants';
import type { MdBulkSpirit } from '../../types/master-data';

const empty = (): Omit<MdBulkSpirit, 'id' | 'spirit_code' | 'created_at' | 'updated_at' | 'supplier_name'> => ({
  name: '', spirit_type: 'Neutral Grain Spirit', origin_country: '', producer_supplier_id: null,
  nominal_abv: 96, inventory_unit: 'L', purchase_unit: 'L', litres_per_purchase_unit: 1000,
  standard_cost: null, last_cost: null, purchase_currency: 'USD', lot_tracked: 1, excise_category: '', active: 1, notes: '',
});

export function BulkSpiritsPage() {
  const { key, refresh } = useRefreshKey();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number>();
  const [form, setForm] = useState(empty());
  const [error, setError] = useState('');

  void key;
  const spiritTypes = masterDataRepository.lookups.get(LOOKUP_TYPES.SPIRIT_TYPE);
  const suppliers = masterDataRepository.suppliers.list(true);
  const items = useMemo(() => {
    let rows = masterDataRepository.bulkSpirits.list(activeFilter === 'active');
    if (activeFilter === 'inactive') {
      rows = masterDataRepository.bulkSpirits.list().filter((r) => !r.active);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.spirit_code.toLowerCase().includes(q));
    }
    return rows;
  }, [key, search, activeFilter]);

  const openNew = () => { setEditId(undefined); setForm(empty()); setError(''); setShowForm(true); };
  const openEdit = (row: MdBulkSpirit) => {
    setEditId(row.id);
    setForm({ name: row.name, spirit_type: row.spirit_type, origin_country: row.origin_country,
      producer_supplier_id: row.producer_supplier_id, nominal_abv: row.nominal_abv, inventory_unit: row.inventory_unit,
      purchase_unit: row.purchase_unit, litres_per_purchase_unit: row.litres_per_purchase_unit, standard_cost: row.standard_cost,
      last_cost: row.last_cost, purchase_currency: row.purchase_currency, lot_tracked: row.lot_tracked,
      excise_category: row.excise_category, active: row.active, notes: row.notes });
    setError('');
    setShowForm(true);
  };

  const handleSave = () => {
    try {
      masterDataRepository.bulkSpirits.save(form, editId);
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const toggleActive = (id: number, active: number) => {
    masterDataRepository.bulkSpirits.setActive(id, !active);
    refresh();
  };

  const previewLpa = form.litres_per_purchase_unit > 0 && form.nominal_abv > 0
    ? litresPureAlcohol(form.litres_per_purchase_unit, form.nominal_abv)
    : null;

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <input className="form-control" placeholder="Search bulk spirits…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <select className="form-control" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)} style={{ maxWidth: 160 }}>
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}>+ Add Bulk Spirit</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>ABV</th><th>L / Purchase Unit</th><th>LPA (per unit)</th><th>Supplier</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.spirit_code}</td><td>{row.name}</td><td>{row.spirit_type}</td>
                <td>{row.nominal_abv}%</td>
                <td>{row.litres_per_purchase_unit} L ({litresToUsGallons(row.litres_per_purchase_unit).toFixed(1)} US gal)</td>
                <td>{litresPureAlcohol(row.litres_per_purchase_unit, row.nominal_abv).toFixed(1)} LPA</td>
                <td>{row.supplier_name ?? '—'}</td>
                <td><ActiveBadge active={row.active} /></td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(row.id, row.active)}>{row.active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="empty-state">No bulk spirits defined.</p>}
      </div>
      {showForm && (
        <Modal title={editId ? 'Edit Bulk Spirit' : 'Add Bulk Spirit'} onClose={() => setShowForm(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Spirit Type</label>
              <select className="form-control" value={form.spirit_type} onChange={(e) => setForm({ ...form, spirit_type: e.target.value })}>
                {spiritTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="form-group"><label>Nominal ABV (%) *</label><input type="number" className="form-control" value={form.nominal_abv} onChange={(e) => setForm({ ...form, nominal_abv: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Litres / Purchase Unit *</label><input type="number" className="form-control" value={form.litres_per_purchase_unit} onChange={(e) => setForm({ ...form, litres_per_purchase_unit: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Origin Country</label><input className="form-control" value={form.origin_country} onChange={(e) => setForm({ ...form, origin_country: e.target.value })} /></div>
            <div className="form-group"><label>Producer / Supplier</label>
              <select className="form-control" value={form.producer_supplier_id ?? ''} onChange={(e) => setForm({ ...form, producer_supplier_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
              </select></div>
            <div className="form-group"><label>Inventory Unit</label><input className="form-control" value={form.inventory_unit} readOnly /></div>
            <div className="form-group"><label>Purchase Unit</label><input className="form-control" value={form.purchase_unit} onChange={(e) => setForm({ ...form, purchase_unit: e.target.value })} /></div>
            {previewLpa != null && <div className="form-group full-width form-hint">LPA per purchase unit: {previewLpa.toFixed(2)} L</div>}
            <div className="form-group full-width"><label>Notes</label><textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={handleSave}>Save</button></div>
        </Modal>
      )}
    </div>
  );
}
