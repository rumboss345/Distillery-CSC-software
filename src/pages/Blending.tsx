import { useState } from 'react';
import { format } from 'date-fns';
import {
  getBlendProducts,
  getBlendIngredients,
  saveBlendProduct,
  deleteBlendProduct,
  getChargeableHoldingTanksForBlend,
  getHoldingTankContents,
  getHoldingTanks,
  generateBatchNumber,
  holdingTankIntakeKey,
  useRefreshKey,
} from '../db/queries';
import { HoldingTankIntakeHistory } from '../components/HoldingTankIntakeHistory';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import {
  BLEND_INGREDIENT_TYPES,
  INGREDIENT_UNITS,
  computeBlendTotals,
  defaultIngredientUnit,
} from '../lib/blending';
import type { BlendIngredientInput, BlendProduct, BlendStatus, HoldingTankIntakeEntry } from '../types';

const BLEND_STATUSES: BlendStatus[] = ['draft', 'blended', 'bottled'];

const emptyIngredient = (type: BlendIngredientInput['ingredient_type'] = 'water'): BlendIngredientInput => ({
  ingredient_type: type,
  name: type === 'water' ? 'Dilution water' : '',
  amount: 0,
  unit: defaultIngredientUnit(type),
  notes: '',
});

const emptyProduct = (): Omit<BlendProduct, 'id' | 'created_at' | 'final_volume_gal' | 'final_abv'> => ({
  batch_number: generateBatchNumber('BL'),
  product_name: '',
  source_holding_tank_equipment_id: 0,
  base_spirit_volume_gal: 0,
  base_spirit_abv: 0,
  blend_date: new Date().toISOString().slice(0, 10),
  target_abv: null,
  status: 'draft',
  notes: '',
});

