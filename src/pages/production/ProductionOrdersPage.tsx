import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { masterDataRepository, productionOrdersRepository, recipesRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';

export function ProductionOrdersPage() {
  const navigate = useNavigate();
  const { key, refresh } = useRefreshKey();
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    productId: 0,
    recipeId: 0,
    recipeVersionId: 0,
    productionType: 'Proof Down',
    plannedBatchSize: 1000,
  });

  void key;
  const products = masterDataRepository.products.listActive();
  const recipes = recipesRepository.listRecipes('Active');
  const versions = form.recipeId ? recipesRepository.listVersions(form.recipeId) : [];
  const activeVersion = versions.find((v) => v.status === 'Active') ?? versions[0];

  const items = useMemo(
    () => productionOrdersRepository.listOrders(statusFilter === 'all' ? undefined : statusFilter),
    [key, statusFilter],
  );

  const openNew = () => {
    const recipe = recipes[0];
    const version = recipe ? recipesRepository.listVersions(recipe.id).find((v) => v.status === 'Active') : undefined;
    setForm({
      productId: recipe?.product_id ?? products[0]?.id ?? 0,
      recipeId: recipe?.id ?? 0,
      recipeVersionId: version?.id ?? 0,
      productionType: recipe?.recipe_type ?? 'Proof Down',
      plannedBatchSize: version?.target_batch_size ?? 1000,
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = () => {
    try {
      const id = productionOrdersRepository.createOrder({
        productId: form.productId,
        recipeId: form.recipeId,
        recipeVersionId: form.recipeVersionId,
        productionType: form.productionType,
        plannedBatchSize: form.plannedBatchSize,
      });
      setShowForm(false);
      refresh();
      navigate(`/production/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="all">All statuses</option>
          {['Draft', 'Planned', 'Released', 'In Progress', 'Completed', 'Cancelled'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={openNew} disabled={recipes.length === 0}>+ New Order</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order #</th><th>Product</th><th>Recipe</th><th>Version</th><th>Type</th>
              <th>Planned Qty</th><th>Status</th><th>Progress</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => {
              const progress = productionOrdersRepository.getProductionProgress(o.id);
              return (
                <tr key={o.id}>
                  <td>{o.order_code}</td>
                  <td>{o.product_name}</td>
                  <td>{o.recipe_name}</td>
                  <td>v{o.version_number}</td>
                  <td>{o.production_type}</td>
                  <td>{o.planned_batch_size} {o.batch_size_unit}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{progress.percentComplete != null ? `${progress.percentComplete.toFixed(1)}%` : '—'}</td>
                  <td><Link to={`/production/${o.id}`}>Open</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
      <Modal title="New Production Order" onClose={() => setShowForm(false)}>
        {error && <p className="alert alert-error">{error}</p>}
        <label>Product</label>
        <select className="form-control" value={form.productId} onChange={(e) => setForm({ ...form, productId: Number(e.target.value) })}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label>Recipe</label>
        <select
          className="form-control"
          value={form.recipeId}
          onChange={(e) => {
            const recipeId = Number(e.target.value);
            const recipe = recipes.find((r) => r.id === recipeId);
            const v = recipesRepository.listVersions(recipeId).find((x) => x.status === 'Active');
            setForm({
              ...form,
              recipeId,
              productId: recipe?.product_id ?? form.productId,
              recipeVersionId: v?.id ?? 0,
              productionType: recipe?.recipe_type ?? form.productionType,
              plannedBatchSize: v?.target_batch_size ?? form.plannedBatchSize,
            });
          }}
        >
          {recipes.map((r) => <option key={r.id} value={r.id}>{r.recipe_code} — {r.name}</option>)}
        </select>
        <label>Recipe Version (locked at release)</label>
        <select className="form-control" value={form.recipeVersionId} onChange={(e) => setForm({ ...form, recipeVersionId: Number(e.target.value) })}>
          {versions.map((v) => <option key={v.id} value={v.id}>v{v.version_number} — {v.status}</option>)}
        </select>
        <label>Production Type</label>
        <select className="form-control" value={form.productionType} onChange={(e) => setForm({ ...form, productionType: e.target.value })}>
          {productionOrdersRepository.lookups.productionTypes().map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label>Planned Batch Size ({activeVersion?.batch_size_unit ?? 'L'})</label>
        <input className="form-control" type="number" value={form.plannedBatchSize} onChange={(e) => setForm({ ...form, plannedBatchSize: Number(e.target.value) })} />
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!form.recipeVersionId}>Create Draft</button>
        </div>
      </Modal>
      )}
    </div>
  );
}
