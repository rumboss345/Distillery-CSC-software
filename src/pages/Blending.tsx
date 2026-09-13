import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  computeBlendFormulation,
  executeBlendProduct,
  getBlendFormulaVersions,
  getBlendIngredients,
  getBlendProducts,
  getBlendSpiritSources,
  getChargeableHoldingTanksForBlend,
  getHoldingTankContents,
  getHoldingTanks,
  getInventoryItems,
  saveBlendFormula,
  deleteBlendProduct,
  generateBatchNumber,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import {
  BLEND_FORMULATION_PHASES,
  BLEND_INGREDIENT_TYPES,
  BLEND_STATUSES,
  INGREDIENT_UNITS,
  defaultIngredientUnit,
} from '../lib/blending';
import {
  scaleFormulation,
  solveSugarForTargetBrix,
  solveWaterForTargetAbv,
  suggestCorrections,
  totalIngredientCost,
  type AdditiveInput,
  type SpiritSourceInput,
} from '../lib/blend-formulation';
import type {
  BlendFormulationPhase,
  BlendIngredientInput,
  BlendProduct,
  BlendSpiritSourceInput,
  BlendStatus,
} from '../types';

const emptyIngredient = (type: BlendIngredientInput['ingredient_type'] = 'water'): BlendIngredientInput => ({
  ingredient_type: type,
  name: type === 'water' ? 'Proofing water' : '',
  amount: 0,
  unit: defaultIngredientUnit(type),
  cost_per_unit: null,
  lot_number: '',
  inventory_item_id: null,
  notes: '',
});

const emptySpiritSource = (): BlendSpiritSourceInput => ({
  holding_tank_equipment_id: 0,
  volume_gal: 0,
  abv: 0,
});

type FormulaForm = Omit<BlendProduct, 'id' | 'created_at' | 'executed_at'>;

const emptyProduct = (): FormulaForm => ({
  batch_number: generateBatchNumber('BL'),
  product_name: '',
  source_holding_tank_equipment_id: 0,
  base_spirit_volume_gal: 0,
  base_spirit_abv: 0,
  blend_date: new Date().toISOString().slice(0, 10),
  target_abv: null,
  target_brix: null,
  scale_factor: 1,
  formula_version: 1,
  formulation_phase: 'theoretical',
  final_volume_gal: 0,
  final_abv: 0,
  theoretical_volume_gal: null,
  theoretical_abv: null,
  theoretical_density: null,
  theoretical_brix: null,
  actual_volume_gal: null,
  actual_abv: null,
  actual_density: null,
  actual_brix: null,
  status: 'draft',
  notes: '',
});

function toSpiritInputs(sources: BlendSpiritSourceInput[]): SpiritSourceInput[] {
  return sources
    .filter((s) => s.holding_tank_equipment_id > 0 && s.volume_gal > 0)
    .map((s) => ({ volumeGal: s.volume_gal, abv: s.abv }));
}

function toAdditiveInputs(ingredients: BlendIngredientInput[]): AdditiveInput[] {
  return ingredients.map((i) => ({
    ingredientType: i.ingredient_type,
    name: i.name,
    amount: i.amount,
    unit: i.unit,
    costPerUnit: i.cost_per_unit ?? undefined,
    lotNumber: i.lot_number,
    inventoryItemId: i.inventory_item_id ?? undefined,
  }));
}

