import { useEffect, useMemo, useState } from 'react';
import { BlendAbvConfirmation } from './BlendAbvConfirmation';
import { computeRecipeTheoreticalAbv } from '../lib/blend-abv-confirm';
import {
  deleteBlendRecipe,
  getBlendRecipes,
  getInventoryItems,
  saveBlendRecipe,
  useRefreshKey,
} from '../db/queries';
import { Modal } from './Modal';
import {
  BLEND_INGREDIENT_TYPES,
  defaultUnitForMode,
  formatBlendRecipeAdditive,
  formatBlendRecipeSpiritPull,
  formatSpiritPullWeightLbs,
  ingredientWeightLbs,
  filterInventoryForBlendIngredient,
  inferMeasureMode,
  measureAlternate,
  recommendMeasureMode,
  spiritWeightLbsFromVolumeGal,
  unitOptionsForBlendIngredient,
  unitsForMeasureMode,
  type MeasureMode,
} from '../lib/blending';
import type {
  BlendIngredientInput,
  BlendRecipeSpiritSourceInput,
  BlendRecipeView,
} from '../types';

const emptySpiritLine = (): BlendRecipeSpiritSourceInput => ({
  spirit_label: '',
  volume_gal: 0,
  abv: 0,
});

const emptyIngredient = (): BlendIngredientInput => ({
  ingredient_type: 'water',
  name: 'Proofing water',
  amount: 0,
  unit: defaultUnitForMode('water', recommendMeasureMode('water').mode),
  cost_per_unit: null,
  lot_number: '',
  inventory_item_id: null,
  notes: '',
});

const emptyRecipeForm = () => ({
  name: '',
  product_name: '',
  target_abv: null as number | null,
  target_brix: null as number | null,
  scale_factor: 1,
  notes: '',
});