export function Blending() {
  const { key, refresh } = useRefreshKey();
  const blends = getBlendProducts();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyProduct());
  const [ingredients, setIngredients] = useState<BlendIngredientInput[]>([
    emptyIngredient('water'),
  ]);
  const [selectedIntakeKey, setSelectedIntakeKey] = useState<string | null>(null);

  void key;

  const applyIntakeVolume = (entry: HoldingTankIntakeEntry) => ({
    volume: Math.round(entry.volume_gal * 10) / 10,
    abv: Math.round(entry.abv * 10) / 10,
  });

  const chargeableTanks = getChargeableHoldingTanksForBlend(editId);
  const tankOptions = (() => {
    if (!form.source_holding_tank_equipment_id) return chargeableTanks;
    if (chargeableTanks.some((t) => t.id === form.source_holding_tank_equipment_id)) {
      return chargeableTanks;
    }
    const saved = getHoldingTanks().find((t) => t.id === form.source_holding_tank_equipment_id);
    if (!saved) return chargeableTanks;
    return [
      ...chargeableTanks,
      { ...saved, available_gal: form.base_spirit_volume_gal, available_abv: form.base_spirit_abv },
    ];
  })();
  const selectedTankAvailable = form.source_holding_tank_equipment_id
    ? getHoldingTankContents(form.source_holding_tank_equipment_id, undefined, editId)
    : null;

  const preview = computeBlendTotals(
    form.base_spirit_volume_gal,
    form.base_spirit_abv,
    ingredients,
  );

  const selectedIngredients = selectedId ? getBlendIngredients(selectedId) : [];

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyProduct());
    setIngredients([emptyIngredient('water')]);
    setSelectedIntakeKey(null);
    setShowForm(true);
  };

  const openEdit = (blend: BlendProduct) => {
    setEditId(blend.id);
    setForm({
      batch_number: blend.batch_number,
      product_name: blend.product_name,
      source_holding_tank_equipment_id: blend.source_holding_tank_equipment_id,
      base_spirit_volume_gal: blend.base_spirit_volume_gal,
      base_spirit_abv: blend.base_spirit_abv,
      blend_date: blend.blend_date,
      target_abv: blend.target_abv,
      status: blend.status,
      notes: blend.notes,
    });
    const ings = getBlendIngredients(blend.id);
    setIngredients(
      ings.length > 0
        ? ings.map((i) => ({
          ingredient_type: i.ingredient_type,
          name: i.name,
          amount: i.amount,
          unit: i.unit,
          notes: i.notes,
        }))
        : [emptyIngredient('water')],
    );
    setShowForm(true);
  };

  const handleTankChange = (tankId: number) => {
    setSelectedIntakeKey(null);
    const tank = chargeableTanks.find((t) => t.id === tankId);
    setForm({
      ...form,
      source_holding_tank_equipment_id: tankId,
      base_spirit_volume_gal: tank?.available_gal ?? 0,
      base_spirit_abv: tank?.available_abv ?? 0,
    });
  };

  const updateIngredient = (index: number, patch: Partial<BlendIngredientInput>) => {
    setIngredients((prev) => prev.map((ing, i) => {
      if (i !== index) return ing;
      const next = { ...ing, ...patch };
      if (patch.ingredient_type) {
        next.unit = defaultIngredientUnit(patch.ingredient_type);
        if (patch.ingredient_type === 'water' && !next.name) next.name = 'Dilution water';
      }
      return next;
    }));
  };

  const addIngredient = () => {
    setIngredients((prev) => [...prev, emptyIngredient('flavoring')]);
  };

  const removeIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!form.product_name.trim()) {
      alert('Enter a product name.');
      return;
    }
    if (!form.source_holding_tank_equipment_id) {
      alert('Select a base spirit holding tank.');
      return;
    }
    if (form.base_spirit_volume_gal <= 0) {
      alert('Enter base spirit volume drawn from the tank.');
      return;
    }
    const available = getHoldingTankContents(
      form.source_holding_tank_equipment_id,
      undefined,
      editId,
    );
    if (form.base_spirit_volume_gal > available.volume_gal + 0.01) {
      alert(`Only ${available.volume_gal.toFixed(1)} gal available in that tank.`);
      return;
    }
    saveBlendProduct(form, ingredients.filter((i) => i.amount > 0 || i.name.trim()), editId);
    setShowForm(false);
    refresh();
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this blend product and its recipe? Spirit will return to the holding tank balance.')) {
      deleteBlendProduct(id);
      if (selectedId === id) setSelectedId(null);
      refresh();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Blending</h2>
        <p>Create products from holding tank spirit — dilution, sugar, flavorings, and more</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ New Blend Product</button>
        </div>
      </div>

      {blends.length === 0 ? (
        <div className="empty-state">
          <p>No blend products yet. Start with spirit in a holding tank, then create a recipe.</p>
          <button className="btn btn-primary" onClick={openNew} style={{ marginTop: '1rem' }}>Create first blend</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Product</th>
                <th>Base Spirit Tank</th>
                <th>Spirit Used</th>
                <th>Final Volume</th>
                <th>Final ABV</th>
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
                  <td>{b.source_tank_name}</td>
                  <td>{b.base_spirit_volume_gal.toFixed(1)} gal @ {b.base_spirit_abv.toFixed(1)}%</td>
                  <td>{b.final_volume_gal.toFixed(1)} gal</td>
                  <td><strong>{b.final_abv.toFixed(1)}%</strong></td>
                  <td>{b.target_abv != null ? `${b.target_abv}%` : '—'}</td>
                  <td>{format(new Date(b.blend_date), 'MMM d, yyyy')}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="td-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => setSelectedId(b.id === selectedId ? null : b.id)}>
                      Recipe
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
        <div className="detail-panel">
          <h4>
            Recipe — {blends.find((b) => b.id === selectedId)?.product_name}
          </h4>
          {selectedIngredients.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No additives — base spirit only.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Type</th><th>Name</th><th>Amount</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {selectedIngredients.map((i) => (
                    <tr key={i.id}>
                      <td><StatusBadge status={i.ingredient_type} /></td>
                      <td>{i.name || '—'}</td>
                      <td>{i.amount} {i.unit}</td>
                      <td>{i.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Blend Product' : 'New Blend Product'} onClose={() => setShowForm(false)}>
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
            <div className="form-group full-width">
              <label>Base Spirit — Holding Tank</label>
              <select
                value={form.source_holding_tank_equipment_id || ''}
                onChange={(e) => handleTankChange(parseInt(e.target.value))}
              >
                <option value="">— Select tank —</option>
                {tankOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.available_gal.toFixed(1)} gal @ {t.available_abv.toFixed(1)}%)
                  </option>
                ))}
              </select>
              {tankOptions.length === 0 && (
                <p className="field-hint">No spirit in holding tanks — add distillation cuts first.</p>
              )}
              {selectedTankAvailable && form.source_holding_tank_equipment_id > 0 && (
                <p className="field-hint">
                  Available: {selectedTankAvailable.volume_gal.toFixed(1)} gal @ {selectedTankAvailable.abv.toFixed(1)}% ABV
                </p>
              )}
              <HoldingTankIntakeHistory
                tankId={form.source_holding_tank_equipment_id || null}
                selectedKey={selectedIntakeKey}
                onSelect={(entry) => {
                  const { volume, abv } = applyIntakeVolume(entry);
                  setSelectedIntakeKey(holdingTankIntakeKey(entry));
                  setForm({
                    ...form,
                    base_spirit_volume_gal: volume,
                    base_spirit_abv: abv,
                  });
                }}
              />
            </div>
            <div className="form-group">
              <label>Base Spirit Volume (gal)</label>
              <input
                type="number"
                step="0.1"
                value={form.base_spirit_volume_gal || ''}
                onChange={(e) => setForm({ ...form, base_spirit_volume_gal: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Base Spirit ABV (%)</label>
              <input
                type="number"
                step="0.1"
                value={form.base_spirit_abv || ''}
                onChange={(e) => setForm({ ...form, base_spirit_abv: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Target ABV (%)</label>
              <input
                type="number"
                step="0.1"
                value={form.target_abv ?? ''}
                onChange={(e) => setForm({ ...form, target_abv: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="Optional goal"
              />
            </div>
            <div className="form-group">
              <label>Blend Date</label>
              <input type="date" value={form.blend_date} onChange={(e) => setForm({ ...form, blend_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BlendStatus })}>
                {BLEND_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group full-width blend-ingredients-section">
              <div className="blend-ingredients-header">
                <label>Recipe Additives</label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addIngredient}>+ Add ingredient</button>
              </div>
              {ingredients.map((ing, index) => (
                <div key={index} className="blend-ingredient-row">
                  <select
                    value={ing.ingredient_type}
                    onChange={(e) => updateIngredient(index, { ingredient_type: e.target.value as BlendIngredientInput['ingredient_type'] })}
                  >
                    {BLEND_INGREDIENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Name"
                    value={ing.name}
                    onChange={(e) => updateIngredient(index, { name: e.target.value })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={ing.amount || ''}
                    onChange={(e) => updateIngredient(index, { amount: parseFloat(e.target.value) || 0 })}
                  />
                  <select
                    value={ing.unit}
                    onChange={(e) => updateIngredient(index, { unit: e.target.value })}
                  >
                    {INGREDIENT_UNITS[ing.ingredient_type].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Notes"
                    value={ing.notes}
                    onChange={(e) => updateIngredient(index, { notes: e.target.value })}
                  />
                  {ingredients.length > 1 && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeIngredient(index)}>×</button>
                  )}
                </div>
              ))}
            </div>

            <div className="form-group full-width blend-preview">
              <strong>Calculated result:</strong>{' '}
              {preview.finalVolumeGal.toFixed(1)} gal @ {preview.finalAbv.toFixed(1)}% ABV
              {form.target_abv != null && (
                <span style={{ marginLeft: '0.75rem', color: 'var(--text-muted)' }}>
                  (target {form.target_abv}%)
                </span>
              )}
            </div>

            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <p className="form-hint">
            Base spirit is drawn from the holding tank when saved. Add water to dilute, sugar and flavorings as needed.
            Create multiple products from the same tank before bottling.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save Blend</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
