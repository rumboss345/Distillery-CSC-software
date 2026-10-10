import { useState } from 'react';
import {
  getInventoryItems,
  getInventoryCategories,
  saveInventoryItem,
  deleteInventoryItem,
  adjustInventory,
  addInventoryCategory,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { packagingItemSizeMl } from '../lib/packaging-bottles';
import type { InventoryCategory, InventoryItem } from '../types';

const emptyItem = (): Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'> => ({
  name: '',
  category: 'other',
  unit: 'lbs',
  quantity: 0,
  reorder_level: 0,
  notes: '',
  package_size_ml: null,
  density_g_per_ml: null,
  density_reference: '',
  abv: null,
});

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
  const [quantityInput, setQuantityInput] = useState('0');
  const [sizeInput, setSizeInput] = useState('');
  const [densityInput, setDensityInput] = useState('');
  const [abvInput, setAbvInput] = useState('');
  const [filter, setFilter] = useState<InventoryCategory | 'all'>('all');

  void key;

  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);

  const openNew = () => {
    setEditId(undefined);
    const category = filter !== 'all' ? filter : 'other';
    setForm({
      ...emptyItem(),
      category,
      unit: category === 'packaging' ? 'each' : 'lbs',
    });
    setQuantityInput('0');
    setSizeInput('');
    setDensityInput('');
    setAbvInput('');
    setShowForm(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditId(item.id);
    setForm({
      ...item,
      package_size_ml: item.package_size_ml ?? null,
      density_g_per_ml: item.density_g_per_ml ?? null,
      density_reference: item.density_reference ?? '',
      abv: item.abv ?? null,
    });
    setQuantityInput(String(item.quantity));
    setDensityInput(item.density_g_per_ml != null ? String(item.density_g_per_ml) : '');
    setAbvInput(item.abv != null ? String(item.abv) : '');
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
    saveInventoryItem({
      ...form,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      package_size_ml,
      density_g_per_ml: Number.isFinite(density) && density > 0 ? density : null,
      abv: abvInput.trim() === '' || !Number.isFinite(abv) ? null : abv,
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

  const handleAdjust = () => {
    if (!showAdjust) return;
    const delta = parseFloat(adjustAmount);
    if (!isNaN(delta)) {
      adjustInventory(showAdjust, delta);
      setShowAdjust(null);
      setAdjustAmount('');
      refresh();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Inventory</h2>
        <p>Raw materials and supplies. Counts can go below zero when a batch uses more than is on hand.</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ Add Item</button>
          <button className="btn btn-secondary" onClick={openNewCategory}>+ Add Category</button>
        </div>
      </div>

      <div className="choice-row" role="tablist" aria-label="Inventory categories">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={`inventory-category${filter === 'all' ? ' active' : ''}`}
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
            onClick={() => setFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>No inventory items{filter !== 'all' ? ` in category "${filter}"` : ''}.</p>
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
                    <td>{i.category}</td>
                    <td className={low ? 'num low-stock' : 'num'}>{i.quantity} {i.unit}</td>
                    <td className="num">{i.reorder_level} {i.unit}</td>
                    <td>
                      {negative
                        ? <span className="badge badge-low-stock">Negative</span>
                        : low
                          ? <span className="badge badge-low-stock">Low Stock</span>
                          : <span className="badge badge-complete">OK</span>}
                    </td>
                    <td>{i.notes}</td>
                    <td className="td-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => { setShowAdjust(i.id); setAdjustAmount(''); }}>Adjust</button>
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
                    unit: category === 'packaging' && form.unit === 'lbs' ? 'each' : form.unit,
                  });
                }}
              >
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
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
              <label>Unit</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="lbs, gal, each..." />
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
              <span className="field-hint">Unknown density is not treated as water. The blend screen shows DENSITY NOT VERIFIED until a value is saved.</span>
            </div>
            <div className="form-group">
              <label>Density source or reference temperature</label>
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
              autoFocus
            />
          </div>
          {categoryError && <div className="auth-error">{categoryError}</div>}
          <p className="form-hint">Categories are saved in lowercase and appear in the filter bar and item dropdown.</p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowCategoryForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveCategory}>Add Category</button>
          </div>
        </Modal>
      )}

      {showAdjust !== null && (
        <Modal title="Adjust Quantity" onClose={() => setShowAdjust(null)}>
          <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
            Enter a positive number to add stock, negative to remove.
          </p>
          <div className="form-group">
            <label>Adjustment ({items.find((i) => i.id === showAdjust)?.unit})</label>
            <input
              type="number"
              step="0.1"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder="e.g. 50 or -10"
              autoFocus
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowAdjust(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdjust}>Apply</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
