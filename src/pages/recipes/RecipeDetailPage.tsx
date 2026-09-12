import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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
  RcRecipePackaging,
  RcRecipePackagingSaveInput,
  RcRecipeSaveInput,
  RcRecipeStepSaveInput,
  RcRecipeVersionSaveInput,
} from '../../types/recipes';

type Tab = 'overview' | 'formula' | 'packaging' | 'instructions' | 'versions' | 'calculators';

const emptyIngredient = (): RcRecipeIngredientSaveInput => ({
  ingredient_type: 'Raw Material', raw_material_id: null, bulk_spirit_id: null, source_lot_id: null,
  description: '', quantity: 1, unit: 'kg', quantity_basis: 'Per Batch', sequence: 0, optional: 0, notes: '',
});

const emptyPackaging = (): RcRecipePackagingSaveInput => ({
  sku_id: null, packaging_material_id: null, quantity: 1, quantity_basis: 'Per Batch', waste_allowance_percent: null, notes: '',
});

const emptyStep = (): RcRecipeStepSaveInput => ({ step_number: 1, instruction: '', notes: '' });

export function RecipeDetailPage() {
  const { id } = useParams();
  const recipeId = Number(id);
  const { user } = useAuth();
  const { key, refresh } = useRefreshKey();
  const [tab, setTab] = useState<Tab>('overview');
  const [versionId, setVersionId] = useState<number>();
  const [error, setError] = useState('');
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [showIngredientForm, setShowIngredientForm] = useState(false);
  const [showPackagingForm, setShowPackagingForm] = useState(false);
  const [showStepForm, setShowStepForm] = useState(false);
  const [editIngredientId, setEditIngredientId] = useState<number>();
  const [editPackagingId, setEditPackagingId] = useState<number>();
  const [editStepId, setEditStepId] = useState<number>();
  const [recipeForm, setRecipeForm] = useState<RcRecipeSaveInput | null>(null);
  const [ingredientForm, setIngredientForm] = useState(emptyIngredient());
  const [packagingForm, setPackagingForm] = useState(emptyPackaging());
  const [stepForm, setStepForm] = useState(emptyStep());
  const [scaleTarget, setScaleTarget] = useState('');
  const [dilutionVolume, setDilutionVolume] = useState('1000');
  const [dilutionStartAbv, setDilutionStartAbv] = useState('96');
  const [dilutionTargetAbv, setDilutionTargetAbv] = useState('40');

  void key;
  const recipe = recipesRepository.getRecipe(recipeId);
  const recipeTypes = recipesRepository.lookups.recipeTypes();
  const products = masterDataRepository.products.listActive();
  const versions = useMemo(() => recipesRepository.listVersions(recipeId), [key, recipeId]);
  const selectedVersionId = versionId ?? recipe?.active_version_id ?? versions[0]?.id;
  const version = selectedVersionId ? recipesRepository.getVersion(selectedVersionId) : null;
  const ingredients = selectedVersionId ? recipesRepository.listIngredients(selectedVersionId) : [];
  const packaging = selectedVersionId ? recipesRepository.listPackaging(selectedVersionId) : [];
  const steps = selectedVersionId ? recipesRepository.listSteps(selectedVersionId) : [];
  const isDraft = version?.status === 'Draft';
  const isReadOnly = version?.status === 'Active' || version?.status === 'Archived';

  const rawMaterials = masterDataRepository.rawMaterials.list(true);
  const bulkSpirits = masterDataRepository.bulkSpirits.list(true);
  const productSkus = masterDataRepository.skus.list().filter((s) => s.product_id === recipe?.product_id);
  const packagingMaterials = masterDataRepository.packagingMaterials.list(true);
  const weightUnits = masterDataRepository.units.codes('weight');
  const liquidUnits = masterDataRepository.units.codes('liquid');
  const countUnits = masterDataRepository.units.codes('count');
  const allUnits = [...new Set([...liquidUnits, ...weightUnits, ...countUnits, 'L', 'kg', 'each'])];

  const [versionForm, setVersionForm] = useState<RcRecipeVersionSaveInput>({
    version_label: '', status: 'Draft', effective_date: null, target_batch_size: 1000, batch_size_unit: 'L',
    target_abv: null, expected_yield_percent: null, expected_final_volume_litres: null,
    target_brix: null, target_ph: null, target_carbonation_volumes: null, instructions: '', notes: '',
  });

  useEffect(() => {
    if (!version) return;
    setVersionForm({
      version_label: version.version_label, status: version.status, effective_date: version.effective_date,
      target_batch_size: version.target_batch_size, batch_size_unit: version.batch_size_unit,
      target_abv: version.target_abv, expected_yield_percent: version.expected_yield_percent,
      expected_final_volume_litres: version.expected_final_volume_litres,
      target_brix: version.target_brix, target_ph: version.target_ph,
      target_carbonation_volumes: version.target_carbonation_volumes,
      instructions: version.instructions, notes: version.notes,
    });
  }, [version?.id, version?.updated_at]);

  const packagingBySku = useMemo(() => {
    const groups = new Map<string, RcRecipePackaging[]>();
    for (const line of packaging) {
      const keyLabel = line.sku_id != null ? (line.sku_name ?? `SKU #${line.sku_id}`) : 'General / All SKUs';
      const list = groups.get(keyLabel) ?? [];
      list.push(line);
      groups.set(keyLabel, list);
    }
    return groups;
  }, [packaging]);

  if (!recipe) {
    return (
      <div>
        <p className="alert alert-danger">Recipe not found.</p>
        <Link to="/recipes">← Back to recipes</Link>
      </div>
    );
  }

  const openRecipeEdit = () => {
    setRecipeForm({
      product_id: recipe.product_id, name: recipe.name, description: recipe.description,
      recipe_type: recipe.recipe_type, status: recipe.status,
    });
    setShowRecipeForm(true);
  };

  const saveRecipeMeta = () => {
    if (!recipeForm) return;
    try {
      recipesRepository.saveRecipe(recipeForm, recipeId);
      setShowRecipeForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const saveVersion = () => {
    if (!selectedVersionId) return;
    try {
      recipesRepository.saveVersion(selectedVersionId, versionForm);
      setError('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const activateVersion = () => {
    if (!selectedVersionId) return;
    try {
      recipesRepository.activateVersion(recipeId, selectedVersionId, user?.email ?? null);
      setError('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    }
  };

  const archiveVersion = () => {
    if (!selectedVersionId) return;
    try {
      recipesRepository.archiveVersion(recipeId, selectedVersionId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed');
    }
  };

  const cloneVersion = () => {
    if (!selectedVersionId) return;
    try {
      const newId = recipesRepository.cloneVersion(selectedVersionId);
      setVersionId(newId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
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
    if (vol > 0 && start > 0 && target > 0) dilutionResult = dilutionCalculation(vol, start, target);
  } catch { dilutionResult = null; }

  const tabButtons: Tab[] = ['overview', 'formula', 'packaging', 'instructions', 'versions', 'calculators'];

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <Link to="/recipes" className="btn btn-secondary btn-sm">← Recipes</Link>
        <span style={{ marginLeft: '0.5rem', fontWeight: 600 }}>{recipe.recipe_code} — {recipe.name}</span>
        <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>Product: {recipe.product_name}</span>
        <button className="btn btn-ghost btn-sm" onClick={openRecipeEdit}>Edit Recipe</button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <label>Working version:</label>
        <select className="form-control" style={{ maxWidth: 240 }} value={selectedVersionId ?? ''} onChange={(e) => setVersionId(Number(e.target.value))}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>v{v.version_number}{v.version_label ? ` — ${v.version_label}` : ''} ({v.status})</option>
          ))}
        </select>
        {version && <ActiveBadge active={version.status === 'Active'} label={version.status} />}
        <button className="btn btn-secondary btn-sm" onClick={cloneVersion}>Clone → New Draft</button>
        {isDraft && <button className="btn btn-primary btn-sm" onClick={activateVersion}>Activate Version</button>}
        {version?.status === 'Active' && <button className="btn btn-ghost btn-sm" onClick={archiveVersion}>Archive Version</button>}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {tabButtons.map((t) => (
          <button key={t} className={`btn btn-sm${tab === t ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && version && (
        <div className="form-grid">
          {isReadOnly && (
            <p className="alert alert-info full-width">Version v{version.version_number} is {version.status} and read-only. Clone to a new Draft to edit.</p>
          )}
          <div className="form-group"><label>Version Label</label>
            <input className="form-control" value={versionForm.version_label} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, version_label: e.target.value })} /></div>
          <div className="form-group"><label>Effective Date</label>
            <input type="date" className="form-control" value={versionForm.effective_date ?? ''} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, effective_date: e.target.value || null })} /></div>
          <div className="form-group"><label>Target Batch Size *</label>
            <input type="number" className="form-control" value={versionForm.target_batch_size} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, target_batch_size: Number(e.target.value) })} /></div>
          <div className="form-group"><label>Batch Unit *</label>
            <input className="form-control" value={versionForm.batch_size_unit} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, batch_size_unit: e.target.value })} /></div>
          <div className="form-group"><label>Target ABV (%)</label>
            <input type="number" className="form-control" value={versionForm.target_abv ?? ''} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, target_abv: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="form-group"><label>Expected Yield (%)</label>
            <input type="number" className="form-control" value={versionForm.expected_yield_percent ?? ''} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, expected_yield_percent: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="form-group"><label>Expected Final Volume (L)</label>
            <input type="number" className="form-control" value={versionForm.expected_final_volume_litres ?? ''} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, expected_final_volume_litres: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="form-group"><label>Target Brix (RTD)</label>
            <input type="number" className="form-control" value={versionForm.target_brix ?? ''} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, target_brix: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="form-group"><label>Target pH (RTD)</label>
            <input type="number" className="form-control" value={versionForm.target_ph ?? ''} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, target_ph: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="form-group"><label>Target Carbonation (vol)</label>
            <input type="number" className="form-control" value={versionForm.target_carbonation_volumes ?? ''} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, target_carbonation_volumes: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="form-group full-width"><label>General Notes</label>
            <textarea className="form-control" rows={2} value={versionForm.notes} disabled={!isDraft} onChange={(e) => setVersionForm({ ...versionForm, notes: e.target.value })} /></div>
          {version.approved_by && (
            <div className="form-group full-width form-hint">Approved by {version.approved_by} at {version.approved_at}</div>
          )}
          {isDraft && (
            <div className="form-actions full-width"><button className="btn btn-primary" onClick={saveVersion}>Save Version</button></div>
          )}
        </div>
      )}

      {tab === 'formula' && (
        <div>
          <p className="form-hint">Liquid/ingredient formula for the product (shared across SKUs unless a separate recipe is genuinely required).</p>
          <div className="page-actions" style={{ marginBottom: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" disabled={!isDraft} onClick={() => { setEditIngredientId(undefined); setIngredientForm(emptyIngredient()); setShowIngredientForm(true); }}>+ Add Ingredient</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Seq</th><th>Ingredient</th><th>Type</th><th>Qty</th><th>Unit</th><th>Basis</th><th>ABV</th><th>LPA</th><th></th></tr></thead>
              <tbody>
                {ingredients.map((row) => {
                  const lpa = row.ingredient_type === 'Bulk Spirit' && row.bulk_spirit_abv != null && row.unit === 'L'
                    ? litresPureAlcohol(row.quantity, row.bulk_spirit_abv) : null;
                  return (
                    <tr key={row.id}>
                      <td>{row.sequence || '—'}</td>
                      <td>{row.material_name ?? row.description ?? '—'}</td>
                      <td>{row.ingredient_type}</td>
                      <td>{row.quantity}</td>
                      <td>{row.unit}</td>
                      <td>{row.quantity_basis}</td>
                      <td>{row.bulk_spirit_abv != null ? `${row.bulk_spirit_abv}%` : '—'}</td>
                      <td>{lpa != null ? lpa.toFixed(1) : '—'}</td>
                      <td>{isDraft && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditIngredientId(row.id); setIngredientForm({ ingredient_type: row.ingredient_type, raw_material_id: row.raw_material_id, bulk_spirit_id: row.bulk_spirit_id, source_lot_id: row.source_lot_id, description: row.description, quantity: row.quantity, unit: row.unit, quantity_basis: row.quantity_basis, sequence: row.sequence, optional: row.optional, notes: row.notes }); setShowIngredientForm(true); }}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { if (selectedVersionId) { recipesRepository.removeDraftIngredient(selectedVersionId, row.id); refresh(); } }}>Remove</button>
                        </>
                      )}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {ingredients.length === 0 && <p className="empty-state">No formula ingredients defined.</p>}
          </div>
        </div>
      )}

      {tab === 'packaging' && (
        <div>
          <p className="form-hint">Packaging BOM is per recipe version and may differ by SKU (e.g. 750 mL vs 1 L bottle sizes).</p>
          <div className="page-actions" style={{ marginBottom: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" disabled={!isDraft} onClick={() => { setEditPackagingId(undefined); setPackagingForm(emptyPackaging()); setShowPackagingForm(true); }}>+ Add Packaging Line</button>
          </div>
          {[...packagingBySku.entries()].map(([skuLabel, lines]) => (
            <div key={skuLabel} style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>{skuLabel}</h4>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Material</th><th>Qty</th><th>Basis</th><th>Waste %</th><th></th></tr></thead>
                  <tbody>
                    {lines.map((row) => (
                      <tr key={row.id}>
                        <td>{row.packaging_name ?? '—'}</td>
                        <td>{row.quantity}</td>
                        <td>{row.quantity_basis}</td>
                        <td>{row.waste_allowance_percent ?? '—'}</td>
                        <td>{isDraft && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditPackagingId(row.id); setPackagingForm({ sku_id: row.sku_id, packaging_material_id: row.packaging_material_id, quantity: row.quantity, quantity_basis: row.quantity_basis, waste_allowance_percent: row.waste_allowance_percent, notes: row.notes }); setShowPackagingForm(true); }}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { if (selectedVersionId) { recipesRepository.removeDraftPackaging(selectedVersionId, row.id); refresh(); } }}>Remove</button>
                          </>
                        )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {packaging.length === 0 && <p className="empty-state">No packaging BOM defined for this version.</p>}
        </div>
      )}

      {tab === 'instructions' && (
        <div>
          <p className="form-hint">Ordered production specification steps (not workflow execution).</p>
          <div className="page-actions" style={{ marginBottom: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" disabled={!isDraft} onClick={() => { setEditStepId(undefined); setStepForm({ ...emptyStep(), step_number: steps.length + 1 }); setShowStepForm(true); }}>+ Add Step</button>
          </div>
          <ol style={{ paddingLeft: '1.25rem' }}>
            {steps.map((step, idx) => (
              <li key={step.id} style={{ marginBottom: '0.75rem' }}>
                <strong>Step {step.step_number}:</strong> {step.instruction}
                {step.notes && <div className="form-hint">{step.notes}</div>}
                {isDraft && (
                  <div style={{ marginTop: '0.25rem' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditStepId(step.id); setStepForm({ step_number: step.step_number, instruction: step.instruction, notes: step.notes }); setShowStepForm(true); }}>Edit</button>
                    <button className="btn btn-ghost btn-sm" disabled={idx === 0} onClick={() => {
                      if (!selectedVersionId) return;
                      const ids = steps.map((s) => s.id);
                      [ids[idx - 1], ids[idx]] = [ids[idx]!, ids[idx - 1]!];
                      recipesRepository.reorderSteps(selectedVersionId, ids);
                      refresh();
                    }}>↑</button>
                    <button className="btn btn-ghost btn-sm" disabled={idx === steps.length - 1} onClick={() => {
                      if (!selectedVersionId) return;
                      const ids = steps.map((s) => s.id);
                      [ids[idx], ids[idx + 1]] = [ids[idx + 1]!, ids[idx]!];
                      recipesRepository.reorderSteps(selectedVersionId, ids);
                      refresh();
                    }}>↓</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { if (selectedVersionId) { recipesRepository.removeDraftStep(selectedVersionId, step.id); refresh(); } }}>Remove</button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {steps.length === 0 && <p className="empty-state">No instruction steps defined.</p>}
          {version && version.instructions && (
            <div style={{ marginTop: '1rem' }}>
              <h4>Additional Notes</h4>
              <p>{version.instructions}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'versions' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Version</th><th>Status</th><th>Effective</th><th>Batch Size</th><th>Target ABV</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>v{v.version_number}{v.version_label ? ` — ${v.version_label}` : ''}</td>
                  <td><ActiveBadge active={v.status === 'Active'} label={v.status} /></td>
                  <td>{v.effective_date ?? '—'}</td>
                  <td>{v.target_batch_size} {v.batch_size_unit}</td>
                  <td>{v.target_abv != null ? `${v.target_abv}%` : '—'}</td>
                  <td>{new Date(v.created_at).toLocaleDateString()}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => { setVersionId(v.id); setTab('overview'); }}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'calculators' && version && (
        <div className="form-grid">
          <div className="form-group full-width">
            <h3>Formula Scaling (theoretical)</h3>
            <p className="form-hint">Does not modify the stored base recipe.</p>
            <label>Scale to batch size ({version.batch_size_unit}) — base: {version.target_batch_size}</label>
            <input className="form-control" type="number" value={scaleTarget} onChange={(e) => setScaleTarget(e.target.value)} />
            {scaled.length > 0 && (
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table>
                  <thead><tr><th>Ingredient</th><th>Base</th><th>Scaled</th><th>Unit</th></tr></thead>
                  <tbody>{scaled.map((line) => (
                    <tr key={line.id}><td>{line.description}</td><td>{line.baseQuantity.toFixed(4)}</td><td>{line.scaledQuantity.toFixed(4)}</td><td>{line.unit}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          <div className="form-group full-width">
            <h3>Proof-Down / Dilution (theoretical)</h3>
            <p className="form-hint">No inventory or tank changes.</p>
            <div className="form-grid">
              <div className="form-group"><label>Initial Volume (L)</label><input className="form-control" value={dilutionVolume} onChange={(e) => setDilutionVolume(e.target.value)} /></div>
              <div className="form-group"><label>Initial ABV (%)</label><input className="form-control" value={dilutionStartAbv} onChange={(e) => setDilutionStartAbv(e.target.value)} /></div>
              <div className="form-group"><label>Target ABV (%)</label><input className="form-control" value={dilutionTargetAbv} onChange={(e) => setDilutionTargetAbv(e.target.value)} /></div>
            </div>
            {dilutionResult && (
              <div className="form-hint">Final: {dilutionResult.finalVolumeLitres.toFixed(2)} L · Water: {dilutionResult.waterToAddLitres.toFixed(2)} L · LPA: {dilutionResult.lpa.toFixed(2)} L</div>
            )}
            {isDraft && dilutionResult && (
              <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => {
                if (!selectedVersionId) return;
                try { recipesRepository.insertDilutionWater(selectedVersionId, dilutionResult!.waterToAddLitres); refresh(); setTab('formula'); } catch (err) { setError(err instanceof Error ? err.message : 'Insert failed'); }
              }}>Insert water as Draft ingredient</button>
            )}
          </div>
        </div>
      )}

      {showRecipeForm && recipeForm && (
        <Modal title="Edit Recipe" onClose={() => setShowRecipeForm(false)}>
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input className="form-control" value={recipeForm.name} onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })} /></div>
            <div className="form-group"><label>Product *</label>
              <select className="form-control" value={recipeForm.product_id} onChange={(e) => setRecipeForm({ ...recipeForm, product_id: Number(e.target.value) })}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div className="form-group"><label>Type</label>
              <select className="form-control" value={recipeForm.recipe_type} onChange={(e) => setRecipeForm({ ...recipeForm, recipe_type: e.target.value })}>
                {recipeTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={saveRecipeMeta}>Save</button></div>
        </Modal>
      )}

      {showIngredientForm && selectedVersionId && (
        <Modal title={editIngredientId ? 'Edit Ingredient' : 'Add Ingredient'} onClose={() => setShowIngredientForm(false)}>
          <div className="form-grid">
            <div className="form-group"><label>Type</label>
              <select className="form-control" value={ingredientForm.ingredient_type} onChange={(e) => setIngredientForm({ ...ingredientForm, ingredient_type: e.target.value })}>
                {INGREDIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            {ingredientForm.ingredient_type === 'Raw Material' && (
              <div className="form-group"><label>Raw Material *</label>
                <select className="form-control" value={ingredientForm.raw_material_id ?? ''} onChange={(e) => setIngredientForm({ ...ingredientForm, raw_material_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">—</option>{rawMaterials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></div>
            )}
            {ingredientForm.ingredient_type === 'Bulk Spirit' && (
              <div className="form-group"><label>Bulk Spirit *</label>
                <select className="form-control" value={ingredientForm.bulk_spirit_id ?? ''} onChange={(e) => setIngredientForm({ ...ingredientForm, bulk_spirit_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">—</option>{bulkSpirits.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.nominal_abv}%)</option>)}
                </select></div>
            )}
            {(ingredientForm.ingredient_type === 'Water' || ingredientForm.ingredient_type === 'Other') && (
              <div className="form-group"><label>Description</label>
                <input className="form-control" value={ingredientForm.description} onChange={(e) => setIngredientForm({ ...ingredientForm, description: e.target.value })} /></div>
            )}
            <div className="form-group"><label>Quantity *</label><input type="number" className="form-control" value={ingredientForm.quantity} onChange={(e) => setIngredientForm({ ...ingredientForm, quantity: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Unit *</label>
              <select className="form-control" value={ingredientForm.unit} onChange={(e) => setIngredientForm({ ...ingredientForm, unit: e.target.value })}>
                {allUnits.map((u) => <option key={u} value={u}>{u}</option>)}
              </select></div>
            <div className="form-group"><label>Basis</label>
              <select className="form-control" value={ingredientForm.quantity_basis} onChange={(e) => setIngredientForm({ ...ingredientForm, quantity_basis: e.target.value })}>
                {IMPLEMENTED_QUANTITY_BASIS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></div>
            <div className="form-group"><label>Sequence</label><input type="number" className="form-control" value={ingredientForm.sequence} onChange={(e) => setIngredientForm({ ...ingredientForm, sequence: Number(e.target.value) })} /></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={() => {
            try { recipesRepository.saveIngredient(selectedVersionId, ingredientForm, editIngredientId); setShowIngredientForm(false); refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
          }}>Save</button></div>
        </Modal>
      )}

      {showPackagingForm && selectedVersionId && (
        <Modal title={editPackagingId ? 'Edit Packaging' : 'Add Packaging'} onClose={() => setShowPackagingForm(false)}>
          <div className="form-grid">
            <div className="form-group"><label>SKU (optional — BOM per bottle size)</label>
              <select className="form-control" value={packagingForm.sku_id ?? ''} onChange={(e) => setPackagingForm({ ...packagingForm, sku_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">General / all SKUs</option>
                {productSkus.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.package_size} {s.package_size_unit})</option>)}
              </select></div>
            <div className="form-group"><label>Packaging Material *</label>
              <select className="form-control" value={packagingForm.packaging_material_id ?? ''} onChange={(e) => setPackagingForm({ ...packagingForm, packaging_material_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>{packagingMaterials.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div className="form-group"><label>Quantity *</label><input type="number" className="form-control" value={packagingForm.quantity} onChange={(e) => setPackagingForm({ ...packagingForm, quantity: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Basis</label>
              <select className="form-control" value={packagingForm.quantity_basis} onChange={(e) => setPackagingForm({ ...packagingForm, quantity_basis: e.target.value })}>
                {IMPLEMENTED_QUANTITY_BASIS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={() => {
            try { recipesRepository.savePackagingItem(selectedVersionId, packagingForm, editPackagingId); setShowPackagingForm(false); refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
          }}>Save</button></div>
        </Modal>
      )}

      {showStepForm && selectedVersionId && (
        <Modal title={editStepId ? 'Edit Step' : 'Add Step'} onClose={() => setShowStepForm(false)}>
          <div className="form-grid">
            <div className="form-group"><label>Step Number *</label><input type="number" className="form-control" value={stepForm.step_number} onChange={(e) => setStepForm({ ...stepForm, step_number: Number(e.target.value) })} /></div>
            <div className="form-group full-width"><label>Instruction *</label><textarea className="form-control" rows={3} value={stepForm.instruction} onChange={(e) => setStepForm({ ...stepForm, instruction: e.target.value })} /></div>
            <div className="form-group full-width"><label>Notes</label><textarea className="form-control" rows={2} value={stepForm.notes} onChange={(e) => setStepForm({ ...stepForm, notes: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={() => {
            try { recipesRepository.saveStep(selectedVersionId, stepForm, editStepId); setShowStepForm(false); refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
          }}>Save</button></div>
        </Modal>
      )}
    </div>
  );
}