export function Blending() {
  const { key, refresh } = useRefreshKey();
  const blends = getBlendProducts();
  const inventoryItems = getInventoryItems();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<FormulaForm>(emptyProduct());
  const [spiritSources, setSpiritSources] = useState<BlendSpiritSourceInput[]>([emptySpiritSource()]);
  const [ingredients, setIngredients] = useState<BlendIngredientInput[]>([emptyIngredient('water')]);

  void key;

  const chargeableTanks = getChargeableHoldingTanksForBlend(editId);

  const activeSources = spiritSources.filter((s) => s.holding_tank_equipment_id > 0 && s.volume_gal > 0);
  const formulation = useMemo(
    () => computeBlendFormulation(activeSources, ingredients, {
      volume_gal: form.actual_volume_gal,
      abv: form.actual_abv,
      density: form.actual_density,
      brix: form.actual_brix,
    }),
    [activeSources, ingredients, form.actual_volume_gal, form.actual_abv, form.actual_density, form.actual_brix],
  );

  const corrections = suggestCorrections(
    formulation.theoretical,
    {
      abv: form.actual_abv ?? undefined,
      brix: form.actual_brix ?? undefined,
      density: form.actual_density ?? undefined,
    },
    form.target_abv,
    form.target_brix,
  );

  const ingredientCost = totalIngredientCost(toAdditiveInputs(ingredients));

  const selectedIngredients = selectedId ? getBlendIngredients(selectedId) : [];
  const selectedSources = selectedId ? getBlendSpiritSources(selectedId) : [];
  const selectedVersions = selectedId ? getBlendFormulaVersions(selectedId) : [];

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyProduct());
    setSpiritSources([emptySpiritSource()]);
    setIngredients([emptyIngredient('water')]);
    setShowForm(true);
  };

  const openEdit = (blend: BlendProduct) => {
    if (blend.status === 'executed' || blend.status === 'bottled' || blend.status === 'blended') {
      alert('Executed blends are read-only. View version history for audit trail.');
      setSelectedId(blend.id);
      return;
    }
    setEditId(blend.id);
    setForm({
      batch_number: blend.batch_number,
      product_name: blend.product_name,
      source_holding_tank_equipment_id: blend.source_holding_tank_equipment_id,
      base_spirit_volume_gal: blend.base_spirit_volume_gal,
      base_spirit_abv: blend.base_spirit_abv,
      blend_date: blend.blend_date,
      target_abv: blend.target_abv,
      target_brix: blend.target_brix,
      scale_factor: blend.scale_factor ?? 1,
      formula_version: blend.formula_version ?? 1,
      formulation_phase: blend.formulation_phase ?? 'theoretical',
      final_volume_gal: blend.final_volume_gal,
      final_abv: blend.final_abv,
      theoretical_volume_gal: blend.theoretical_volume_gal,
      theoretical_abv: blend.theoretical_abv,
      theoretical_density: blend.theoretical_density,
      theoretical_brix: blend.theoretical_brix,
      actual_volume_gal: blend.actual_volume_gal,
      actual_abv: blend.actual_abv,
      actual_density: blend.actual_density,
      actual_brix: blend.actual_brix,
      status: blend.status as BlendStatus,
      notes: blend.notes,
    });
    const sources = getBlendSpiritSources(blend.id);
    setSpiritSources(
      sources.length > 0
        ? sources.map((s) => ({
          holding_tank_equipment_id: s.holding_tank_equipment_id,
          volume_gal: s.volume_gal,
          abv: s.abv,
        }))
        : [{
          holding_tank_equipment_id: blend.source_holding_tank_equipment_id,
          volume_gal: blend.base_spirit_volume_gal,
          abv: blend.base_spirit_abv,
        }],
    );
    const ings = getBlendIngredients(blend.id);
    setIngredients(
      ings.length > 0
        ? ings.map((i) => ({
          ingredient_type: i.ingredient_type,
          name: i.name,
          amount: i.amount,
          unit: i.unit,
          cost_per_unit: i.cost_per_unit,
          lot_number: i.lot_number,
          inventory_item_id: i.inventory_item_id,
          notes: i.notes,
        }))
        : [emptyIngredient('water')],
    );
    setShowForm(true);
  };

  const updateSpiritSource = (index: number, patch: Partial<BlendSpiritSourceInput>) => {
    setSpiritSources((prev) => prev.map((src, i) => {
      if (i !== index) return src;
      const next = { ...src, ...patch };
      if (patch.holding_tank_equipment_id) {
        const chargeable = chargeableTanks.find((t) => t.id === patch.holding_tank_equipment_id);
        if (chargeable) {
          next.volume_gal = chargeable.available_gal;
          next.abv = chargeable.available_abv;
        } else {
          const contents = getHoldingTankContents(patch.holding_tank_equipment_id, undefined, editId);
          next.volume_gal = contents.volume_gal;
          next.abv = contents.abv;
        }
      }
      return next;
    }));
  };

  const addSpiritSource = () => setSpiritSources((prev) => [...prev, emptySpiritSource()]);
  const removeSpiritSource = (index: number) => {
    setSpiritSources((prev) => prev.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, patch: Partial<BlendIngredientInput>) => {
    setIngredients((prev) => prev.map((ing, i) => {
      if (i !== index) return ing;
      const next = { ...ing, ...patch };
      if (patch.ingredient_type) {
        next.unit = defaultIngredientUnit(patch.ingredient_type);
        if (patch.ingredient_type === 'water' && !next.name) next.name = 'Proofing water';
      }
      return next;
    }));
  };

  const addIngredient = () => setIngredients((prev) => [...prev, emptyIngredient('flavoring')]);
  const removeIngredient = (index: number) => setIngredients((prev) => prev.filter((_, i) => i !== index));

  const handleSolveWater = () => {
    if (form.target_abv == null) {
      alert('Enter a target ABV first.');
      return;
    }
    const solved = solveWaterForTargetAbv(
      toSpiritInputs(spiritSources),
      toAdditiveInputs(ingredients.filter((i) => i.ingredient_type !== 'water')),
      form.target_abv,
    );
    if (!solved) {
      alert('Could not solve water for target ABV.');
      return;
    }
    const waterIdx = ingredients.findIndex((i) => i.ingredient_type === 'water');
    const waterLine: BlendIngredientInput = {
      ingredient_type: 'water',
      name: 'Proofing water (calculated)',
      amount: solved.waterGal,
      unit: 'gal',
      cost_per_unit: null,
      lot_number: '',
      inventory_item_id: null,
      notes: '',
    };
    if (waterIdx >= 0) {
      setIngredients((prev) => prev.map((ing, i) => (i === waterIdx ? waterLine : ing)));
    } else {
      setIngredients((prev) => [waterLine, ...prev]);
    }
  };

  const handleSolveSugar = () => {
    if (form.target_brix == null) {
      alert('Enter a target Brix first.');
      return;
    }
    const solved = solveSugarForTargetBrix(
      toSpiritInputs(spiritSources),
      toAdditiveInputs(ingredients.filter((i) => i.ingredient_type !== 'sugar')),
      form.target_brix,
    );
    if (!solved) {
      alert('Could not solve sugar for target Brix.');
      return;
    }
    const sugarIdx = ingredients.findIndex((i) => i.ingredient_type === 'sugar');
    const sugarLine: BlendIngredientInput = {
      ingredient_type: 'sugar',
      name: 'Sugar (calculated)',
      amount: solved.sugarLbs,
      unit: 'lbs',
      cost_per_unit: null,
      lot_number: '',
      inventory_item_id: null,
      notes: '',
    };
    if (sugarIdx >= 0) {
      setIngredients((prev) => prev.map((ing, i) => (i === sugarIdx ? sugarLine : ing)));
    } else {
      setIngredients((prev) => [...prev, sugarLine]);
    }
  };

  const handleScale = () => {
    const factor = form.scale_factor;
    if (factor <= 0 || factor === 1) return;
    const scaled = scaleFormulation(toSpiritInputs(spiritSources), toAdditiveInputs(ingredients), factor);
    setSpiritSources(scaled.spirits.map((s, i) => ({
      holding_tank_equipment_id: spiritSources[i]?.holding_tank_equipment_id ?? 0,
      volume_gal: s.volumeGal,
      abv: s.abv,
    })));
    setIngredients(scaled.additives.map((a, i) => ({
      ...ingredients[i],
      ingredient_type: a.ingredientType,
      name: a.name,
      amount: a.amount,
      unit: a.unit,
    })));
    setForm({ ...form, scale_factor: 1 });
  };

  const validateFormula = (): boolean => {
    if (!form.product_name.trim()) {
      alert('Enter a product name.');
      return false;
    }
    if (activeSources.length === 0) {
      alert('Add at least one spirit source.');
      return false;
    }
    for (const source of activeSources) {
      const available = getHoldingTankContents(source.holding_tank_equipment_id, undefined, editId);
      if (source.volume_gal > available.volume_gal + 0.01) {
        alert(`Spirit draw exceeds available volume (${available.volume_gal.toFixed(1)} gal). Formula saves do not reserve tank volume — verify before execution.`);
      }
    }
    return true;
  };

  const handleSaveFormula = () => {
    if (!validateFormula()) return;
    const primary = activeSources[0];
    try {
      saveBlendFormula(
        {
          ...form,
          source_holding_tank_equipment_id: primary.holding_tank_equipment_id,
          base_spirit_volume_gal: primary.volume_gal,
          base_spirit_abv: primary.abv,
          theoretical_volume_gal: formulation.theoretical.volumeGal,
          theoretical_abv: formulation.theoretical.abv,
          theoretical_density: formulation.theoretical.density,
          theoretical_brix: formulation.theoretical.brix,
          final_volume_gal: formulation.reconciliation.effective.volumeGal ?? formulation.theoretical.volumeGal,
          final_abv: formulation.reconciliation.effective.abv ?? formulation.theoretical.abv,
        },
        activeSources,
        ingredients.filter((i) => i.amount > 0 || i.name.trim()),
        editId,
      );
      setShowForm(false);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save formula.');
    }
  };

  const handleExecute = () => {
    if (!editId) {
      alert('Save the formula first, then approve and execute.');
      return;
    }
    if (form.status !== 'approved') {
      alert('Set status to Approved before executing.');
      return;
    }
    if (!confirm('Execute blend? This will consume tank spirit and inventory lots. This cannot be undone.')) {
      return;
    }
    try {
      saveBlendFormula(
        {
          ...form,
          source_holding_tank_equipment_id: activeSources[0].holding_tank_equipment_id,
          base_spirit_volume_gal: activeSources[0].volume_gal,
          base_spirit_abv: activeSources[0].abv,
          status: 'approved',
          theoretical_volume_gal: formulation.theoretical.volumeGal,
          theoretical_abv: formulation.theoretical.abv,
          theoretical_density: formulation.theoretical.density,
          theoretical_brix: formulation.theoretical.brix,
          final_volume_gal: formulation.reconciliation.effective.volumeGal ?? formulation.theoretical.volumeGal,
          final_abv: formulation.reconciliation.effective.abv ?? formulation.theoretical.abv,
        },
        activeSources,
        ingredients.filter((i) => i.amount > 0 || i.name.trim()),
        editId,
      );
      executeBlendProduct(editId);
      setShowForm(false);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Execution failed.');
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this formula? No inventory has been consumed for draft/trial formulas.')) return;
    try {
      deleteBlendProduct(id);
      if (selectedId === id) setSelectedId(null);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  const tankOptionsFor = (tankId: number) => {
    if (!tankId) return chargeableTanks;
    if (chargeableTanks.some((t) => t.id === tankId)) return chargeableTanks;
    const saved = getHoldingTanks().find((t) => t.id === tankId);
    if (!saved) return chargeableTanks;
    const contents = getHoldingTankContents(tankId, undefined, editId);
    return [...chargeableTanks, { ...saved, available_gal: contents.volume_gal, available_abv: contents.abv }];
  };

  return (
    <div>
      <div className="page-header">
        <h2>Advanced Blending &amp; Product Formulation Engine</h2>
        <p>
          Multi-spirit formulation with proofing water, sugar, syrups, flavors, and colors.
          Calculations never mutate inventory — only an approved Execute Blend consumes lots and posts finished liquid.
        </p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ New Formula</button>
        </div>
      </div>

      {blends.length === 0 ? (
        <div className="empty-state">
          <p>No formulations yet. Build a theoretical recipe, run lab trials, approve, then execute against the ledger.</p>
          <button className="btn btn-primary" onClick={openNew} style={{ marginTop: '1rem' }}>Create first formula</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Product</th>
                <th>Phase</th>
                <th>Ver.</th>
                <th>Theoretical</th>
                <th>Lab / Effective</th>
                <th>Target ABV</th>
                <th>Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {blends.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.batch_number}</strong></td>
                  <td>{b.product_name}</td>
                  <td>{b.formulation_phase ?? 'theoretical'}</td>
                  <td>v{b.formula_version ?? 1}</td>
                  <td>
                    {(b.theoretical_volume_gal ?? b.final_volume_gal).toFixed(1)} gal @{' '}
                    {(b.theoretical_abv ?? b.final_abv).toFixed(1)}%
                  </td>
                  <td>
                    {b.actual_abv != null
                      ? `${(b.actual_volume_gal ?? b.final_volume_gal).toFixed(1)} gal @ ${b.actual_abv.toFixed(1)}%`
                      : '—'}
                  </td>
                  <td>{b.target_abv != null ? `${b.target_abv}%` : '—'}</td>
                  <td>{format(new Date(b.blend_date), 'MMM d, yyyy')}</td>
                  <td><StatusBadge status={b.status === 'blended' ? 'executed' : b.status} /></td>
                  <td className="td-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => setSelectedId(b.id === selectedId ? null : b.id)}>
                      Details
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => openEdit(b)}>Edit</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(b.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <div className="detail-panel formulation-detail-panel">
          <h4>Formula — {blends.find((b) => b.id === selectedId)?.product_name}</h4>

          <div className="formulation-measure-grid">
            <div className="formulation-measure-card">
              <h5>Theoretical</h5>
              {(() => {
                const b = blends.find((x) => x.id === selectedId)!;
                return (
                  <ul>
                    <li>Volume: {(b.theoretical_volume_gal ?? b.final_volume_gal).toFixed(2)} gal</li>
                    <li>ABV: {(b.theoretical_abv ?? b.final_abv).toFixed(2)}%</li>
                    <li>Density: {b.theoretical_density?.toFixed(4) ?? '—'}</li>
                    <li>Brix: {b.theoretical_brix?.toFixed(1) ?? '—'}</li>
                  </ul>
                );
              })()}
            </div>
            <div className="formulation-measure-card">
              <h5>Lab / Actual</h5>
              {(() => {
                const b = blends.find((x) => x.id === selectedId)!;
                return (
                  <ul>
                    <li>Volume: {b.actual_volume_gal?.toFixed(2) ?? '—'} gal</li>
                    <li>ABV: {b.actual_abv?.toFixed(2) ?? '—'}%</li>
                    <li>Density: {b.actual_density?.toFixed(4) ?? '—'}</li>
                    <li>Brix: {b.actual_brix?.toFixed(1) ?? '—'}</li>
                  </ul>
                );
              })()}
            </div>
          </div>

          {selectedSources.length > 0 && (
            <>
              <h5>Spirit sources</h5>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Tank</th><th>Volume</th><th>ABV</th></tr></thead>
                  <tbody>
                    {selectedSources.map((s) => (
                      <tr key={s.id}>
                        <td>{s.tank_name}</td>
                        <td>{s.volume_gal.toFixed(1)} gal</td>
                        <td>{s.abv.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {selectedIngredients.length > 0 && (
            <>
              <h5>Additives</h5>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Type</th><th>Name</th><th>Amount</th><th>Lot</th><th>Cost</th></tr>
                  </thead>
                  <tbody>
                    {selectedIngredients.map((i) => (
                      <tr key={i.id}>
                        <td><StatusBadge status={i.ingredient_type} /></td>
                        <td>{i.name || '—'}</td>
                        <td>{i.amount} {i.unit}</td>
                        <td>{i.lot_number || '—'}</td>
                        <td>{i.cost_per_unit != null ? `$${(i.cost_per_unit * i.amount).toFixed(2)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {selectedVersions.length > 0 && (
            <>
              <h5>Version history</h5>
              <ul className="formula-version-list">
                {selectedVersions.map((v) => (
                  <li key={v.id}>
                    v{v.version_number} — {format(new Date(v.created_at), 'MMM d, yyyy h:mm a')}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {showForm && (
        <Modal
          title={editId ? 'Edit Formulation' : 'New Formulation'}
          onClose={() => setShowForm(false)}
        >
          <div className="form-grid">
            <div className="form-group">
              <label>Batch Number</label>
              <input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Product Name</label>
              <input
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                placeholder="e.g. Spiced Rum, Navy Strength Gin"
              />
            </div>
            <div className="form-group">
              <label>Formulation Phase</label>
              <select
                value={form.formulation_phase}
                onChange={(e) => setForm({ ...form, formulation_phase: e.target.value as BlendFormulationPhase })}
              >
                {BLEND_FORMULATION_PHASES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as BlendStatus })}
              >
                {BLEND_STATUSES.filter((s) => s !== 'executed').map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Blend Date</label>
              <input type="date" value={form.blend_date} onChange={(e) => setForm({ ...form, blend_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Scale Factor</label>
              <div className="inline-field-row">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={form.scale_factor || 1}
                  onChange={(e) => setForm({ ...form, scale_factor: parseFloat(e.target.value) || 1 })}
                />
                <button type="button" className="btn btn-sm btn-secondary" onClick={handleScale}>Apply scale</button>
              </div>
            </div>

            <div className="form-group full-width formulation-section">
              <div className="blend-ingredients-header">
                <label>Spirit Sources (multi-spirit blending)</label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addSpiritSource}>+ Add spirit</button>
              </div>
              {spiritSources.map((src, index) => (
                <div key={index} className="blend-spirit-row">
                  <select
                    value={src.holding_tank_equipment_id || ''}
                    onChange={(e) => updateSpiritSource(index, { holding_tank_equipment_id: parseInt(e.target.value) })}
                  >
                    <option value="">— Tank —</option>
                    {tankOptionsFor(src.holding_tank_equipment_id).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.available_gal.toFixed(1)} gal @ {t.available_abv.toFixed(1)}%)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Vol (gal)"
                    value={src.volume_gal || ''}
                    onChange={(e) => updateSpiritSource(index, { volume_gal: parseFloat(e.target.value) || 0 })}
                  />
                  <input
                    type="number"
                    step="0.1"
                    placeholder="ABV %"
                    value={src.abv || ''}
                    onChange={(e) => updateSpiritSource(index, { abv: parseFloat(e.target.value) || 0 })}
                  />
                  {spiritSources.length > 1 && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeSpiritSource(index)}>×</button>
                  )}
                </div>
              ))}
            </div>

            <div className="form-group">
              <label>Target ABV (%)</label>
              <div className="inline-field-row">
                <input
                  type="number"
                  step="0.1"
                  value={form.target_abv ?? ''}
                  onChange={(e) => setForm({ ...form, target_abv: e.target.value ? parseFloat(e.target.value) : null })}
                />
                <button type="button" className="btn btn-sm btn-secondary" onClick={handleSolveWater}>Solve water</button>
              </div>
            </div>
            <div className="form-group">
              <label>Target Brix (°Bx)</label>
              <div className="inline-field-row">
                <input
                  type="number"
                  step="0.1"
                  value={form.target_brix ?? ''}
                  onChange={(e) => setForm({ ...form, target_brix: e.target.value ? parseFloat(e.target.value) : null })}
                />
                <button type="button" className="btn btn-sm btn-secondary" onClick={handleSolveSugar}>Solve sugar</button>
              </div>
            </div>

            <div className="form-group full-width formulation-section">
              <div className="blend-ingredients-header">
                <label>Additives — water, sugar, syrups, flavors, colors</label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addIngredient}>+ Add ingredient</button>
              </div>
              {ingredients.map((ing, index) => (
                <div key={index} className="blend-ingredient-row formulation-ingredient-row">
                  <select
                    value={ing.ingredient_type}
                    onChange={(e) => updateIngredient(index, { ingredient_type: e.target.value as BlendIngredientInput['ingredient_type'] })}
                  >
                    {BLEND_INGREDIENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <input placeholder="Name" value={ing.name} onChange={(e) => updateIngredient(index, { name: e.target.value })} />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={ing.amount || ''}
                    onChange={(e) => updateIngredient(index, { amount: parseFloat(e.target.value) || 0 })}
                  />
                  <select value={ing.unit} onChange={(e) => updateIngredient(index, { unit: e.target.value })}>
                    {INGREDIENT_UNITS[ing.ingredient_type].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Lot #"
                    value={ing.lot_number ?? ''}
                    onChange={(e) => updateIngredient(index, { lot_number: e.target.value })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="$/unit"
                    value={ing.cost_per_unit ?? ''}
                    onChange={(e) => updateIngredient(index, { cost_per_unit: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                  <select
                    value={ing.inventory_item_id ?? ''}
                    onChange={(e) => updateIngredient(index, {
                      inventory_item_id: e.target.value ? parseInt(e.target.value) : null,
                    })}
                  >
                    <option value="">— Inventory lot —</option>
                    {inventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.quantity} {item.unit})
                      </option>
                    ))}
                  </select>
                  {ingredients.length > 1 && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeIngredient(index)}>×</button>
                  )}
                </div>
              ))}
              <p className="field-hint">Estimated ingredient cost: ${ingredientCost.toFixed(2)}</p>
            </div>

            <div className="form-group full-width formulation-measure-grid">
              <div className="formulation-measure-card">
                <h5>Theoretical (calculated)</h5>
                <ul>
                  <li>{formulation.theoretical.volumeGal.toFixed(2)} gal</li>
                  <li>{formulation.theoretical.abv.toFixed(2)}% ABV</li>
                  <li>Density: {formulation.theoretical.density?.toFixed(4) ?? 'N/A (sugared/flavored)'}</li>
                  <li>Brix: {formulation.theoretical.brix?.toFixed(1) ?? '—'}</li>
                </ul>
                {formulation.theoretical.densityFromAbvUnreliable && (
                  <p className="field-hint">Density-from-ABV is not valid for this formula — use lab measurements.</p>
                )}
              </div>
              <div className="formulation-measure-card">
                <h5>Lab measurements (override theoretical)</h5>
                <div className="lab-input-grid">
                  <label>
                    Volume (gal)
                    <input
                      type="number"
                      step="0.01"
                      value={form.actual_volume_gal ?? ''}
                      onChange={(e) => setForm({ ...form, actual_volume_gal: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </label>
                  <label>
                    ABV (%)
                    <input
                      type="number"
                      step="0.01"
                      value={form.actual_abv ?? ''}
                      onChange={(e) => setForm({ ...form, actual_abv: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </label>
                  <label>
                    Density
                    <input
                      type="number"
                      step="0.0001"
                      value={form.actual_density ?? ''}
                      onChange={(e) => setForm({ ...form, actual_density: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </label>
                  <label>
                    Brix (°Bx)
                    <input
                      type="number"
                      step="0.1"
                      value={form.actual_brix ?? ''}
                      onChange={(e) => setForm({ ...form, actual_brix: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </label>
                </div>
                <p className="field-hint">
                  Effective: {formulation.reconciliation.effectiveSource === 'lab' ? 'lab values' : 'theoretical'} —{' '}
                  {(formulation.reconciliation.effective.volumeGal ?? 0).toFixed(2)} gal @{' '}
                  {(formulation.reconciliation.effective.abv ?? 0).toFixed(2)}%
                </p>
              </div>
            </div>

            {corrections.length > 0 && (
              <div className="form-group full-width formulation-corrections">
                <strong>Blend correction suggestions</strong>
                <ul>
                  {corrections.map((c, i) => (
                    <li key={i}>{c.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <p className="form-hint">
            Save Formula stores the recipe and version snapshot without touching inventory.
            Execute Blend (approved only) consumes tank spirit and linked inventory lots.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveFormula}>Save Formula</button>
            {editId && form.status === 'approved' && (
              <button className="btn btn-accent" onClick={handleExecute}>Execute Blend</button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
