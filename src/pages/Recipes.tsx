import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getBlendRecipes,
  getGinRecipes,
  getRecipes,
  getInventoryByCategory,
  saveBlendRecipe,
  saveGinRecipe,
  saveRecipe,
  deleteRecipe,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { BlendDesigner } from '../components/BlendDesigner';
import { BlendRecipesTab } from '../components/BlendRecipesTab';
import { GinRecipesTab } from '../components/GinRecipesTab';
import { useAuth } from '../context/AuthContext';
import { importRecipeCsv } from '../lib/recipe-import';
import { buildRecipeExport } from '../lib/recipe-export';
import { downloadCsv, rowsToCsv } from '../lib/reporting/csv';
import {
  emptyRecipeNutrient,
  formatRecipeNutrientLine,
  formatRecipeNutrientsSummary,
  NUTRIENT_UNITS,
  normalizeNutrientUnit,
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

type RecipeTab = 'wash' | 'gin' | 'blend';
export function Recipes() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canWash = hasPermission('wash');
  const canGin = hasPermission('distillation');
  const canBlend = hasPermission('blending');
  const defaultTab: RecipeTab = canWash ? 'wash' : canGin ? 'gin' : 'blend';
  const { key, refresh } = useRefreshKey();
  const recipes = getRecipes();
  const sugarItems = getInventoryByCategory('sugar');
  const yeastItems = getInventoryByCategory('yeast');
  const nutrientItems = getInventoryByCategory('nutrients');
  const [tab, setTab] = useState<RecipeTab>(defaultTab);
  const [showDesigner, setShowDesigner] = useState(false);
  const [openBlendForm, setOpenBlendForm] = useState(false);
  const [openGinForm, setOpenGinForm] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyRecipe());
  const [nutrients, setNutrients] = useState<RecipeNutrientInput[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [importNote, setImportNote] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);

  void key;

  const selected = recipes.find((r) => r.id === selectedId);

  const selectTab = (next: RecipeTab) => {
    setShowDesigner(false);
    setTab(next);
  };

  const openBlendRecipe = () => {
    setShowDesigner(false);
    setTab('blend');
    setOpenBlendForm(true);
  };

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

  const handleSave = () => {
    if (!form.name.trim()) return;
    saveRecipe(form, editId, nutrients);
    setShowForm(false);
    refresh();
  };

  const exportRecipes = () => {
    const sheet = buildRecipeExport({
      wash: canWash ? recipes : [],
      gin: canGin ? getGinRecipes() : [],
      blend: canBlend ? getBlendRecipes() : [],
    });
    if (sheet.rows.length === 0) {
      alert('No recipes to export.');
      return;
    }
    downloadCsv('recipes', rowsToCsv(sheet.headers, sheet.rows));
  };

  const importRecipes = async (file: File) => {
    const imported = importRecipeCsv(await file.text());
    const errors = [...imported.errors];
    let added = 0;
    let updated = 0;

    if (canWash) {
      const existing = new Map(getRecipes().map((recipe) => [recipe.name.trim().toLowerCase(), recipe.id]));
      for (const recipe of imported.wash) {
        const id = existing.get(recipe.name.trim().toLowerCase());
        const savedId = saveRecipe(recipe, id, recipe.nutrients);
        existing.set(recipe.name.trim().toLowerCase(), savedId);
        if (id) updated += 1;
        else added += 1;
      }
    } else if (imported.wash.length > 0) {
      errors.push('Wash recipes were skipped. This account cannot edit them.');
    }

    if (canGin) {
      const existing = new Map(getGinRecipes().map((recipe) => [recipe.name.trim().toLowerCase(), recipe.id]));
      for (const recipe of imported.gin) {
        const id = existing.get(recipe.name.trim().toLowerCase());
        try {
          const savedId = saveGinRecipe({ name: recipe.name, notes: recipe.notes }, id, recipe.botanicals);
          existing.set(recipe.name.trim().toLowerCase(), savedId);
          if (id) updated += 1;
          else added += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : `Could not save ${recipe.name}.`);
        }
      }
    } else if (imported.gin.length > 0) {
      errors.push('Gin recipes were skipped. This account cannot edit them.');
    }

    if (canBlend) {
      const existing = new Map(getBlendRecipes().map((recipe) => [recipe.name.trim().toLowerCase(), recipe.id]));
      for (const recipe of imported.blend) {
        const id = existing.get(recipe.name.trim().toLowerCase());
        try {
          const savedId = saveBlendRecipe(recipe, recipe.spirit_sources, recipe.ingredients, id);
          existing.set(recipe.name.trim().toLowerCase(), savedId);
          if (id) updated += 1;
          else added += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : `Could not save ${recipe.name}.`);
        }
      }
    } else if (imported.blend.length > 0) {
      errors.push('Blend recipes were skipped. This account cannot edit them.');
    }

    const summary: string[] = [];
    if (added > 0) summary.push(`Added ${added} ${added === 1 ? 'recipe' : 'recipes'}.`);
    if (updated > 0) summary.push(`Updated ${updated} existing ${updated === 1 ? 'recipe' : 'recipes'}.`);
    if (added === 0 && updated === 0 && errors.length === 0) summary.push('The file has no recipes.');
    setImportNote([...summary, ...errors].join(' '));
    if (added > 0 || updated > 0) refresh();
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
        <p>Saved wash, gin, and blend formulas you can run again</p>
      </div>

      <div className="recipe-page-bar">
        {[canWash, canGin, canBlend].filter(Boolean).length > 1 && (
          <div className="recipe-tabs" role="tablist" aria-label="Recipe type">
            {canWash && (
              <button
                type="button"
                role="tab"
                aria-selected={!showDesigner && tab === 'wash'}
                className={`recipe-tab${!showDesigner && tab === 'wash' ? ' active' : ''}`}
                onClick={() => selectTab('wash')}
              >
                Wash &amp; Fermentation
              </button>
            )}
            {canGin && (
              <button
                type="button"
                role="tab"
                aria-selected={!showDesigner && tab === 'gin'}
                className={`recipe-tab${!showDesigner && tab === 'gin' ? ' active' : ''}`}
                onClick={() => selectTab('gin')}
              >
                Gin
              </button>
            )}
            {canBlend && (
              <button
                type="button"
                role="tab"
                aria-selected={!showDesigner && tab === 'blend'}
                className={`recipe-tab${!showDesigner && tab === 'blend' ? ' active' : ''}`}
                onClick={() => selectTab('blend')}
              >
                Blending
              </button>
            )}
          </div>
        )}

        <div className="recipe-action-row">
          {!showDesigner && tab === 'wash' && canWash && (
            <div className="recipe-action-cluster">
              <button
                type="button"
                className="btn btn-primary"
                onClick={openNew}
                data-testid="add-wash-recipe"
              >
                + Add Wash Recipe
              </button>
            </div>
          )}
          {!showDesigner && tab === 'gin' && canGin && (
            <div className="recipe-action-cluster">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setOpenGinForm(true)}
                data-testid="add-gin-recipe"
              >
                + Add Gin Recipe
              </button>
            </div>
          )}
          {(showDesigner || tab === 'blend') && canBlend && (
            <div className="recipe-action-cluster">
              <button
                type="button"
                className="btn btn-primary"
                onClick={openBlendRecipe}
                data-testid="add-blend-recipe"
              >
                + Add blend recipe
              </button>
              <button
                type="button"
                className={`btn ${showDesigner ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={showDesigner}
                onClick={() => setShowDesigner((open) => !open)}
                data-testid="blend-designer"
              >
                Blend designer
              </button>
            </div>
          )}
          <div className="recipe-action-cluster recipe-action-cluster--end">
            <button
              type="button"
              className="recipe-io-btn"
              onClick={exportRecipes}
              data-testid="export-recipes"
            >
              Export recipes
            </button>
            <button
              type="button"
              className="recipe-io-btn"
              onClick={() => importFileRef.current?.click()}
              data-testid="import-recipes"
            >
              Import recipes
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              data-testid="import-recipes-file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importRecipes(file);
              }}
            />
          </div>
        </div>
      </div>
      {importNote && (
        <p className="field-hint" role="status" data-testid="import-recipes-result">{importNote}</p>
      )}

      {showDesigner && canBlend ? (
        <BlendDesigner
          onUseForBatch={(recipeId) => navigate(`/blending?recipe=${recipeId}`)}
        />
      ) : tab === 'wash' && canWash && (
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
                <dt>Nutrients</dt>
                <dd>
                  {selected.nutrients.length
                    ? selected.nutrients.map((n) => (
                      <div key={n.id}>
                        {formatRecipeNutrientLine(n)}
                      </div>
                    ))
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

      {!showDesigner && tab === 'gin' && canGin && (
        <GinRecipesTab openForm={openGinForm} onFormOpened={() => setOpenGinForm(false)} />
      )}

      {!showDesigner && tab === 'blend' && canBlend && (
        <BlendRecipesTab openForm={openBlendForm} onFormOpened={() => setOpenBlendForm(false)} />
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

            {nutrients.map((row, index) => (
              <div key={index} className="form-group full-width wash-nutrient-row">
                <div className="form-grid" style={{ marginBottom: 0 }}>
                  <div className="form-group">
                    <label>{index === 0 ? 'Nutrient' : `Nutrient ${index + 1}`}</label>
                    <select
                      value={row.name}
                      onChange={(e) => updateNutrient(index, { name: e.target.value })}
                    >
                      <option value="">— Select nutrient from inventory —</option>
                      {nutrientItems.map((item) => (
                        <option key={item.id} value={item.name}>{item.name}</option>
                      ))}
                      {row.name && !nutrientItems.some((i) => i.name === row.name) && (
                        <option value={row.name}>{row.name}</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={row.amount || ''}
                      onChange={(e) => updateNutrient(index, { amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <select
                      value={normalizeNutrientUnit(row.unit)}
                      onChange={(e) => updateNutrient(index, { unit: e.target.value })}
                    >
                      <optgroup label="Weight">
                        {NUTRIENT_UNITS.filter((unit) => unit.kind === 'weight').map((unit) => (
                          <option key={unit.value} value={unit.value}>{unit.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Volume">
                        {NUTRIENT_UNITS.filter((unit) => unit.kind === 'volume').map((unit) => (
                          <option key={unit.value} value={unit.value}>{unit.label}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setNutrients((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove nutrient
                </button>
              </div>
            ))}
            <div className="form-group full-width">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setNutrients((prev) => [...prev, emptyRecipeNutrient()])}
              >
                + Add nutrient
              </button>
              <p className="field-hint">
                Measure each nutrient by weight (lbs, oz, grams, kg) or volume (ml, L).
              </p>
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
