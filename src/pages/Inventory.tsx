import { useState } from 'react';
import {
  getInventoryItems,
  getInventoryCategories,
  saveInventoryItem,
  deleteInventoryItem,
  adjustInventory,
  addInventoryCategory,
  deleteInventoryCategory,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import {
  convertInventoryAdjustment,
  defaultAdjustmentUnit,
  defaultInventoryUnitForCategory,
  inventoryAdjustmentUnits,
  INVENTORY_UNIT_KINDS,
  inventoryCategoryLabel,
  formatInventoryOnHand,
  inventoryUnitForKind,
  inventoryUnitKind,
  inventoryUnitsForKind,
  type InventoryUnitKind,
} from '../lib/inventory-units';
import { packagingItemSizeMl } from '../lib/packaging-bottles';
import type { InventoryCategory, InventoryItem } from '../types';

const emptyItem = (): Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'> => ({
  name: '',
  category: 'other',
  unit: 'lbs',
  quantity: 0,
  reorder_level: 0,
  cost_per_unit: null,
  notes: '',
  package_size_ml: null,
  density_g_per_ml: null,
  density_reference: '',
  abv: null,
  sugar_mass_fraction: null,
  solids_mass_fraction: null,
  density_temp_c: null,
  spec_status: null,
});

function formatAdjustQty(value: number): string {
  return formatInventoryOnHand(value);
}

