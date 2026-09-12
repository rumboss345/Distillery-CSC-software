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
import { AssignedUsersBar } from '../components/AssignedUsersBar';
import { logUserAction } from '../lib/activity-log';
import type { InventoryCategory, InventoryItem } from '../types';

const emptyItem = (): Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'> => ({
  name: '',
  category: 'other',
  unit: 'lbs',
  quantity: 0,
  reorder_level: 0,
  notes: '',
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
  const [filter, setFilter] = useState<InventoryCategory | 'all'>('all');

  void key;

  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyItem());
    setShowForm(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditId(item.id);
    setForm({ ...item });
    setShowForm(true);
  };

  const openNewCategory = () => {
    setCategoryName('');
    setCategoryError('');
    setShowCategoryForm(true);
  };

  const handleSave = () => {
    saveInventoryItem(form, editId);
    void logUserAction('inventory', `${editId ? 'Updated' : 'Created'} inventory item ${form.name}`);
    setShowForm(false);
    refresh();
  };

  const handleSaveCategory = () => {
    try {
      const created = addInventoryCategory(categoryName);
      void logUserAction('inventory', `Added category ${created}`);
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
      const item = items.find((i) => i.id === showAdjust);
      adjustInventory(showAdjust, delta);
      void logUserAction('inventory', `Adjusted ${item?.name ?? 'item'} by ${delta > 0 ? '+' : ''}${delta}`);
      setShowAdjust(null);
      setAdjustAmount('');
      refresh();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Inventory</h2>
        <p>Raw materials and supplies on hand</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ Add Item</button>
          <button className="btn btn-secondary" onClick={openNewCategory}>+ Add Category</button>
        </div>
      </div>

      <AssignedUsersBar actionKey="inventory" refreshKey={key} />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm${filter === 'all' ? ' btn-primary' : ' btn-secondary'}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            className={`btn btn-sm${filter === c ? ' btn-primary' : ' btn-secondary'}`}
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
                <th>On Hand</th>
                <th>Reorder Level</th>
                <th>Status</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const low = i.quantity <= i.reorder_level;
                return (
                  <tr key={i.id}>
                    <td><strong>{i.name}</strong></td>
                    <td>{i.category}</td>
                    <td className={low ? 'low-stock' : ''}>{i.quantity} {i.unit}</td>
                    <td>{i.reorder_level} {i.unit}</td>
                    <td>{low ? <span className="badge badge-low-stock">Low Stock</span> : <span className="badge badge-complete">OK</span>}</td>
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
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Unit</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="lbs, gal, each..." />
            </div>
            <div className="form-group">
              <label>Quantity</label>
              <input type="number" step="0.1" value={form.quantity || ''} onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })} />
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
