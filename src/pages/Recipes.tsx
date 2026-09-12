import { useState } from 'react';
import {
  getRecipes,
  getInventoryByCategory,
  saveRecipe,
  deleteRecipe,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import type { Recipe } from '../types';

const emptyRecipe = (): Omit<Recipe, 'id' | 'created_at' | 'updated_at'> => ({
  name: '',
  spirit_type: '',
  grain_type: '',
  grain_lbs: 0,
  water_gal: 0,
  yeast_strain: '',
  yeast_lbs: 0,
  target_brix: null,
  target_final_brix: null,
  notes: '',
});

export function Recipes() {
  const { key, refresh } = useRefreshKey();
  const recipes = getRecipes();
  const sugarItems = getInventoryByCategory('sugar');
  const yeastItems = getInventoryByCategory('yeast');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyRecipe());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  void key;

  const selected = recipes.find((r) => r.id === selectedId);

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyRecipe());
    setShowForm(true);
  };

  const openEdit = (recipe: Recipe) => {
    setEditId(recipe.id);
    setForm({
      name: recipe.name,
      spirit_type: recipe.spirit_type,
      grain_type: recipe.grain_type,
      grain_lbs: recipe.grain_lbs,
      water_gal: recipe.water_gal,
      yeast_strain: recipe.yeast_strain,
      yeast_lbs: recipe.yeast_lbs,
      target_brix: recipe.target_brix,
      target_final_brix: recipe.target_final_brix,
      notes: recipe.notes,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    saveRecipe(form, editId);
    setShowForm(false);
    refresh();
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this recipe?')) {
      deleteRecipe(id);
      if (selectedId === id) setSelectedId(null);
      refresh();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Recipes</h2>
        <p>Saved wash and fermentation formulas for repeat batches</p>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + Add Recipe
          </button>
        </div>
      </div>

      {recipes.length === 0 ? (
        <div className="empty-state card">
          <p>No recipes yet. Create a formula to reuse when starting new wash batches.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recipe</th>
                <th>Spirit Type</th>
                <th>Sugar</th>
                <th>Sugar (lbs)</th>
                <th>Batch Size (gal)</th>
                <th>Yeast</th>
                <th>Target Brix</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((r) => (
                <tr
                  key={r.id}
                  className={selectedId === r.id ? 'selected-row' : ''}
                  onClick={() => setSelectedId(r.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td><strong>{r.name}</strong></td>
                  <td>{r.spirit_type || '—'}</td>
                  <td>{r.grain_type || '—'}</td>
                  <td>{r.grain_lbs || '—'}</td>
                  <td>{r.water_gal || '—'}</td>
                  <td>{r.yeast_strain || '—'}</td>
                  <td>{r.target_brix ?? '—'}</td>
                  <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="detail-panel card" style={{ marginTop: '1rem' }}>
          <h3>{selected.name}</h3>
          <dl className="detail-grid">
            <dt>Spirit type</dt><dd>{selected.spirit_type || '—'}</dd>
            <dt>Sugar type</dt><dd>{selected.grain_type || '—'}</dd>
            <dt>Sugar (lbs)</dt><dd>{selected.grain_lbs}</dd>
            <dt>Batch size (gal)</dt><dd>{selected.water_gal}</dd>
            <dt>Yeast strain</dt><dd>{selected.yeast_strain || '—'}</dd>
            <dt>Yeast (lbs)</dt><dd>{selected.yeast_lbs}</dd>
            <dt>Target start brix</dt><dd>{selected.target_brix ?? '—'}</dd>
            <dt>Target final brix</dt><dd>{selected.target_final_brix ?? '—'}</dd>
            {selected.notes && (
              <>
                <dt>Notes</dt><dd>{selected.notes}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Recipe' : 'New Recipe'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Recipe Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Molasses Wash"
              />
            </div>
            <div className="form-group">
              <label>Spirit Type</label>
              <input
                value={form.spirit_type}
                onChange={(e) => setForm({ ...form, spirit_type: e.target.value })}
                placeholder="Rum, Vodka, Whiskey…"
              />
            </div>
            <div className="form-group">
              <label>Sugar Type</label>
              <select
                value={form.grain_type}
                onChange={(e) => setForm({ ...form, grain_type: e.target.value })}
              >
                <option value="">— Select sugar from inventory —</option>
                {sugarItems.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
                {form.grain_type && !sugarItems.some((i) => i.name === form.grain_type) && (
                  <option value={form.grain_type}>{form.grain_type}</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>Sugar (lbs)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.grain_lbs || ''}
                onChange={(e) => setForm({ ...form, grain_lbs: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Batch Size (gal)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.water_gal || ''}
                onChange={(e) => setForm({ ...form, water_gal: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Yeast Strain</label>
              <select
                value={form.yeast_strain}
                onChange={(e) => setForm({ ...form, yeast_strain: e.target.value })}
              >
                <option value="">— Select yeast from inventory —</option>
                {yeastItems.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
                {form.yeast_strain && !yeastItems.some((i) => i.name === form.yeast_strain) && (
                  <option value={form.yeast_strain}>{form.yeast_strain}</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>Yeast (lbs)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.yeast_lbs || ''}
                onChange={(e) => setForm({ ...form, yeast_lbs: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Target Start Brix</label>
              <input
                type="number"
                step="0.1"
                value={form.target_brix ?? ''}
                onChange={(e) =>
                  setForm({ ...form, target_brix: e.target.value ? parseFloat(e.target.value) : null })
                }
              />
            </div>
            <div className="form-group">
              <label>Target Final Brix</label>
              <input
                type="number"
                step="0.1"
                value={form.target_final_brix ?? ''}
                onChange={(e) =>
                  setForm({ ...form, target_final_brix: e.target.value ? parseFloat(e.target.value) : null })
                }
              />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
              Save Recipe
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
