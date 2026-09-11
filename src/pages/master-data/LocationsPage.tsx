import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ActiveBadge } from '../../components/master-data/ActiveBadge';
import { masterDataRepository } from '../../db/repositories/master-data-repository';
import { useRefreshKey } from '../../db/queries';
import { LOOKUP_TYPES } from '../../../shared/master-data/constants';
import type { MdStorageLocation } from '../../types/master-data';

const empty = (): Omit<MdStorageLocation, 'id' | 'location_code' | 'created_at' | 'updated_at' | 'parent_name'> => ({
  name: '', location_type: 'Raw Material Warehouse', description: '', active: 1, parent_location_id: null,
});

export function LocationsPage() {
  const { key, refresh } = useRefreshKey();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number>();
  const [form, setForm] = useState(empty());
  const [error, setError] = useState('');

  void key;
  const locationTypes = masterDataRepository.lookups.get(LOOKUP_TYPES.LOCATION_TYPE);
  const items = useMemo(() => {
    let rows = masterDataRepository.locations.list();
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.location_code.toLowerCase().includes(q));
    }
    return rows;
  }, [key, search]);
  const allLocations = masterDataRepository.locations.list();

  const openNew = () => { setEditId(undefined); setForm(empty()); setError(''); setShowForm(true); };
  const openEdit = (row: MdStorageLocation) => {
    setEditId(row.id);
    setForm({ name: row.name, location_type: row.location_type, description: row.description,
      active: row.active, parent_location_id: row.parent_location_id });
    setError('');
    setShowForm(true);
  };

  const handleSave = () => {
    try {
      masterDataRepository.locations.save(form, editId);
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <input className="form-control" placeholder="Search locations…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <button className="btn btn-primary" onClick={openNew}>+ Add Location</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Parent</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.location_code}</td><td>{row.name}</td><td>{row.location_type}</td>
                <td>{row.parent_name ?? '—'}</td>
                <td><ActiveBadge active={row.active} /></td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="empty-state">No storage locations defined.</p>}
      </div>
      {showForm && (
        <Modal title={editId ? 'Edit Location' : 'Add Location'} onClose={() => setShowForm(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Type</label>
              <select className="form-control" value={form.location_type} onChange={(e) => setForm({ ...form, location_type: e.target.value })}>
                {locationTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="form-group"><label>Parent Location</label>
              <select className="form-control" value={form.parent_location_id ?? ''} onChange={(e) => setForm({ ...form, parent_location_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {allLocations.filter((l) => l.id !== editId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
            <div className="form-group full-width"><label>Description</label><textarea className="form-control" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={handleSave}>Save</button></div>
        </Modal>
      )}
    </div>
  );
}