export function Inventory() {
  const { key, refresh } = useRefreshKey();
  const items = getInventoryItems();
  const categories = getInventoryCategories();
  const [showForm, setShowForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showAdjust, setShowAdjust] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyItem());
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustUnit, setAdjustUnit] = useState('');
  const [quantityInput, setQuantityInput] = useState('0');
  const [sizeInput, setSizeInput] = useState('');
  const [densityInput, setDensityInput] = useState('');
  const [abvInput, setAbvInput] = useState('');
  const [sugarInput, setSugarInput] = useState('');
  const [solidsInput, setSolidsInput] = useState('');
  const [densityTempInput, setDensityTempInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [filter, setFilter] = useState<InventoryCategory | 'all'>('all');

  void key;

  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);

  const openNew = () => {
    setEditId(undefined);
    const category = filter !== 'all' ? filter : 'other';
    setForm({
      ...emptyItem(),
      category,
      unit: defaultInventoryUnitForCategory(category),
    });
    setQuantityInput('0');
    setSizeInput('');
    setDensityInput('');
    setAbvInput('');
    setSugarInput('');
    setSolidsInput('');
    setDensityTempInput('');
    setCostInput('');
    setShowForm(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditId(item.id);
    setForm({
      ...item,
      unit: inventoryUnitForKind(inventoryUnitKind(item.unit), item.unit),
      package_size_ml: item.package_size_ml ?? null,
      density_g_per_ml: item.density_g_per_ml ?? null,
      density_reference: item.density_reference ?? '',
      abv: item.abv ?? null,
    });
    setQuantityInput(String(item.quantity));
    setDensityInput(item.density_g_per_ml != null ? String(item.density_g_per_ml) : '');
    setAbvInput(item.abv != null ? String(item.abv) : '');
    setSugarInput(item.sugar_mass_fraction != null ? String(item.sugar_mass_fraction * 100) : '');
    setSolidsInput(item.solids_mass_fraction != null ? String(item.solids_mass_fraction * 100) : '');
    setDensityTempInput(item.density_temp_c != null ? String(item.density_temp_c) : '');
    setCostInput(item.cost_per_unit != null ? String(item.cost_per_unit) : '');
    const size = item.category === 'packaging' ? packagingItemSizeMl(item) : null;
    setSizeInput(size ? String(size) : '');
    setShowForm(true);
  };

  const openNewCategory = () => {
    setCategoryName('');
    setCategoryError('');
    setShowCategoryForm(true);
  };

  const handleSave = () => {
    const quantity = parseFloat(quantityInput);
    const size = parseFloat(sizeInput);
    const package_size_ml = form.category === 'packaging' && Number.isFinite(size) && size > 0
      ? Math.round(size)
      : null;
    const density = parseFloat(densityInput);
    const abv = parseFloat(abvInput);
    const sugarPercent = parseFloat(sugarInput);
    const solidsPercent = parseFloat(solidsInput);
    const densityTemp = parseFloat(densityTempInput);
    const cost = parseFloat(costInput);
    saveInventoryItem({
      ...form,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      package_size_ml,
      density_g_per_ml: Number.isFinite(density) && density > 0 ? density : null,
      abv: abvInput.trim() === '' || !Number.isFinite(abv) ? null : abv,
      sugar_mass_fraction: sugarInput.trim() === '' || !Number.isFinite(sugarPercent) ? null : sugarPercent / 100,
      solids_mass_fraction: solidsInput.trim() === '' || !Number.isFinite(solidsPercent) ? null : solidsPercent / 100,
      density_temp_c: densityTempInput.trim() === '' || !Number.isFinite(densityTemp) ? null : densityTemp,
      cost_per_unit: costInput.trim() === '' || !Number.isFinite(cost) || cost < 0 ? null : cost,
    }, editId);
    setShowForm(false);
    refresh();
  };

  const handleSaveCategory = () => {
    try {
      const created = addInventoryCategory(categoryName);
      setShowCategoryForm(false);
      setCategoryName('');
      setCategoryError('');
      setForm((prev) => ({ ...prev, category: created }));
      refresh();
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Could not add category.');
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this inventory item?')) {
      deleteInventoryItem(id);
      refresh();
    }
  };

  const handleDeleteCategory = () => {
    if (filter === 'all') return;
    const label = inventoryCategoryLabel(filter);
    if (!confirm(`Delete category ${label}? Items that still use it must be deleted or moved first.`)) {
      return;
    }
    try {
      deleteInventoryCategory(filter);
      setFilter('all');
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete that category.');
    }
  };

  const adjustItem = items.find((i) => i.id === showAdjust) ?? null;
  const adjustTyped = parseFloat(adjustAmount);
  const adjustDelta = adjustItem && !isNaN(adjustTyped)
    ? convertInventoryAdjustment(adjustTyped, adjustUnit || adjustItem.unit, adjustItem.unit)
    : null;
  const adjustInOtherUnit = adjustItem != null
    && defaultAdjustmentUnit(adjustUnit || adjustItem.unit) !== defaultAdjustmentUnit(adjustItem.unit);

  const openAdjust = (item: InventoryItem) => {
    setShowAdjust(item.id);
    setAdjustAmount('');
    setAdjustUnit(defaultAdjustmentUnit(item.unit));
  };

  const handleAdjust = () => {
    if (!showAdjust || adjustDelta == null) return;
    adjustInventory(showAdjust, adjustDelta);
    setShowAdjust(null);
    setAdjustAmount('');
    refresh();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Inventory</h2>
        <p>Raw materials and supplies. Counts can go below zero when a batch uses more than is on hand.</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ Add Item</button>
          <button className="btn btn-secondary" data-testid="add-inventory-category" onClick={openNewCategory}>+ Add Category</button>
          {filter !== 'all' && (
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="delete-inventory-category"
              onClick={handleDeleteCategory}
            >
              Delete Category
            </button>
          )}
        </div>
      </div>

      <div className="choice-row" role="tablist" aria-label="Inventory categories">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={`inventory-category${filter === 'all' ? ' active' : ''}`}
          data-testid="inventory-category-all"
          onClick={() => setFilter('all')}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={filter === c}
            className={`inventory-category${filter === c ? ' active' : ''}`}
            data-testid={`inventory-category-${c}`}
            onClick={() => setFilter(c)}
          >
            {inventoryCategoryLabel(c)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>No inventory items{filter !== 'all' ? ` in category "${inventoryCategoryLabel(filter)}"` : ''}.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th className="num">On Hand</th>
                  <th className="num">Reorder Level</th>
                  <th className="num">Unit cost</th>
                  <th>Status</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const negative = i.quantity < 0;
                const low = i.quantity <= i.reorder_level;
                return (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.name}</strong>
                      {i.category === 'packaging' && i.package_size_ml != null && i.package_size_ml > 0 && (
                        <div className="field-hint">{Math.round(i.package_size_ml)} ml</div>
                      )}
                    </td>
                    <td>{inventoryCategoryLabel(i.category)}</td>
                    <td className={low ? 'num low-stock' : 'num'}>{formatInventoryOnHand(i.quantity)} {i.unit}</td>
                    <td className="num">{i.reorder_level} {i.unit}</td>
                    <td className="num">{i.cost_per_unit != null ? `$${i.cost_per_unit.toFixed(2)}` : '—'}</td>
                    <td>
                      {negative
                        ? <span className="badge badge-low-stock">Negative</span>
                        : low
                          ? <span className="badge badge-low-stock">Low Stock</span>
                          : <span className="badge badge-complete">OK</span>}
                    </td>
                    <td>{i.notes}</td>
                    <td className="td-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => openAdjust(i)}>Adjust</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(i)}>Edit</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(i.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Item' : 'Add Inventory Item'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select
                value={form.category}
                onChange={(e) => {
                  const category = e.target.value;
                  setForm({
                    ...form,
                    category,
                    unit: category === 'packaging' && inventoryUnitKind(form.unit) === 'mass'
                      ? defaultInventoryUnitForCategory(category)
                      : form.unit,
                  });
                }}
              >
                {categories.map((c) => <option key={c} value={c}>{inventoryCategoryLabel(c)}</option>)}
              </select>
            </div>
            {form.category === 'packaging' && (
              <div className="form-group">
                <label>Bottle or package size (ml)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  data-testid="packaging-size-ml"
                  value={sizeInput}
                  onChange={(e) => setSizeInput(e.target.value)}
                  placeholder="750"
                />
                <span className="field-hint">Used when you bottle with this item.</span>
              </div>
            )}
            <div className="form-group">
              <label>Unit cost ($)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                placeholder="Optional — used in the owner's Production costing report"
              />
            </div>
            <div className="form-group">
              <label>Measure</label>
              <select
                data-testid="inventory-unit-kind"
                value={inventoryUnitKind(form.unit)}
                onChange={(e) => {
                  const kind = e.target.value as InventoryUnitKind;
                  setForm({ ...form, unit: inventoryUnitForKind(kind, form.unit) });
                }}
              >
                {INVENTORY_UNIT_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>{kind.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Unit</label>
              <select
                data-testid="inventory-unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {inventoryUnitsForKind(inventoryUnitKind(form.unit), form.unit).map((unit) => (
                  <option key={unit.value} value={unit.value}>{unit.label}</option>
                ))}
              </select>
              <p className="field-hint">Choose volume, mass, or each, then the unit this item is counted in.</p>
            </div>
            <div className="form-group">
              <label>Quantity</label>
              <input
                type="number"
                step="0.1"
                value={quantityInput}
                onChange={(e) => setQuantityInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Density (g/mL) — optional</label>
              <input
                type="number"
                step="0.001"
                min="0"
                data-testid="inventory-density"
                value={densityInput}
                onChange={(e) => setDensityInput(e.target.value)}
                placeholder="Leave blank if unknown"
              />
              <span className="field-hint">Leave blank when unknown. The blend calculator will not invent a density.</span>
            </div>
            <div className="form-group">
              <label>Density measured at (°C)</label>
              <input
                type="number"
                step="0.1"
                value={densityTempInput}
                onChange={(e) => setDensityTempInput(e.target.value)}
                placeholder="Blank if unknown"
              />
            </div>
            <div className="form-group">
              <label>Specification status</label>
              <select
                value={form.spec_status ?? ''}
                onChange={(e) => setForm({
                  ...form,
                  spec_status: e.target.value === 'verified' || e.target.value === 'estimated' ? e.target.value : null,
                })}
              >
                <option value="">Not recorded</option>
                <option value="estimated">Estimated — entered, not confirmed</option>
                <option value="verified">Verified — supplier or lab spec</option>
              </select>
            </div>
            <div className="form-group">
              <label>Sugar by mass (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={sugarInput}
                onChange={(e) => setSugarInput(e.target.value)}
                placeholder="Blank if unknown"
              />
              <span className="field-hint">Supplier sugar or Brix-as-mass for syrups. Leave blank rather than guessing.</span>
            </div>
            <div className="form-group">
              <label>Solids by mass (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={solidsInput}
                onChange={(e) => setSolidsInput(e.target.value)}
                placeholder="Blank if unknown"
              />
            </div>
            <div className="form-group">
              <label>Specification source</label>
              <input
                value={form.density_reference ?? ''}
                onChange={(e) => setForm({ ...form, density_reference: e.target.value })}
                placeholder="Sheet, lot spec, or temperature note"
              />
            </div>
            <div className="form-group">
              <label>ABV % — optional</label>
              <input
                type="number"
                step="0.1"
                min="0"
                data-testid="inventory-abv"
                value={abvInput}
                onChange={(e) => setAbvInput(e.target.value)}
                placeholder="Blank if non-alcoholic or unknown"
              />
              <span className="field-hint">Alcohol in this ingredient counts toward total absolute alcohol.</span>
            </div>
            <div className="form-group">
              <label>Reorder Level</label>
              <input type="number" step="0.1" value={form.reorder_level || ''} onChange={(e) => setForm({ ...form, reorder_level: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </Modal>
      )}

      {showCategoryForm && (
        <Modal title="Add Category" onClose={() => setShowCategoryForm(false)}>
          <div className="form-group">
            <label>Category Name</label>
            <input
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value);
                setCategoryError('');
              }}
              placeholder="e.g. spices, corks, packaging"
              data-testid="inventory-category-name"
              autoFocus
            />
          </div>
          {categoryError && <div className="auth-error">{categoryError}</div>}
          <p className="form-hint">Categories are saved in lowercase and appear in the filter bar and item dropdown.</p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowCategoryForm(false)}>Cancel</button>
            <button className="btn btn-primary" data-testid="save-inventory-category" onClick={handleSaveCategory}>Add Category</button>
          </div>
        </Modal>
      )}

      {showAdjust !== null && adjustItem && (
        <Modal title="Adjust Quantity" onClose={() => setShowAdjust(null)}>
          <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
            Enter a positive number to add stock, negative to remove.
            {inventoryAdjustmentUnits(adjustItem.unit).length > 1 && (
              <> You can enter a delivery in a larger unit. It is converted to {adjustItem.unit}, the unit used day to day.</>
            )}
          </p>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="inventory-adjust-amount">Adjustment</label>
              <input
                id="inventory-adjust-amount"
                data-testid="inventory-adjust-amount"
                type="number"
                step="any"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g. 50 or -10"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="inventory-adjust-unit">Unit</label>
              <select
                id="inventory-adjust-unit"
                data-testid="inventory-adjust-unit"
                value={adjustUnit}
                onChange={(e) => setAdjustUnit(e.target.value)}
              >
                {inventoryAdjustmentUnits(adjustItem.unit).map((unit) => (
                  <option key={unit.value} value={unit.value}>{unit.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="field-hint" data-testid="inventory-adjust-preview">
            On hand now: {formatInventoryOnHand(adjustItem.quantity)} {adjustItem.unit}.
            {adjustDelta != null && adjustDelta !== 0 && (
              <>
                {' '}
                {adjustInOtherUnit && (
                  <>{adjustTyped} {inventoryAdjustmentUnits(adjustItem.unit).find((u) => u.value === adjustUnit)?.label ?? adjustUnit} = {formatAdjustQty(adjustDelta)} {adjustItem.unit}. </>
                )}
                After: {formatAdjustQty(adjustItem.quantity + adjustDelta)} {adjustItem.unit}.
              </>
            )}
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowAdjust(null)}>Cancel</button>
            <button className="btn btn-primary" data-testid="inventory-adjust-apply" onClick={handleAdjust} disabled={adjustDelta == null}>Apply</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
