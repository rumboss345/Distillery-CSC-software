import { useEffect, useState } from 'react';
import {
  deleteGinRecipe,
  getGinRecipes,
  getInventoryByCategory,
  saveGinRecipe,
  useRefreshKey,
} from '../db/queries';
import { GinBotanicalFields } from './GinBotanicalFields';
import { Modal } from './Modal';
import { botanicalsFromRecipe, emptyGinBotanical, formatGinBotanicalsSummary } from '../lib/gin-botanicals';
import type { GinBotanicalInput, GinRecipe } from '../types';

export function GinRecipesTab({
  openForm = false,
  onFormOpened,
}: {
  openForm?: boolean;
  onFormOpened?: () => void;
}) {
  const { key, refresh } = useRefreshKey();
  const recipes = getGinRecipes();
  void key;
  const botanicalNames = getInventoryByCategory('botanicals').map((item) => item.name);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<GinBotanicalInput[]>([emptyGinBotanical()]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = recipes.find((recipe) => recipe.id === selectedId);

  const openNew = () => {
    setEditId(undefined);
    setName('');
    setNotes('');
    setLines([emptyGinBotanical()]);
    setShowForm(true);
  };

  useEffect(() => {
    if (!openForm) return;
    openNew();
    onFormOpened?.();
  }, [openForm]);

  const openEdit = (recipe: GinRecipe) => {
    setEditId(recipe.id);
    setName(recipe.name);
    setNotes(recipe.notes);
    setLines(botanicalsFromRecipe(recipe.botanicals));
    setShowForm(true);
  };

  const handleSave = () => {
    try {
      saveGinRecipe({ name, notes }, editId, lines);
      setShowForm(false);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save gin recipe.');
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this gin recipe?')) return;
    deleteGinRecipe(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  return (
    <>
      {recipes.length === 0 ? (
        <div className="empty-state card">
          <p>No gin recipes yet. Save a botanical formula here, then load it on a gin run.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recipe</th>
                <th>Botanicals</th>
                <th></th>
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
                  <td>{formatGinBotanicalsSummary(recipe.botanicals) || '—'}</td>
                  <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(recipe)}>Edit</button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDelete(recipe.id)}>Delete</button>
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
          <p>{formatGinBotanicalsSummary(selected.botanicals) || 'No botanicals.'}</p>
          {selected.notes ? <p className="field-hint">{selected.notes}</p> : null}
        </div>
      )}
      {showForm && (
        <Modal title={editId ? 'Edit Gin Recipe' : 'New Gin Recipe'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Recipe Name</label>
              <input
                data-testid="gin-recipe-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="House gin"
              />
            </div>
            <GinBotanicalFields lines={lines} onChange={setLines} inventoryNames={botanicalNames} />
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
              Save Recipe
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
