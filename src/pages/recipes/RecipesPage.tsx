import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { ActiveBadge } from '../../components/master-data/ActiveBadge';
import { recipesRepository } from '../../db/repositories/recipes-repository';
import { masterDataRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';
import type { RcRecipeSaveInput } from '../../types/recipes';

const empty = (): RcRecipeSaveInput => ({
  product_id: 0,
  name: '',
  description: '',
  recipe_type: 'Complete Product Formula',
  status: 'Development',
});

export function RecipesPage() {
  const navigate = useNavigate();
  const { key, refresh } = useRefreshKey();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty());
  const [error, setError] = useState('');

  void key;
  const products = masterDataRepository.products.listActive();
  const recipeTypes = recipesRepository.lookups.recipeTypes();
  const items = useMemo(() => {
    let rows = recipesRepository.recipes.list(statusFilter === 'all' ? undefined : statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.name.toLowerCase().includes(q)
        || r.recipe_code.toLowerCase().includes(q)
        || (r.product_name ?? '').toLowerCase().includes(q),
      );
    }
    return rows;
  }, [key, search, statusFilter]);

  const openNew = () => {
    setForm({ ...empty(), product_id: products[0]?.id ?? 0 });
    setError('');
    setShowForm(true);
  };

  const handleSave = () => {
    try {
      const newId = recipesRepository.recipes.save(form);
      setShowForm(false);
      refresh();
      navigate(`/recipes/${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <input className="form-control" placeholder="Search recipes…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="all">All statuses</option>
          <option value="Development">Development</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button className="btn btn-primary" onClick={openNew} disabled={products.length === 0}>+ Add Recipe</button>
      </div>
      {products.length === 0 && (
        <p className="alert alert-info">Add a product under Master Data before creating recipes.</p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Product</th><th>Type</th><th>Active Version</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.recipe_code}</td>
                <td>{row.name}</td>
                <td>{row.product_name}</td>
                <td>{row.recipe_type}</td>
                <td>{row.active_version_number != null ? `v${row.active_version_number}` : '—'}</td>
                <td><ActiveBadge active={row.status === 'Active'} label={row.status} /></td>
                <td><Link className="btn btn-ghost btn-sm" to={`/recipes/${row.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="empty-state">No recipes defined.</p>}
      </div>
      {showForm && (
        <Modal title="Add Recipe" onClose={() => setShowForm(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Recipe Name *</label>
              <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Product *</label>
              <select className="form-control" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: Number(e.target.value) })}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div className="form-group"><label>Recipe Type</label>
              <select className="form-control" value={form.recipe_type} onChange={(e) => setForm({ ...form, recipe_type: e.target.value })}>
                {recipeTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="form-group"><label>Status</label>
              <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Development</option><option>Active</option><option>Inactive</option>
              </select></div>
            <div className="form-group full-width"><label>Description</label>
              <textarea className="form-control" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={handleSave}>Create Recipe</button></div>
        </Modal>
      )}
    </div>
  );
}
