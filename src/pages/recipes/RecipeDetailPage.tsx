import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dilutionCalculation, litresPureAlcohol } from '../../../shared/master-data/conversions';
import { IMPLEMENTED_QUANTITY_BASIS, INGREDIENT_TYPES } from '../../../shared/recipes/constants';
import { scaleRecipeIngredients } from '../../../shared/recipes/scaling';
import { Modal } from '../../components/Modal';
import { ActiveBadge } from '../../components/master-data/ActiveBadge';
import { recipesRepository } from '../../db/repositories/recipes-repository';
import { masterDataRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';
import type {
  RcRecipeIngredientSaveInput,
  RcRecipePackagingSaveInput,
  RcRecipeVersionSaveInput,
} from '../../types/recipes';

type Tab = 'version' | 'ingredients' | 'packaging' | 'calculators';

const emptyIngredient = (): RcRecipeIngredientSaveInput => ({
  ingredient_type: 'Raw Material',
  raw_material_id: null,
  bulk_spirit_id: null,
  description: '',
  quantity: 1,
  unit: 'kg',
  quantity_basis: 'Per Batch',
  sequence: 0,
  optional: 0,
  notes: '',
});

const emptyPackaging = (): RcRecipePackagingSaveInput => ({
  sku_id: null,
  packaging_material_id: null,
  quantity: 1,
  quantity_basis: 'Per Batch',
  waste_allowance_percent: null,
  notes: '',
});

export function RecipeDetailPage() {
  const { id } = useParams();
  const recipeId = Number(id);
  const { key, refresh } = useRefreshKey();
  const [tab, setTab] = useState<Tab>('version');
  const [versionId, setVersionId] = useState<number>();
  const [error, setError] = useState('');
  const [showIngredientForm, setShowIngredientForm] = useState(false);
  const [showPackagingForm, setShowPackagingForm] = useState(false);
  const [editIngredientId, setEditIngredientId] = useState<number>();
  const [editPackagingId, setEditPackagingId] = useState<number>();
  const [ingredientForm, setIngredientForm] = useState(emptyIngredient());
  const [packagingForm, setPackagingForm] = useState(emptyPackaging());
  const [scaleTarget, setScaleTarget] = useState('');
  const [dilutionVolume, setDilutionVolume] = useState('1000');
  const [dilutionStartAbv, setDilutionStartAbv] = useState('96');
  const [dilutionTargetAbv, setDilutionTargetAbv] = useState('40');

  void key;
  const recipe = recipesRepository.recipes.get(recipeId);
  const versions = useMemo(() => recipesRepository.versions.list(recipeId), [key, recipeId]);
  const selectedVersionId = versionId ?? recipe?.active_version_id ?? versions[0]?.id;
  const version = selectedVersionId ? recipesRepository.versions.get(selectedVersionId) : null;
  const ingredients = selectedVersionId ? recipesRepository.ingredients.list(selectedVersionId) : [];
  const packaging = selectedVersionId ? recipesRepository.packaging.list(selectedVersionId) : [];
  const isDraft = version?.status === 'Draft';

  const rawMaterials = masterDataRepository.rawMaterials.list(true);
  const bulkSpirits = masterDataRepository.bulkSpirits.list(true);
  const skus = masterDataRepository.skus.list();
  const packagingMaterials = masterDataRepository.packagingMaterials.list(true);
  const weightUnits = masterDataRepository.units.codes('weight');
  const liquidUnits = masterDataRepository.units.codes('liquid');
  const countUnits = masterDataRepository.units.codes('count');
  const allUnits = [...new Set([...liquidUnits, ...weightUnits, ...countUnits, 'L', 'kg', 'each'])];

  if (!recipe) {
    return (
      <div>
        <p className="alert alert-danger">Recipe not found.</p>
        <Link to="/recipes">← Back to recipes</Link>
      </div>
    );
  }

  const [versionForm, setVersionForm] = useState<RcRecipeVersionSaveInput>({
    version_label: '',
    status: 'Draft',
    effective_date: null,
    target_batch_size: 1000,
    batch_size_unit: 'L',
    target_abv: null,
    expected_yield_percent: null,
    expected_final_volume_litres: null,
    instructions: '',
    notes: '',
  });

  useEffect(() => {
    if (!version) return;
    setVersionForm({
      version_label: version.version_label,
      status: version.status,
      effective_date: version.effective_date,
      target_batch_size: version.target_batch_size,
      batch_size_unit: version.batch_size_unit,
      target_abv: version.target_abv,
      expected_yield_percent: version.expected_yield_percent,
      expected_final_volume_litres: version.expected_final_volume_litres,
      instructions: version.instructions,
      notes: version.notes,
    });
  }, [version?.id, version?.updated_at]);

  const handleVersionField = (patch: Partial<RcRecipeVersionSaveInput>) => {
    setVersionForm((prev) => ({ ...prev, ...patch }));
  };

  const saveVersion = () => {
    if (!selectedVersionId) return;
    try {
      recipesRepository.versions.save(selectedVersionId, versionForm);
      setError('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const activateVersion = () => {
    if (!selectedVersionId) return;
    try {
      recipesRepository.versions.activate(recipeId, selectedVersionId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    }
  };

  const archiveVersion = () => {
    if (!selectedVersionId) return;
    try {
      recipesRepository.versions.archive(recipeId, selectedVersionId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed');
    }
  };

  const cloneVersion = () => {
    if (!selectedVersionId) return;
    try {
      const newId = recipesRepository.versions.clone(selectedVersionId);
      setVersionId(newId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
    }
  };

  const openIngredient = (row?: typeof ingredients[0]) => {
    setEditIngredientId(row?.id);
    setIngredientForm(row ? {
      ingredient_type: row.ingredient_type,
      raw_material_id: row.raw_material_id,
      bulk_spirit_id: row.bulk_spirit_id,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      quantity_basis: row.quantity_basis,
      sequence: row.sequence,
      optional: row.optional,
      notes: row.notes,
    } : emptyIngredient());
    setShowIngredientForm(true);
  };

  const saveIngredient = () => {
    if (!selectedVersionId) return;
    try {
      recipesRepository.ingredients.save(selectedVersionId, ingredientForm, editIngredientId);
      setShowIngredientForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const openPackaging = (row?: typeof packaging[0]) => {
    setEditPackagingId(row?.id);
    setPackagingForm(row ? {
      sku_id: row.sku_id,
      packaging_material_id: row.packaging_material_id,
      quantity: row.quantity,
      quantity_basis: row.quantity_basis,
      waste_allowance_percent: row.waste_allowance_percent,
      notes: row.notes,
    } : emptyPackaging());
    setShowPackagingForm(true);
  };

  const savePackaging = () => {
    if (!selectedVersionId) return;
    try {
      recipesRepository.packaging.save(selectedVersionId, packagingForm, editPackagingId);
      setShowPackagingForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const scaled = scaleTarget && version
    ? scaleRecipeIngredients(ingredients, version.target_batch_size, Number(scaleTarget))
    : [];

  let dilutionResult: ReturnType<typeof dilutionCalculation> | null = null;
  try {
    const vol = Number(dilutionVolume);
    const start = Number(dilutionStartAbv);
    const target = Number(dilutionTargetAbv);
    if (vol > 0 && start > 0 && target > 0) {
      dilutionResult = dilutionCalculation(vol, start, target);
    }
  } catch {
    dilutionResult = null;
  }

  const insertWater = () => {
    if (!selectedVersionId || !dilutionResult) return;
    try {
      recipesRepository.ingredients.insertDilutionWater(selectedVersionId, dilutionResult.waterToAddLitres);
      refresh();
      setTab('ingredients');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Insert failed');
    }
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <Link to="/recipes" className="btn btn-secondary btn-sm">← Recipes</Link>
        <span style={{ marginLeft: '0.5rem', fontWeight: 600 }}>{recipe.recipe_code} — {recipe.name}</span>
        <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>({recipe.product_name})</span>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <label>Version:</label>
        <select
          className="form-control"
          style={{ maxWidth: 220 }}
          value={selectedVersionId ?? ''}
          onChange={(e) => setVersionId(Number(e.target.value))}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>v{v.version_number}{v.version_label ? ` — ${v.version_label}` : ''} ({v.status})</option>
          ))}
        </select>
        {version && <ActiveBadge active={version.status === 'Active'} label={version.status} />}
        <button className="btn btn-secondary btn-sm" onClick={cloneVersion}>+ New Version (clone)</button>
        {version?.status === 'Draft' && (
          <button className="btn btn-primary btn-sm" onClick={activateVersion}>Activate Version</button>
        )}
        {version?.status === 'Active' && (
          <button className="btn btn-ghost btn-sm" onClick={archiveVersion}>Archive Version</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {(['version', 'ingredients', 'packaging', 'calculators'] as Tab[]).map((t) => (
          <button key={t} className={`btn btn-sm${tab === t ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'version' && version && (
        <div className="form-grid">
          {!isDraft && (
            <p className="alert alert-info full-width">This version is {version.status} and read-only. Clone to a new Draft version to edit.</p>
          )}
          <div className="form-group"><label>Version Label</label>
            <input className="form-control" value={versionForm.version_label} disabled={!isDraft}
              onChange={(e) => handleVersionField({ version_label: e.target.value })} /></div>
          <div className="form-group"><label>Target Batch Size *</label>
            <input type="number" className="form-control" value={versionForm.target_batch_size} disabled={!isDraft}
              onChange={(e) => handleVersionField({ target_batch_size: Number(e.target.value) })} /></div>
          <div className="form-group"><label>Batch Size Unit</label>
            <input className="form-control" value={versionForm.batch_size_unit} disabled={!isDraft}
              onChange={(e) => handleVersionField({ batch_size_unit: e.target.value })} /></div>
          <div className="form-group"><label>Target ABV (%)</label>
            <input type="number" className="form-control" value={versionForm.target_abv ?? ''} disabled={!isDraft}
              onChange={(e) => handleVersionField({ target_abv: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="form-group"><label>Expected Yield (%)</label>
            <input type="number" className="form-control" value={versionForm.expected_yield_percent ?? ''} disabled={!isDraft}
              onChange={(e) => handleVersionField({ expected_yield_percent: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="form-group"><label>Expected Final Volume (L)</label>
            <input type="number" className="form-control" value={versionForm.expected_final_volume_litres ?? ''} disabled={!isDraft}
              onChange={(e) => handleVersionField({ expected_final_volume_litres: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="form-group full-width"><label>Instructions</label>
            <textarea className="form-control" rows={4} value={versionForm.instructions} disabled={!isDraft}
              onChange={(e) => handleVersionField({ instructions: e.target.value })} /></div>
          <div className="form-group full-width"><label>Notes</label>
            <textarea className="form-control" rows={2} value={versionForm.notes} disabled={!isDraft}
              onChange={(e) => handleVersionField({ notes: e.target.value })} /></div>
          {isDraft && (
            <div className="form-actions full-width">
              <button className="btn btn-primary" onClick={saveVersion}>Save Version</button>
            </div>
          )}
        </div>
      )}

      {tab === 'ingredients' && (
        <div>
          <div className="page-actions" style={{ marginBottom: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => openIngredient()} disabled={!isDraft}>+ Add Ingredient</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Type</th><th>Material</th><th>Qty</th><th>Unit</th><th>Basis</th><th>LPA</th><th></th></tr>
              </thead>
              <tbody>
                {ingredients.map((row) => {
                  const lpa = row.ingredient_type === 'Bulk Spirit' && row.bulk_spirit_abv != null && row.unit === 'L'
                    ? litresPureAlcohol(row.quantity, row.bulk_spirit_abv)
                    : null;
                  return (
                    <tr key={row.id}>
                      <td>{row.sequence || '—'}</td>
                      <td>{row.ingredient_type}</td>
                      <td>{row.material_name ?? row.description ?? '—'}</td>
                      <td>{row.quantity}</td>
                      <td>{row.unit}</td>
                      <td>{row.quantity_basis}</td>
                      <td>{lpa != null ? `${lpa.toFixed(1)} LPA` : '—'}</td>
                      <td>
                        {isDraft && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => openIngredient(row)}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => {
                              if (selectedVersionId) {
                                recipesRepository.ingredients.delete(selectedVersionId, row.id);
                                refresh();
                              }
                            }}>Remove</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {ingredients.length === 0 && <p className="empty-state">No ingredients defined for this version.</p>}
          </div>
        </div>
      )}

      {tab === 'packaging' && (
        <div>
          <div className="page-actions" style={{ marginBottom: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => openPackaging()} disabled={!isDraft}>+ Add Packaging Line</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>SKU</th><th>Packaging Material</th><th>Qty</th><th>Basis</th><th>Waste %</th><th></th></tr>
              </thead>
              <tbody>
                {packaging.map((row) => (
                  <tr key={row.id}>
                    <td>{row.sku_name ?? '—'}</td>
                    <td>{row.packaging_name ?? '—'}</td>
                    <td>{row.quantity}</td>
                    <td>{row.quantity_basis}</td>
                    <td>{row.waste_allowance_percent ?? '—'}</td>
                    <td>
                      {isDraft && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => openPackaging(row)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => {
                            if (selectedVersionId) {
                              recipesRepository.packaging.delete(selectedVersionId, row.id);
                              refresh();
                            }
                          }}>Remove</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {packaging.length === 0 && <p className="empty-state">No packaging requirements defined.</p>}
          </div>
        </div>
      )}

      {tab === 'calculators' && version && (
        <div className="form-grid">
          <div className="form-group full-width">
            <h3>Formula Scaling (theoretical)</h3>
            <p className="form-hint">Scales Per Batch / Fixed Quantity lines proportionally. Does not modify the stored recipe.</p>
            <label>Scale to batch size ({version.batch_size_unit})</label>
            <input className="form-control" type="number" value={scaleTarget}
              onChange={(e) => setScaleTarget(e.target.value)} placeholder={`Base: ${version.target_batch_size}`} />
            {scaled.length > 0 && (
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table>
                  <thead><tr><th>Ingredient</th><th>Base Qty</th><th>Scaled Qty</th><th>Unit</th></tr></thead>
                  <tbody>
                    {scaled.map((line) => (
                      <tr key={line.id}>
                        <td>{line.description}</td>
                        <td>{line.baseQuantity.toFixed(4)}</td>
                        <td>{line.scaledQuantity.toFixed(4)}</td>
                        <td>{line.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="form-group full-width">
            <h3>Proof-Down / Dilution (theoretical)</h3>
            <p className="form-hint">Theoretical calculator only — no inventory or tank changes.</p>
            <div className="form-grid">
              <div className="form-group"><label>Initial Volume (L)</label>
                <input className="form-control" value={dilutionVolume} onChange={(e) => setDilutionVolume(e.target.value)} /></div>
              <div className="form-group"><label>Initial ABV (%)</label>
                <input className="form-control" value={dilutionStartAbv} onChange={(e) => setDilutionStartAbv(e.target.value)} /></div>
              <div className="form-group"><label>Target ABV (%)</label>
                <input className="form-control" value={dilutionTargetAbv} onChange={(e) => setDilutionTargetAbv(e.target.value)} /></div>
            </div>
            {dilutionResult && (
              <div className="form-hint" style={{ marginTop: '0.5rem' }}>
                Final volume: {dilutionResult.finalVolumeLitres.toFixed(2)} L ·
                Water to add: {dilutionResult.waterToAddLitres.toFixed(2)} L ·
                LPA: {dilutionResult.lpa.toFixed(2)} L
              </div>
            )}
            {isDraft && dilutionResult && (
              <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={insertWater}>
                Insert water as Draft ingredient
              </button>
            )}
          </div>
        </div>
      )}

      {showIngredientForm && (
        <Modal title={editIngredientId ? 'Edit Ingredient' : 'Add Ingredient'} onClose={() => setShowIngredientForm(false)}>
          <div className="form-grid">
            <div className="form-group"><label>Type *</label>
              <select className="form-control" value={ingredientForm.ingredient_type}
                onChange={(e) => setIngredientForm({ ...ingredientForm, ingredient_type: e.target.value })}>
                {INGREDIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            {ingredientForm.ingredient_type === 'Raw Material' && (
              <div className="form-group"><label>Raw Material *</label>
                <select className="form-control" value={ingredientForm.raw_material_id ?? ''}
                  onChange={(e) => setIngredientForm({ ...ingredientForm, raw_material_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">—</option>
                  {rawMaterials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></div>
            )}
            {ingredientForm.ingredient_type === 'Bulk Spirit' && (
              <div className="form-group"><label>Bulk Spirit *</label>
                <select className="form-control" value={ingredientForm.bulk_spirit_id ?? ''}
                  onChange={(e) => setIngredientForm({ ...ingredientForm, bulk_spirit_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">—</option>
                  {bulkSpirits.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.nominal_abv}% ABV)</option>)}
                </select></div>
            )}
            {(ingredientForm.ingredient_type === 'Water' || ingredientForm.ingredient_type === 'Other') && (
              <div className="form-group"><label>Description</label>
                <input className="form-control" value={ingredientForm.description}
                  onChange={(e) => setIngredientForm({ ...ingredientForm, description: e.target.value })} /></div>
            )}
            <div className="form-group"><label>Quantity *</label>
              <input type="number" className="form-control" value={ingredientForm.quantity}
                onChange={(e) => setIngredientForm({ ...ingredientForm, quantity: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Unit</label>
              <select className="form-control" value={ingredientForm.unit}
                onChange={(e) => setIngredientForm({ ...ingredientForm, unit: e.target.value })}>
                {allUnits.map((u) => <option key={u} value={u}>{u}</option>)}
              </select></div>
            <div className="form-group"><label>Quantity Basis</label>
              <select className="form-control" value={ingredientForm.quantity_basis}
                onChange={(e) => setIngredientForm({ ...ingredientForm, quantity_basis: e.target.value })}>
                {IMPLEMENTED_QUANTITY_BASIS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></div>
            <div className="form-group"><label>Sequence</label>
              <input type="number" className="form-control" value={ingredientForm.sequence}
                onChange={(e) => setIngredientForm({ ...ingredientForm, sequence: Number(e.target.value) })} /></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={saveIngredient}>Save</button></div>
        </Modal>
      )}

      {showPackagingForm && (
        <Modal title={editPackagingId ? 'Edit Packaging' : 'Add Packaging'} onClose={() => setShowPackagingForm(false)}>
          <div className="form-grid">
            <div className="form-group"><label>SKU (optional)</label>
              <select className="form-control" value={packagingForm.sku_id ?? ''}
                onChange={(e) => setPackagingForm({ ...packagingForm, sku_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {skus.filter((s) => s.product_id === recipe.product_id).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.sku_code})</option>
                ))}
              </select></div>
            <div className="form-group"><label>Packaging Material</label>
              <select className="form-control" value={packagingForm.packaging_material_id ?? ''}
                onChange={(e) => setPackagingForm({ ...packagingForm, packaging_material_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {packagingMaterials.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div className="form-group"><label>Quantity *</label>
              <input type="number" className="form-control" value={packagingForm.quantity}
                onChange={(e) => setPackagingForm({ ...packagingForm, quantity: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Quantity Basis</label>
              <select className="form-control" value={packagingForm.quantity_basis}
                onChange={(e) => setPackagingForm({ ...packagingForm, quantity_basis: e.target.value })}>
                {IMPLEMENTED_QUANTITY_BASIS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></div>
            <div className="form-group"><label>Waste Allowance (%)</label>
              <input type="number" className="form-control" value={packagingForm.waste_allowance_percent ?? ''}
                onChange={(e) => setPackagingForm({ ...packagingForm, waste_allowance_percent: e.target.value ? Number(e.target.value) : null })} /></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={savePackaging}>Save</button></div>
        </Modal>
      )}
    </div>
  );
}
