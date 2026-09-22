import { useState } from 'react';
import {
  getRecipes,
  getInventoryByCategory,
  saveRecipe,
  deleteRecipe,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { BlendRecipesTab } from '../components/BlendRecipesTab';
import { useAuth } from '../context/AuthContext';
import {
  emptyRecipeNutrient,
  formatRecipeNutrientsSummary,
  WASH_NUTRIENT_UNITS,
} from '../lib/wash-recipe-nutrients';
import type { Recipe, RecipeNutrientInput } from '../types';

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

type RecipeTab = 'wash' | 'blend';
export function Recipes() {
  const { hasPermission } = useAuth();
  const canWash = hasPermission('wash');
  const canBlend = hasPermission('blending');
  const defaultTab: RecipeTab = canWash ? 'wash' : 'blend';
  const { key, refresh } = useRefreshKey();
  const recipes = getRecipes();
  const sugarItems = getInventoryByCategory('sugar');
  const yeastItems = getInventoryByCategory('yeast');
  const nutrientItems = getInventoryByCategory('nutrients');
  const [tab, setTab] = useState<RecipeTab>(defaultTab);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyRecipe());
  const [nutrients, setNutrients] = useState<RecipeNutrientInput[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  void key;

  const selected = recipes.find((r) => r.id === selectedId);

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyRecipe());
    setNutrients([]);
    setShowForm(true);
  };

  const openEdit = (recipe: Recipe) => {
    const full = recipes.find((r) => r.id === recipe.id);
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
    setNutrients(
      (full?.nutrients ?? []).map((n) => ({
        name: n.name,
        amount: n.amount,
        unit: n.unit,
        inventory_item_id: n.inventory_item_id,
        notes: n.notes,
      })),
    );
    setShowForm(true);
  };

  const updateNutrient = (index: number, patch: Partial<RecipeNutrientInput>) => {
    setNutrients((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleNutrientInventorySelect = (index: number, itemId: string) => {
    if (!itemId) {
      updateNutrient(index, { inventory_item_id: null });
      return;
    }
    const item = nutrientItems.find((i) => i.id === Number(itemId));
    if (!item) return;
    updateNutrient(index, {
      inventory_item_id: item.id,
      name: item.name,
      unit: WASH_NUTRIENT_UNITS.includes(item.unit as typeof WASH_NUTRIENT_UNITS[number])
        ? item.unit
        : 'lbs',
    });
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    saveRecipe(form, editId, nutrients);
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
        <p>Saved wash and blend formulas for repeat batches</p>
        {tab === 'wash' && canWash && (
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={openNew}>
              + Add Wash Recipe
            </button>
          </div>
        )}
      </div>

      {canWash && canBlend && (
        <div className="recipe-tabs" role="tablist" aria-label="Recipe type">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'wash'}
            className={`recipe-tab${tab === 'wash' ? ' active' : ''}`}
            onClick={() => setTab('wash')}
          >
            Wash &amp; Fermentation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'blend'}
            className={`recipe-tab${tab === 'blend' ? ' active' : ''}`}
            onClick={() => setTab('blend')}
          >
            Blending
          </button>
        </div>
      )}

      {tab === 'wash' && canWash && (
        <>
          {recipes.length === 0 ? (
            <div className="empty-state card">
              <p>No wash recipes yet. Create a formula to reuse when starting new wash batches.</p>
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
                    <th>Nutrients</th>
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
                      <td>{r.nutrients.length ? formatRecipeNutrientsSummary(r.nutrients) : '—'}</td>
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
                <dt>Nutrient additions</dt>
                <dd>
                  {selected.nutrients.length
                    ? (
                      <ul className="recipe-nutrient-list">
                        {selected.nutrients.map((n) => (
                          <li key={n.id}>
                            {formatRecipeNutrientsSummary([n])}
                            {n.notes ? ` — ${n.notes}` : ''}
                          </li>
                        ))}
                      </ul>
                    )
                    : '—'}
                </dd>
                {selected.notes && (
                  <>
                    <dt>Notes</dt><dd>{selected.notes}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </>
      )}

      {tab === 'blend' && canBlend && <BlendRecipesTab />}

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

            <section className="form-group full-width blend-recipe-section">
              <div className="blend-recipe-section-header">
                <h4 className="blend-recipe-section-title">Yeast nutrients</h4>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setNutrients((prev) => [...prev, emptyRecipeNutrient()])}
                >
                  + Add nutrient
                </button>
              </div>
              {nutrients.length === 0 ? (
                <p className="field-hint blend-recipe-empty-hint">
                  Optional DAP, ammonium sulphate, or other additions at wort prep (per IBD molasses wash practice).
                </p>
              ) : (
                <div className="blend-recipe-card-list">
                  {nutrients.map((row, index) => (
                    <article key={index} className="blend-recipe-additive-card">
                      <header className="blend-recipe-card-header">
                        <span className="blend-recipe-card-title">
                          {row.name.trim() || 'Nutrient'}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setNutrients((prev) => prev.filter((_, i) => i !== index))}
                        >
                          Remove
                        </button>
                      </header>
                      <div className="blend-recipe-additive-fields">
                        <div className="form-group">
                          <label>Inventory item</label>
                          <select
                            value={row.inventory_item_id ?? ''}
                            onChange={(e) => handleNutrientInventorySelect(index, e.target.value)}
                          >
                            <option value="">— Select or type name —</option>
                            {nutrientItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.quantity} {item.unit})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Name</label>
                          <input
                            value={row.name}
                            onChange={(e) => updateNutrient(index, { name: e.target.value })}
                            placeholder="Diammonium Phosphate (DAP)"
                          />
                        </div>
                      </div>
                      <div className="wizard-additive-amount-row blend-recipe-amount-row">
                        <div className="form-group">
                          <label>Amount</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.amount || ''}
                            onChange={(e) => updateNutrient(index, { amount: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Unit</label>
                          <select
                            value={row.unit}
                            onChange={(e) => updateNutrient(index, { unit: e.target.value })}
                          >
                            {WASH_NUTRIENT_UNITS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                            {row.unit && !WASH_NUTRIENT_UNITS.includes(row.unit as typeof WASH_NUTRIENT_UNITS[number]) && (
                              <option value={row.unit}>{row.unit}</option>
                            )}
                          </select>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Notes</label>
                        <input
                          value={row.notes}
                          onChange={(e) => updateNutrient(index, { notes: e.target.value })}
                          placeholder="Added at wort prep"
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
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
