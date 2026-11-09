import { useEffect, useMemo, useState } from 'react';
import { BlendAbvConfirmation } from './BlendAbvConfirmation';
import { limitAbvInput, MAX_ENTERED_ABV } from '../lib/abv-limits';
import { roundScaledAmount } from '../lib/blend-recipe-scale';
import { parseBlendRecipeSnapshot } from '../lib/blend-recipe-version';
import {
  computeRecipeTheoreticalAbv,
  previewProofingWaterAdjustment,
  proofingWaterReconcileChanged,
  reconcileRecipeProofingWater,
  type ProofingWaterPreview,
} from '../lib/blend-abv-confirm';
import { buildRecipeAlcoholAccount } from '../lib/blend-alcohol-account';
import {
  deleteBlendRecipe,
  getBlendRecipeVersions,
  getInventoryCategories,
  getInventoryItems,
  saveBlendRecipe,
  useRefreshKey,
} from '../db/queries';
import { Modal } from './Modal';
import { AssigneeCell, AssigneeSelect } from './AssigneeSelect';
import { useAuth } from '../context/AuthContext';
import { defaultAssignee, type AssignedEmployee } from '../lib/assignee';
import { IngredientSelect } from './IngredientSelect';
import { ProofingWaterConfirm } from './ProofingWaterConfirm';
import {
  BLEND_PROOFING_WATER_CATEGORY,
  additiveSupportsAbv,
  blendIngredientTypeForCategory,
  blendInventoryCategories,
  defaultUnitForMode,
  formatBlendRecipeAdditive,
  formatBlendRecipeSpiritPull,
  ingredientWeightLbs,
  filterInventoryByCategory,
  convertIngredientAmount,
  convertSpiritAmount,
  inferMeasureMode,
  isBlendProofingWaterCategory,
  measureAlternate,
  recommendMeasureMode,
  resolvedBlendInventoryCategory,
  SPIRIT_MEASURE_RECOMMENDATION,
  spiritMeasureAlternate,
  spiritUnitsForMeasureMode,
  spiritVolumeGalFromAmount,
  toLbs,
  unitOptionsForBlendIngredient,
  resolveIngredientDensity,
  type MeasureMode,
} from '../lib/blending';
import {
  ESTIMATED_SUGAR_BRIX_LABEL,
  ESTIMATED_SUGAR_BRIX_NOTE,
  formatAbvDisplay,
  formatGallonDisplay,
  gramsFromPounds,
  perLiterView,
  PREDICTED_VOLUME_ESTIMATE_NOTE,
  VOLUME_LABEL_PREDICTED,
  VOLUME_LABEL_TARGET,
} from '../lib/formulation-quantity';
import { formulationSpiritWeightLb } from '../lib/formulation-spirit';
import { formatInventoryOnHand, inventoryCategoryLabel } from '../lib/inventory-units';
import { LITERS_PER_US_GALLON } from '../lib/material-densities';
import type {
  BlendIngredientInput,
  BlendRecipeSpiritSourceInput,
  BlendRecipeView,
  InventoryItem,
} from '../types';

type RecipeAdditiveRow = BlendIngredientInput & { inventory_category: string };

interface SpiritRecipeRow extends BlendRecipeSpiritSourceInput {
  amount: number;
  unit: string;
  /** False for older rows that stored gallons only. */
  enteredQuantityKnown: boolean;
}

const emptySpiritLine = (): SpiritRecipeRow => ({
  spirit_label: '',
  volume_gal: 0,
  abv: 0,
  amount: 0,
  unit: 'gal',
  entered_amount: null,
  entered_unit: null,
  enteredQuantityKnown: true,
});

function syncSpiritRecipeVolume(row: SpiritRecipeRow): SpiritRecipeRow {
  return {
    ...row,
    volume_gal: spiritVolumeGalFromAmount(row.amount, row.unit, row.abv),
  };
}

function toSpiritRecipeInput(row: SpiritRecipeRow): BlendRecipeSpiritSourceInput {
  const known = row.enteredQuantityKnown && row.amount > 0;
  const volume_gal = known
    ? spiritVolumeGalFromAmount(row.amount, row.unit, row.abv)
    : row.volume_gal;
  return {
    spirit_label: row.spirit_label,
    volume_gal,
    abv: row.abv,
    barrel_id: row.barrel_id,
    entered_amount: known ? row.amount : null,
    entered_unit: known ? row.unit : null,
  };
}

const emptyIngredient = (): RecipeAdditiveRow => ({
  ingredient_type: 'other',
  name: '',
  amount: 0,
  unit: defaultUnitForMode('other', recommendMeasureMode('other').mode),
  abv: null,
  cost_per_unit: null,
  lot_number: '',
  inventory_item_id: null,
  notes: '',
  inventory_category: '',
});