export function BlendRecipesTab() {
  const { key, refresh } = useRefreshKey();
  const recipes = getBlendRecipes();
  const inventoryItems = getInventoryItems();
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyRecipeForm());
  const [spiritSources, setSpiritSources] = useState<BlendRecipeSpiritSourceInput[]>([emptySpiritLine()]);
  const [ingredients, setIngredients] = useState<BlendIngredientInput[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [abvConfirmed, setAbvConfirmed] = useState(false);

  void key;

  const calculatedRecipe = useMemo(
    () => computeRecipeTheoreticalAbv(spiritSources, ingredients),
    [spiritSources, ingredients],
  );

  useEffect(() => {
    setAbvConfirmed(false);
  }, [calculatedRecipe.abv, calculatedRecipe.volumeGal, form.target_abv, spiritSources, ingredients]);

  const selected = recipes.find((recipe) => recipe.id === selectedId);

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyRecipeForm());
    setSpiritSources([emptySpiritLine()]);
    setIngredients([]);
    setAbvConfirmed(false);
    setShowForm(true);
  };

  const openEdit = (recipe: BlendRecipeView) => {
    setEditId(recipe.id);
    setForm({
      name: recipe.name,
      product_name: recipe.product_name,
      target_abv: recipe.target_abv,
      target_brix: recipe.target_brix,
      scale_factor: recipe.scale_factor ?? 1,
      notes: recipe.notes,
    });
    setSpiritSources(
      recipe.spirit_sources.length > 0
        ? recipe.spirit_sources.map((source) => ({
          spirit_label: source.spirit_label,
          volume_gal: source.volume_gal,
          abv: source.abv,
        }))
        : [emptySpiritLine()],
    );
    setIngredients(
      recipe.ingredients.map((ingredient) => ({
        ingredient_type: ingredient.ingredient_type,
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        cost_per_unit: ingredient.cost_per_unit,
        lot_number: ingredient.lot_number,
        inventory_item_id: ingredient.inventory_item_id,
        notes: ingredient.notes,
      })),
    );
    setAbvConfirmed(false);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      alert('Recipe name is required.');
      return;
    }
    if (calculatedRecipe.abv != null && !abvConfirmed) {
      alert('Please confirm the calculated proof (ABV) before saving this recipe.');
      return;
    }
    try {
      saveBlendRecipe(form, spiritSources, ingredients, editId);
      setShowForm(false);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save blend recipe.');
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this blend recipe?')) return;
    deleteBlendRecipe(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  const updateIngredient = (index: number, patch: Partial<BlendIngredientInput>) => {
    setIngredients((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      if (patch.ingredient_type) {
        next.unit = defaultUnitForMode(
          patch.ingredient_type,
          recommendMeasureMode(patch.ingredient_type).mode,
        );
        if (patch.ingredient_type === 'water') {
          next.inventory_item_id = null;
          if (!next.name.trim()) next.name = 'Proofing water';
        }
      }
      return next;
    }));
  };

  const setIngredientMeasureMode = (index: number, mode: MeasureMode) => {
    setIngredients((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      return { ...row, unit: defaultUnitForMode(row.ingredient_type, mode) };
    }));
  };

  const handleInventorySelect = (index: number, rawId: string) => {
    if (!rawId) {
      updateIngredient(index, { inventory_item_id: null });
      return;
    }
    const item = inventoryById.get(parseInt(rawId, 10));
    if (!item) return;
    updateIngredient(index, {
      inventory_item_id: item.id,
      name: item.name,
      unit: item.unit,
    });
  };

  return (
    <>
      {recipes.length === 0 ? (
        <div className="empty-state card">
          <p>No blend recipes yet. Save a formula from the blending wizard or create one here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recipe</th>
                <th>Product</th>
                <th>Target Proof</th>
                <th>Spirit pulls</th>
                <th>Additives</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((recipe) => (
                <tr
                  key={recipe.id}
                  className={selectedId === recipe.id ? 'selected-row' : ''}
                  onClick={() => setSelectedId(recipe.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td><strong>{recipe.name}</strong></td>
                  <td>{recipe.product_name || '—'}</td>
                  <td>{recipe.target_abv != null ? `${recipe.target_abv}%` : '—'}</td>
                  <td>{recipe.spirit_sources.length}</td>
                  <td>{recipe.ingredients.length}</td>
                  <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(recipe)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(recipe.id)}>
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
            <dt>Product</dt><dd>{selected.product_name || '—'}</dd>
            <dt>Target proof</dt><dd>{selected.target_abv != null ? `${selected.target_abv}%` : '—'}</dd>
            <dt>Target Brix</dt><dd>{selected.target_brix ?? '—'}</dd>
            {selected.notes && (
              <>
                <dt>Notes</dt><dd>{selected.notes}</dd>
              </>
            )}
          </dl>
          {selected.spirit_sources.length > 0 && (
            <>
              <h4>Spirit pulls</h4>
              <ul>
                {selected.spirit_sources.map((source, index) => (
                  <li key={index}>
                    {formatBlendRecipeSpiritPull(
                      source.spirit_label || `Spirit ${index + 1}`,
                      source.volume_gal,
                      source.abv,
                    )}
                  </li>
                ))}
              </ul>
              {(() => {
                const totalLbs = selected.spirit_sources.reduce(
                  (sum, source) => sum + spiritWeightLbsFromVolumeGal(source.volume_gal, source.abv),
                  0,
                );
                if (totalLbs <= 0) return null;
                return (
                  <p className="field-hint" style={{ marginTop: '0.35rem' }}>
                    Total spirit weight: {totalLbs >= 10 ? totalLbs.toFixed(1) : totalLbs.toFixed(2)} lbs
                  </p>
                );
              })()}
            </>
          )}
          {selected.ingredients.length > 0 && (
            <>
              <h4>Additives</h4>
              <ul>
                {selected.ingredients.map((ingredient, index) => {
                  const linked = ingredient.inventory_item_id
                    ? inventoryById.get(ingredient.inventory_item_id)
                    : null;
                  return (
                    <li key={index}>
                      {formatBlendRecipeAdditive(ingredient)}
                      {linked && (
                        <span className="field-hint"> · Inventory: {linked.name}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {(() => {
                const totalLbs = selected.ingredients.reduce(
                  (sum, ingredient) => sum + ingredientWeightLbs(ingredient),
                  0,
                );
                if (totalLbs <= 0) return null;
                return (
                  <p className="field-hint" style={{ marginTop: '0.35rem' }}>
                    Total additive weight: {totalLbs >= 10 ? totalLbs.toFixed(1) : totalLbs.toFixed(2)} lbs
                  </p>
                );
              })()}
            </>
          )}
        </div>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Blend Recipe' : 'New Blend Recipe'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Recipe name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Spiced Rum 80 proof"
              />
            </div>
            <div className="form-group">
              <label>Product name</label>
              <input
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                placeholder="Default product name for new batches"
              />
            </div>
            <div className="form-group">
              <label>Target proof (ABV %)</label>
              <input
                type="number"
                step="0.1"
                value={form.target_abv ?? ''}
                onChange={(e) => setForm({
                  ...form,
                  target_abv: e.target.value ? parseFloat(e.target.value) : null,
                })}
              />
            </div>
            <div className="form-group">
              <label>Target Brix</label>
              <input
                type="number"
                step="0.1"
                value={form.target_brix ?? ''}
                onChange={(e) => setForm({
                  ...form,
                  target_brix: e.target.value ? parseFloat(e.target.value) : null,
                })}
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

            <div className="form-group full-width bottling-lines-section">
              <div className="bottling-lines-header">
                <label>Spirit pulls</label>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setSpiritSources((prev) => [...prev, emptySpiritLine()])}
                >
                  + Add spirit
                </button>
              </div>
              {spiritSources.map((source, index) => (
                <div key={index} className="bottling-line-row">
                  <div className="form-group">
                    <label>Label</label>
                    <input
                      value={source.spirit_label}
                      onChange={(e) => setSpiritSources((prev) => prev.map((row, i) => (
                        i === index ? { ...row, spirit_label: e.target.value } : row
                      )))}
                      placeholder="High proof cane"
                    />
                  </div>
                  <div className="form-group">
                    <label>Volume (gal)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={source.volume_gal || ''}
                      onChange={(e) => setSpiritSources((prev) => prev.map((row, i) => (
                        i === index ? { ...row, volume_gal: parseFloat(e.target.value) || 0 } : row
                      )))}
                    />
                    {(() => {
                      const weight = formatSpiritPullWeightLbs(source.volume_gal, source.abv);
                      return weight ? (
                        <span className="field-hint" title="TTB Table No. 3 at 60 °F">
                          ≈ {weight}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="form-group">
                    <label>ABV %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={source.abv || ''}
                      onChange={(e) => setSpiritSources((prev) => prev.map((row, i) => (
                        i === index ? { ...row, abv: parseFloat(e.target.value) || 0 } : row
                      )))}
                    />
                  </div>
                  <div className="form-group bottling-line-meta">
                    {spiritSources.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setSpiritSources((prev) => prev.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="form-group full-width bottling-lines-section">
              <div className="bottling-lines-header">
                <label>Additives</label>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setIngredients((prev) => [...prev, emptyIngredient()])}
                >
                  + Add additive
                </button>
              </div>
              {ingredients.map((ingredient, index) => {
                const measureMode = inferMeasureMode(ingredient.unit);
                const recommendation = recommendMeasureMode(ingredient.ingredient_type);
                const unitOptions = unitOptionsForBlendIngredient(ingredient);
                const inventoryOptions = filterInventoryForBlendIngredient(
                  inventoryItems,
                  ingredient.ingredient_type,
                );
                const isWater = ingredient.ingredient_type === 'water';

                return (
                  <div key={index} className="wizard-additive-card" style={{ marginBottom: '0.75rem' }}>
                    <div className="bottling-line-row">
                      <div className="form-group">
                        <label>Type</label>
                        <select
                          value={ingredient.ingredient_type}
                          onChange={(e) => updateIngredient(index, {
                            ingredient_type: e.target.value as BlendIngredientInput['ingredient_type'],
                          })}
                        >
                          {BLEND_INGREDIENT_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Name</label>
                        <input
                          value={ingredient.name}
                          onChange={(e) => updateIngredient(index, { name: e.target.value })}
                        />
                      </div>
                      {!isWater && (
                        <div className="form-group">
                          <label>Inventory item</label>
                          <select
                            value={ingredient.inventory_item_id ?? ''}
                            onChange={(e) => handleInventorySelect(index, e.target.value)}
                          >
                            <option value="">— Select item —</option>
                            {inventoryOptions.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.quantity} {item.unit})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="form-group bottling-line-meta">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== index))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {!isWater && (
                      <div className="measure-mode-toggle">
                        <span className="measure-mode-label">Measure by</span>
                        <div className="measure-mode-buttons">
                          <button
                            type="button"
                            className={`btn btn-sm ${measureMode === 'weight' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setIngredientMeasureMode(index, 'weight')}
                          >
                            Weight
                            {recommendation.mode === 'weight' && <span className="measure-best-tag">Best</span>}
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${measureMode === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setIngredientMeasureMode(index, 'volume')}
                          >
                            Volume
                            {recommendation.mode === 'volume' && <span className="measure-best-tag">Best</span>}
                          </button>
                        </div>
                      </div>
                    )}
                    {isWater && (
                      <p className="field-hint">Water is measured by volume only (not tied to inventory).</p>
                    )}
                    <div className="bottling-line-row">
                      <div className="form-group">
                        <label>Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={ingredient.amount || ''}
                          onChange={(e) => updateIngredient(index, {
                            amount: parseFloat(e.target.value) || 0,
                          })}
                        />
                        {(() => {
                          const alt = measureAlternate(ingredient);
                          return alt ? <span className="field-hint">{alt.label}</span> : null;
                        })()}
                      </div>
                      <div className="form-group">
                        <label>Unit</label>
                        <select
                          value={ingredient.unit}
                          onChange={(e) => updateIngredient(index, { unit: e.target.value })}
                        >
                          {(isWater
                            ? unitsForMeasureMode('water', 'volume')
                            : unitOptions
                          ).map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <BlendAbvConfirmation
              calculatedAbv={calculatedRecipe.abv}
              calculatedVolumeGal={calculatedRecipe.volumeGal}
              targetAbv={form.target_abv}
              confirmed={abvConfirmed}
              onConfirmChange={setAbvConfirmed}
              onApplyCalculatedTarget={() => setForm({
                ...form,
                target_abv: calculatedRecipe.abv != null
                  ? Math.round(calculatedRecipe.abv * 10) / 10
                  : null,
              })}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={
                !form.name.trim()
                || (calculatedRecipe.abv != null && !abvConfirmed)
              }
            >
              Save Recipe
            </button>
          </div>
        </Modal>
      )}

      <div className="page-actions" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={openNew}>+ Add Blend Recipe</button>
      </div>
    </>
  );
}