function toRecipeAdditiveRow(
  ingredient: BlendIngredientInput,
  items: InventoryItem[],
): RecipeAdditiveRow {
  return {
    ingredient_type: ingredient.ingredient_type,
    name: ingredient.name,
    amount: ingredient.amount,
    unit: ingredient.unit,
    abv: ingredient.abv ?? null,
    density_g_per_ml: ingredient.density_g_per_ml ?? null,
    density_assumption: ingredient.density_assumption ?? null,
    cost_per_unit: ingredient.cost_per_unit,
    lot_number: ingredient.lot_number,
    inventory_item_id: ingredient.inventory_item_id,
    notes: ingredient.notes,
    inventory_category: resolvedBlendInventoryCategory(ingredient, items),
  };
}

function toBlendIngredientInput(row: RecipeAdditiveRow): BlendIngredientInput {
  return {
    ingredient_type: row.ingredient_type,
    name: row.name,
    amount: row.amount,
    unit: row.unit,
    abv: row.abv,
    density_g_per_ml: row.density_g_per_ml,
    density_assumption: row.density_assumption,
    cost_per_unit: row.cost_per_unit,
    lot_number: row.lot_number,
    inventory_item_id: row.inventory_item_id,
    notes: row.notes,
  };
}

const emptyRecipeForm = () => ({
  name: '',
  product_name: '',
  target_abv: null as number | null,
  target_brix: null as number | null,
  target_sugar_g_per_l: null as number | null,
  target_volume_gal: null as number | null,
  scale_factor: 1,
  notes: '',
});

export function BlendRecipesTab({
  openForm = false,
  onFormOpened,
  recipes,
  totalRecipeCount,
}: {
  openForm?: boolean;
  onFormOpened?: () => void;
  recipes: BlendRecipeView[];
  totalRecipeCount: number;
}) {
  const { user } = useAuth();
  const { key, refresh } = useRefreshKey();
  const inventoryItems = getInventoryItems();
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const inventoryCategories = useMemo(
    () => blendInventoryCategories([
      ...getInventoryCategories(),
      ...inventoryItems.map((item) => item.category),
    ]),
    [key],
  );
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyRecipeForm());
  const [spiritSources, setSpiritSources] = useState<SpiritRecipeRow[]>([emptySpiritLine()]);
  const [ingredients, setIngredients] = useState<RecipeAdditiveRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [abvConfirmed, setAbvConfirmed] = useState(false);
  const [proofingPreview, setProofingPreview] = useState<ProofingWaterPreview | null>(null);
  const [originalWater, setOriginalWater] = useState<RecipeAdditiveRow[]>([]);
  const [assignee, setAssignee] = useState<AssignedEmployee>(defaultAssignee(null));

  void key;

  const syncedSpiritSources = useMemo(
    () => spiritSources.map(syncSpiritRecipeVolume),
    [spiritSources],
  );

  const calculatedRecipe = useMemo(
    () => computeRecipeTheoreticalAbv(
      syncedSpiritSources.map(toSpiritRecipeInput),
      ingredients,
    ),
    [syncedSpiritSources, ingredients],
  );

  useEffect(() => {
    setAbvConfirmed(false);
  }, [calculatedRecipe.abv, calculatedRecipe.volumeGal, form.target_abv]);

  const formulationInputsKey = useMemo(
    () => JSON.stringify({
      target: form.target_abv,
      spirits: syncedSpiritSources.map((source) => ({
        volume_gal: source.volume_gal,
        abv: source.abv,
        amount: source.amount,
        unit: source.unit,
      })),
      additives: ingredients
        .filter((row) => row.ingredient_type !== 'water')
        .map((row) => ({
          ingredient_type: row.ingredient_type,
          name: row.name,
          amount: row.amount,
          unit: row.unit,
          density_g_per_ml: row.density_g_per_ml,
          density_assumption: row.density_assumption,
          sugar_mass_fraction: row.sugar_mass_fraction,
        })),
    }),
    [form.target_abv, syncedSpiritSources, ingredients],
  );

  useEffect(() => {
    if (form.target_abv == null || !(form.target_abv > 0)) return;
    setIngredients((prev) => {
      const reconciled = reconcileRecipeProofingWater(
        syncedSpiritSources.map(toSpiritRecipeInput),
        prev.map(toBlendIngredientInput),
        form.target_abv,
      );
      if (!proofingWaterReconcileChanged(prev.map(toBlendIngredientInput), reconciled)) return prev;
      return reconciled.map((row) => {
        const prior = prev.find(
          (item) => item.ingredient_type === row.ingredient_type
            && (row.ingredient_type === 'water' || item.name.trim() === row.name.trim()),
        );
        return prior
          ? { ...toRecipeAdditiveRow(row, inventoryItems), inventory_category: prior.inventory_category }
          : toRecipeAdditiveRow(row, inventoryItems);
      });
    });
  }, [formulationInputsKey]);

  const selected = recipes.find((recipe) => recipe.id === selectedId);

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyRecipeForm());
    setSpiritSources([emptySpiritLine()]);
    setIngredients([]);
    setOriginalWater([]);
    setProofingPreview(null);
    setAbvConfirmed(false);
    setAssignee(defaultAssignee(user));
    setShowForm(true);
  };

  useEffect(() => {
    if (!openForm) return;
    openNew();
    onFormOpened?.();
  }, [openForm]);

  const openEdit = (recipe: BlendRecipeView) => {
    setEditId(recipe.id);
    setForm({
      name: recipe.name,
      product_name: recipe.product_name,
      target_abv: recipe.target_abv,
      target_brix: recipe.target_brix,
      target_sugar_g_per_l: recipe.target_sugar_g_per_l,
      target_volume_gal: recipe.target_volume_gal,
      scale_factor: recipe.scale_factor ?? 1,
      notes: recipe.notes,
    });
    setSpiritSources(
      recipe.spirit_sources.length > 0
        ? recipe.spirit_sources.map((source) => {
          const known = source.entered_amount != null && source.entered_amount > 0 && !!source.entered_unit;
          return {
            spirit_label: source.spirit_label,
            volume_gal: source.volume_gal,
            abv: source.abv,
            barrel_id: source.barrel_id,
            amount: known ? source.entered_amount! : source.volume_gal,
            unit: known ? source.entered_unit! : 'gal',
            entered_amount: known ? source.entered_amount : null,
            entered_unit: known ? source.entered_unit : null,
            enteredQuantityKnown: known,
          };
        })
        : [emptySpiritLine()],
    );
    const loadedIngredients = recipe.ingredients.map((ingredient) => (
      toRecipeAdditiveRow(ingredient, inventoryItems)
    ));
    setIngredients(loadedIngredients);
    setOriginalWater(loadedIngredients.filter((ingredient) => ingredient.ingredient_type === 'water'));
    setProofingPreview(null);
    setAbvConfirmed(false);
    setAssignee({
      assigned_user_id: recipe.assigned_user_id,
      assigned_user_name: recipe.assigned_user_name,
    });
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
      saveBlendRecipe(
        {
          ...form,
          source_type: 'tank',
          assigned_user_id: assignee.assigned_user_id,
          assigned_user_name: assignee.assigned_user_name,
        },
        syncedSpiritSources.map(toSpiritRecipeInput),
        ingredients.map(toBlendIngredientInput),
        editId,
      );
      setShowForm(false);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save blend recipe.');
    }
  };

  const requestProofingWater = () => {
    if (form.target_abv == null) return;
    const preview = previewProofingWaterAdjustment(
      syncedSpiritSources.map(toSpiritRecipeInput),
      ingredients,
      form.target_abv,
    );
    if ('error' in preview) {
      alert(preview.error);
      setProofingPreview(null);
      return;
    }
    setProofingPreview(preview);
  };

  const confirmProofingWater = () => {
    if (!proofingPreview) return;
    const gallons = proofingPreview.proposedWaterGal;
    setIngredients((prev) => {
      const existing = prev.find((row) => row.ingredient_type === 'water');
      const unit = existing?.unit && existing.unit !== 'each' ? existing.unit : 'gal';
      const rawAmount = unit === 'gal'
        ? gallons
        : convertIngredientAmount(
          { amount: gallons, unit: 'gal', ingredient_type: 'water' },
          unit,
        );
      const amount = roundScaledAmount(rawAmount);
      const others = prev.filter((row) => row.ingredient_type !== 'water');
      if (gallons <= 0) return others;
      return [
        ...others,
        {
          ingredient_type: 'water',
          name: existing?.name?.trim() || 'Proofing water',
          amount,
          unit,
          abv: null,
          density_g_per_ml: null,
          density_assumption: null,
          cost_per_unit: existing?.cost_per_unit ?? null,
          lot_number: existing?.lot_number ?? '',
          inventory_item_id: null,
          notes: existing?.notes ?? '',
          inventory_category: BLEND_PROOFING_WATER_CATEGORY,
        },
      ];
    });
    setProofingPreview(null);
  };

  const restoreOriginalWater = () => {
    setIngredients((prev) => [
      ...prev.filter((row) => row.ingredient_type !== 'water'),
      ...originalWater.map((row) => ({ ...row })),
    ]);
    setProofingPreview(null);
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this blend recipe?')) return;
    try {
      deleteBlendRecipe(id);
      if (selectedId === id) setSelectedId(null);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not delete this blend recipe.');
    }
  };

  const updateIngredient = (index: number, patch: Partial<RecipeAdditiveRow>) => {
    setIngredients((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      if (patch.unit != null && patch.unit !== row.unit && patch.amount === undefined && !patch.ingredient_type) {
        next.amount = convertIngredientAmount(row, patch.unit);
      }
      if (patch.ingredient_type) {
        next.unit = defaultUnitForMode(
          patch.ingredient_type,
          recommendMeasureMode(patch.ingredient_type).mode,
        );
        if (patch.ingredient_type === 'water') {
          next.inventory_item_id = null;
          if (!next.name.trim()) next.name = 'Proofing water';
        }
        if (!additiveSupportsAbv(patch.ingredient_type)) next.abv = null;
      }
      return next;
    }));
  };

  const setIngredientMeasureMode = (index: number, mode: MeasureMode) => {
    setIngredients((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      if (inferMeasureMode(row.unit) === mode) return row;
      const unit = defaultUnitForMode(row.ingredient_type, mode);
      return {
        ...row,
        unit,
        amount: convertIngredientAmount(row, unit),
      };
    }));
  };

  const updateSpiritSource = (index: number, patch: Partial<SpiritRecipeRow>) => {
    setSpiritSources((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      if (patch.unit != null && patch.unit !== row.unit && patch.amount === undefined) {
        next.amount = convertSpiritAmount(row.amount, row.unit, patch.unit, next.abv);
        next.enteredQuantityKnown = true;
      }
      if (patch.amount !== undefined) next.enteredQuantityKnown = true;
      return syncSpiritRecipeVolume(next);
    }));
  };

  const setSpiritMeasureMode = (index: number, mode: MeasureMode) => {
    setSpiritSources((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      if (inferMeasureMode(row.unit) === mode) return row;
      const unit = mode === 'volume' ? 'gal' : 'lbs';
      return syncSpiritRecipeVolume({
        ...row,
        unit,
        amount: convertSpiritAmount(row.amount, row.unit, unit, row.abv),
        enteredQuantityKnown: true,
      });
    }));
  };

  const handleCategorySelect = (index: number, category: string) => {
    const ingredientType = blendIngredientTypeForCategory(category);
    setIngredients((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const next: RecipeAdditiveRow = {
        ...row,
        inventory_category: category,
        ingredient_type: ingredientType,
      };
      if (ingredientType === 'water' || isBlendProofingWaterCategory(category)) {
        return {
          ...next,
          ingredient_type: 'water',
          inventory_category: BLEND_PROOFING_WATER_CATEGORY,
          inventory_item_id: null,
          name: row.name.trim() && row.ingredient_type === 'water' ? row.name : 'Proofing water',
          unit: defaultUnitForMode('water', recommendMeasureMode('water').mode),
          amount: inferMeasureMode(row.unit) === inferMeasureMode(defaultUnitForMode('water', recommendMeasureMode('water').mode))
            ? convertIngredientAmount(row, defaultUnitForMode('water', recommendMeasureMode('water').mode))
            : 0,
          abv: null,
          density_g_per_ml: null,
          density_assumption: null,
        };
      }
      const current = row.inventory_item_id != null ? inventoryById.get(row.inventory_item_id) : undefined;
      const sameCategory = current
        && current.category.toLowerCase() === category.trim().toLowerCase();
      next.unit = defaultUnitForMode(ingredientType, recommendMeasureMode(ingredientType).mode);
      if (!sameCategory) {
        next.inventory_item_id = null;
        next.name = '';
        next.abv = null;
        next.density_g_per_ml = null;
        next.density_assumption = null;
      }
      if (!additiveSupportsAbv(ingredientType)) next.abv = null;
      return next;
    }));
  };

  const handleInventorySelect = (index: number, rawId: string) => {
    if (!rawId) {
      updateIngredient(index, { inventory_item_id: null, name: '' });
      return;
    }
    const item = inventoryById.get(parseInt(rawId, 10));
    if (!item) return;
    const ingredientType = blendIngredientTypeForCategory(item.category);
    updateIngredient(index, {
      inventory_item_id: item.id,
      inventory_category: item.category,
      ingredient_type: ingredientType,
      name: item.name,
      unit: item.unit,
      abv: item.abv ?? null,
      density_g_per_ml: item.density_g_per_ml ?? null,
      density_assumption: null,
    });
  };

  return (
    <>
      {recipes.length === 0 ? (
        <div className="empty-state card">
          <p>{totalRecipeCount === 0
            ? 'No blend recipes yet. Save a formula from the blending wizard or create one here.'
            : 'No blend recipes match this employee filter.'}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recipe</th>
                <th>Employee</th>
                <th>Version</th>
                <th>Product</th>
                <th className="num">Target Proof</th>
                <th className="num">Spirit pulls</th>
                <th className="num">Additives</th>
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
                  <td><AssigneeCell name={recipe.assigned_user_name} /></td>
                  <td>{recipe.current_version_number != null ? `V${recipe.current_version_number}` : '—'}</td>
                  <td>{recipe.product_name || '—'}</td>
                  <td className="num">{recipe.target_abv != null ? `${recipe.target_abv}%` : '—'}</td>
                  <td className="num">{recipe.spirit_sources.length}</td>
                  <td className="num">{recipe.ingredients.length}</td>
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
            <dt>Employee</dt><dd><AssigneeCell name={selected.assigned_user_name} /></dd>
            <dt>Product</dt><dd>{selected.product_name || '—'}</dd>
            <dt>Target proof</dt><dd>{selected.target_abv != null ? `${selected.target_abv}%` : '—'}</dd>
            <dt>{ESTIMATED_SUGAR_BRIX_LABEL}</dt><dd>{selected.target_brix ?? '—'}</dd>
            <dt>{VOLUME_LABEL_TARGET}</dt><dd>{selected.target_volume_gal != null ? `${formatGallonDisplay(selected.target_volume_gal)} gal` : '—'}</dd>
            <dt>Sugar</dt><dd>{selected.target_sugar_g_per_l != null ? `${selected.target_sugar_g_per_l} g/L` : '—'}</dd>
            <dt>Version</dt><dd>{selected.current_version_number != null ? `V${selected.current_version_number}` : '—'}</dd>
            {selected.notes && (
              <>
                <dt>Notes</dt><dd>{selected.notes}</dd>
              </>
            )}
          </dl>
          <h4>Versions</h4>
          <ul>
            {getBlendRecipeVersions(selected.id).map((version) => {
              const snapshot = parseBlendRecipeSnapshot(version.snapshot_json);
              const when = version.created_at.slice(0, 10);
              return (
                <li key={version.id}>
                  V{version.version_number}
                  {when ? ` · ${when}` : ''}
                  {snapshot?.target_abv != null ? ` · ${snapshot.target_abv}% ABV` : ''}
                  {snapshot?.target_sugar_g_per_l != null ? ` · ${snapshot.target_sugar_g_per_l} g/L sugar` : ''}
                </li>
              );
            })}
          </ul>
          <p className="field-hint">Editing this recipe saves a new version. A batch keeps the version it was started from.</p>
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
                      { amount: source.entered_amount, unit: source.entered_unit },
                    )}
                  </li>
                ))}
              </ul>
              {(() => {
                const known = selected.spirit_sources.filter((source) =>
                  source.entered_amount != null && source.entered_unit && ['lbs', 'oz', 'kg', 'g'].includes(source.entered_unit.toLowerCase()),
                );
                if (known.length === 0) {
                  return (
                    <p className="field-hint" style={{ marginTop: '0.35rem' }}>
                      The originally entered quantity was not recorded for these spirit pulls. Stored gallons are shown as recorded.
                    </p>
                  );
                }
                const totalLbs = known.reduce((sum, source) => sum + toLbs(source.entered_amount ?? 0, source.entered_unit ?? 'lbs'), 0);
                return (
                  <p className="field-hint" style={{ marginTop: '0.35rem' }}>
                    Entered spirit weight: {totalLbs >= 10 ? totalLbs.toFixed(1) : totalLbs.toFixed(2)} lbs
                  </p>
                );
              })()}
              {(() => {
                const predicted = computeRecipeTheoreticalAbv(selected.spirit_sources, selected.ingredients);
                if (!(predicted.volumeGal != null && predicted.volumeGal > 0)) return null;
                const liters = predicted.volumeGal * LITERS_PER_US_GALLON;
                const lines = [
                  ...selected.spirit_sources.map((source) => {
                    const enteredWeight = source.entered_amount != null && source.entered_unit
                      && ['lbs', 'oz', 'kg', 'g'].includes(source.entered_unit.toLowerCase());
                    const pounds = enteredWeight
                      ? toLbs(source.entered_amount ?? 0, source.entered_unit ?? 'lbs')
                      : formulationSpiritWeightLb(source.volume_gal, source.abv);
                    return {
                      name: enteredWeight ? (source.spirit_label || 'Spirit') : `${source.spirit_label || 'Spirit'} (from stored gallons)`,
                      grams: gramsFromPounds(pounds),
                    };
                  }),
                  ...selected.ingredients.map((ingredient) => ({
                    name: ingredient.name || ingredient.ingredient_type,
                    grams: gramsFromPounds(toLbs(ingredient.amount, ingredient.unit)),
                  })),
                ].filter((line) => line.grams > 0);
                const view = perLiterView(lines, liters, 'predicted');
                return (
                  <>
                    <h4>{VOLUME_LABEL_PREDICTED}</h4>
                    <p>
                      {formatGallonDisplay(liters)} L ({formatGallonDisplay(predicted.volumeGal)} gal)
                      {predicted.abv != null ? ` at ${formatAbvDisplay(predicted.abv)} predicted ABV` : ''}
                      {(() => {
                        const account = buildRecipeAlcoholAccount(selected.spirit_sources, selected.ingredients);
                        if (!account.ok) return '';
                        const abw = account.predictedAbw != null
                          ? `, ${account.predictedAbw.toFixed(2)}% alcohol by weight`
                          : ', alcohol by weight withheld until ingredient mass is known';
                        return ` (${account.volumeStatus}${abw})`;
                      })()}
                    </p>
                    <p className="field-hint">{PREDICTED_VOLUME_ESTIMATE_NOTE}</p>
                    <p className="field-hint">{view.note}</p>
                    <ul>
                      {view.lines.map((line) => (
                        <li key={line.name}>
                          {line.name}: {line.gramsPerLiter != null ? line.gramsPerLiter.toFixed(3) : '—'} g/L using {view.basisLabel}
                        </li>
                      ))}
                    </ul>
                  </>
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
        <Modal
          wide
          title={editId ? 'Edit Blend Recipe' : 'New Blend Recipe'}
          onClose={() => setShowForm(false)}
        >
          <div className="blend-recipe-form">
            <section className="blend-recipe-section">
              <h4 className="blend-recipe-section-title">Recipe details</h4>
              <div className="form-grid blend-recipe-basics-grid">
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
                  <label htmlFor="blend-recipe-assignee">Employee</label>
                  <AssigneeSelect
                    id="blend-recipe-assignee"
                    value={assignee}
                    onChange={setAssignee}
                  />
                </div>
                <div className="form-group">
                  <label>Target proof (ABV %)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={MAX_ENTERED_ABV}
                    value={form.target_abv ?? ''}
                    onChange={(e) => {
                      const limited = limitAbvInput(e.target.value);
                      setForm({
                        ...form,
                        target_abv: limited.trim() === '' ? null : parseFloat(limited),
                      });
                    }}
                  />
                </div>
                <div className="form-group">
                  <label>{ESTIMATED_SUGAR_BRIX_LABEL}</label>
                  <p className="field-hint">{ESTIMATED_SUGAR_BRIX_NOTE}</p>
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
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
            </section>

            <section className="blend-recipe-section">
              <div className="blend-recipe-section-header">
                <h4 className="blend-recipe-section-title">Spirit pulls</h4>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setSpiritSources((prev) => [...prev, emptySpiritLine()])}
                >
                  + Add spirit
                </button>
              </div>
              <div className="blend-recipe-card-list">
                {spiritSources.map((source, index) => {
                  const synced = syncSpiritRecipeVolume(source);
                  const measureMode = inferMeasureMode(source.unit);
                  const unitOptions = spiritUnitsForMeasureMode(measureMode);
                  const alternate = source.amount > 0 && source.abv > 0
                    ? spiritMeasureAlternate(source.amount, source.unit, source.abv)
                    : null;
                  return (
                    <article key={index} className="blend-recipe-spirit-card">
                      <header className="blend-recipe-card-header">
                        <span className="blend-recipe-card-title">
                          {source.spirit_label.trim() || `Spirit ${index + 1}`}
                        </span>
                        {spiritSources.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setSpiritSources((prev) => prev.filter((_, i) => i !== index))}
                          >
                            Remove
                          </button>
                        )}
                      </header>
                      <div className="form-group">
                        <label>Label</label>
                        <input
                          value={source.spirit_label}
                          onChange={(e) => updateSpiritSource(index, { spirit_label: e.target.value })}
                          placeholder="High proof cane"
                        />
                      </div>
                      <div className="measure-mode-toggle">
                        <span className="measure-mode-label">Measure pull by</span>
                        <div className="measure-mode-buttons">
                          <button
                            type="button"
                            data-testid={`recipe-spirit-weight-${index}`}
                            className={`btn btn-sm ${measureMode === 'weight' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setSpiritMeasureMode(index, 'weight')}
                          >
                            Weight (scale)
                          </button>
                          <button
                            type="button"
                            data-testid={`recipe-spirit-volume-${index}`}
                            className={`btn btn-sm ${measureMode === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setSpiritMeasureMode(index, 'volume')}
                          >
                            Volume (gallons)
                            {SPIRIT_MEASURE_RECOMMENDATION.mode === 'volume' && (
                              <span className="measure-best-tag">Best</span>
                            )}
                          </button>
                        </div>
                        <p className="measure-tip">{SPIRIT_MEASURE_RECOMMENDATION.reason}</p>
                      </div>
                      <div className="wizard-spirit-amount-row blend-recipe-spirit-amount-row">
                        <div className="form-group">
                          <label>Amount</label>
                          <input
                            type="number"
                            step="0.1"
                            data-testid={`recipe-spirit-amount-${index}`}
                            value={source.amount || ''}
                            onChange={(e) => updateSpiritSource(index, { amount: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Unit</label>
                          <select
                            data-testid={`recipe-spirit-unit-${index}`}
                            value={source.unit}
                            onChange={(e) => updateSpiritSource(index, { unit: e.target.value })}
                          >
                            {unitOptions.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>ABV %</label>
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            max={MAX_ENTERED_ABV}
                            value={source.abv || ''}
                            onChange={(e) => {
                              const limited = limitAbvInput(e.target.value);
                              updateSpiritSource(index, {
                                abv: limited.trim() === '' ? 0 : parseFloat(limited) || 0,
                              });
                            }}
                          />
                        </div>
                      </div>
                      {synced.volume_gal > 0 && (
                        <p className="measure-alt blend-recipe-stored-volume">
                          Calculated volume <strong>{formatGallonDisplay(synced.volume_gal)} gal</strong>
                          {!source.enteredQuantityKnown && ' · originally entered quantity was not recorded'}
                          {alternate ? ` · ${alternate.label}` : ''}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="blend-recipe-section">
              <div className="blend-recipe-section-header">
                <h4 className="blend-recipe-section-title">Additives</h4>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setIngredients((prev) => [...prev, emptyIngredient()])}
                >
                  + Add additive
                </button>
              </div>
              {ingredients.length === 0 ? (
                <p className="field-hint blend-recipe-empty-hint">No additives — pick an inventory category, then the item, or add proofing water.</p>
              ) : (
                <div className="blend-recipe-card-list">
                  {ingredients.map((ingredient, index) => {
                    const measureMode = inferMeasureMode(ingredient.unit);
                    const recommendation = recommendMeasureMode(ingredient.ingredient_type);
                    const unitOptions = unitOptionsForBlendIngredient(ingredient);
                    const selectedCategory = ingredient.inventory_category
                      || resolvedBlendInventoryCategory(ingredient, inventoryItems);
                    const isWater = ingredient.ingredient_type === 'water'
                      || isBlendProofingWaterCategory(selectedCategory);
                    const inventoryOptions = filterInventoryByCategory(inventoryItems, selectedCategory);
                    const categoryNoun = isWater
                      ? 'water'
                      : inventoryCategoryLabel(selectedCategory || 'ingredient').toLowerCase();
                    const categoryChoices = selectedCategory
                      && !isWater
                      && !inventoryCategories.some((name) => name.toLowerCase() === selectedCategory.toLowerCase())
                      ? [...inventoryCategories, selectedCategory]
                      : inventoryCategories;

                    return (
                      <article key={index} className="blend-recipe-additive-card">
                        <header className="blend-recipe-card-header">
                          <span className="blend-recipe-card-title">
                            {ingredient.name.trim()
                              || (isWater
                                ? 'Proofing water'
                                : (selectedCategory ? inventoryCategoryLabel(selectedCategory) : 'Additive'))}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== index))}
                          >
                            Remove
                          </button>
                        </header>
                        <div className="blend-recipe-additive-fields">
                          <div className="form-group">
                            <label htmlFor={`blend-additive-category-${index}`}>Category</label>
                            <select
                              id={`blend-additive-category-${index}`}
                              data-testid={index === 0 ? 'blend-additive-category' : `blend-additive-category-${index}`}
                              value={isWater ? BLEND_PROOFING_WATER_CATEGORY : selectedCategory}
                              onChange={(e) => handleCategorySelect(index, e.target.value)}
                            >
                              <option value="">— Select category —</option>
                              <option value={BLEND_PROOFING_WATER_CATEGORY}>Proofing water</option>
                              {categoryChoices.map((name) => (
                                <option key={name} value={name}>{inventoryCategoryLabel(name)}</option>
                              ))}
                            </select>
                          </div>
                          {!isWater && (
                            <div className="form-group">
                              <label htmlFor={`blend-additive-item-${index}`}>Item</label>
                              {selectedCategory ? (
                                <IngredientSelect
                                  testId={index === 0 ? 'blend-ingredient-0' : `blend-ingredient-${index}`}
                                  value={ingredient.inventory_item_id != null ? String(ingredient.inventory_item_id) : ''}
                                  emptyLabel="— Select item —"
                                  noun={categoryNoun}
                                  category={selectedCategory}
                                  unit={ingredient.unit}
                                  options={inventoryOptions.map((item) => ({
                                    value: String(item.id),
                                    label: `${item.name} (${formatInventoryOnHand(item.quantity)} ${item.unit})`,
                                  }))}
                                  orphanLabel={
                                    ingredient.inventory_item_id != null
                                    && !inventoryOptions.some((item) => item.id === ingredient.inventory_item_id)
                                      ? ingredient.name
                                      : undefined
                                  }
                                  onSelect={(rawId) => handleInventorySelect(index, rawId)}
                                  onAdded={(item) => updateIngredient(index, {
                                    inventory_item_id: item.id,
                                    inventory_category: item.category,
                                    ingredient_type: blendIngredientTypeForCategory(item.category),
                                    name: item.name,
                                    unit: item.unit,
                                    abv: item.abv ?? null,
                                    density_g_per_ml: item.density_g_per_ml ?? null,
                                    density_assumption: null,
                                  })}
                                />
                              ) : (
                                <select
                                  id={`blend-additive-item-${index}`}
                                  data-testid={index === 0 ? 'blend-ingredient-0' : `blend-ingredient-${index}`}
                                  disabled
                                  value=""
                                >
                                  <option value="">— Choose a category first —</option>
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="measure-mode-toggle">
                          <span className="measure-mode-label">Measure by</span>
                          <div className="measure-mode-buttons">
                            <button
                              type="button"
                              data-testid={`recipe-additive-weight-${index}`}
                              className={`btn btn-sm ${measureMode === 'weight' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setIngredientMeasureMode(index, 'weight')}
                            >
                              Weight
                              {recommendation.mode === 'weight' && <span className="measure-best-tag">Best</span>}
                            </button>
                            <button
                              type="button"
                              data-testid={`recipe-additive-volume-${index}`}
                              className={`btn btn-sm ${measureMode === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setIngredientMeasureMode(index, 'volume')}
                            >
                              Volume
                              {recommendation.mode === 'volume' && <span className="measure-best-tag">Best</span>}
                            </button>
                          </div>
                        </div>
                        {isWater && (
                          <p className="field-hint">Proofing water is not tied to inventory. Weighed water uses 0.120074 wine gallons per pound at 60 °F (27 CFR §30.41), about 8.328 lb/gal.</p>
                        )}
                        <div className="wizard-additive-amount-row blend-recipe-amount-row">
                          <div className="form-group">
                            <label>Amount</label>
                            <input
                              type="number"
                              step="0.01"
                              data-testid={`recipe-additive-amount-${index}`}
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
                              data-testid={`recipe-additive-unit-${index}`}
                              value={ingredient.unit}
                              onChange={(e) => updateIngredient(index, { unit: e.target.value })}
                            >
                              {unitOptions.map((unit) => (
                                <option key={unit} value={unit}>{unit}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {additiveSupportsAbv(ingredient.ingredient_type) && (
                          <div className="form-group">
                            <label>Alcohol in flavoring (ABV %)</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max={MAX_ENTERED_ABV}
                              placeholder="0 if non-alcoholic"
                              value={ingredient.abv ?? ''}
                              onChange={(e) => {
                                const limited = limitAbvInput(e.target.value);
                                updateIngredient(index, {
                                  abv: limited.trim() === '' ? null : parseFloat(limited) || 0,
                                });
                              }}
                            />
                            <p className="field-hint">
                              Counts toward total absolute alcohol with every other alcohol-bearing ingredient.
                            </p>
                          </div>
                        )}
                        {!isWater && ingredient.ingredient_type !== 'sugar' && (
                          <div className="form-group">
                            <label>Density (g/mL)</label>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              placeholder="Leave blank if unknown"
                              value={ingredient.density_g_per_ml ?? ''}
                              onChange={(e) => updateIngredient(index, {
                                density_g_per_ml: e.target.value.trim() === '' ? null : parseFloat(e.target.value) || null,
                                density_assumption: null,
                              })}
                            />
                            {resolveIngredientDensity(ingredient).notice && (
                              <p className="field-hint">{resolveIngredientDensity(ingredient).notice}</p>
                            )}
                            {ingredient.density_g_per_ml == null && (
                              <label className="checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={ingredient.density_assumption != null}
                                  onChange={(e) => updateIngredient(index, {
                                    density_assumption: e.target.checked
                                      ? (ingredient.ingredient_type === 'syrup'
                                        ? 'cs1-syrup'
                                        : ingredient.ingredient_type === 'color'
                                          ? 'class-i-caramel'
                                          : 'water')
                                      : null,
                                  })}
                                />
                                Use a documented density assumption
                              </label>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="blend-recipe-section blend-recipe-section--proof">
              <h4 className="blend-recipe-section-title">Calculated proof</h4>
              {proofingPreview && (
                <ProofingWaterConfirm
                  preview={proofingPreview}
                  onConfirm={confirmProofingWater}
                  onCancel={() => setProofingPreview(null)}
                />
              )}
              {originalWater.length > 0 && (
                <button type="button" className="btn btn-sm btn-secondary" onClick={restoreOriginalWater}>
                  Restore original recipe water
                </button>
              )}
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
                onAdjustProofingWater={requestProofingWater}
              />
            </section>

            <div className="form-actions blend-recipe-form-actions">
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
          </div>
        </Modal>
      )}

    </>
  );
}
