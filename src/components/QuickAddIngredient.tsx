import { useState } from 'react';
import { ensureInventoryItem } from '../db/queries';
import { inventoryNameExists } from '../lib/quick-ingredient';
import type { InventoryItem } from '../types';

export function QuickAddIngredient({
  category,
  unit = 'lbs',
  label,
  typedName,
  existingNames,
  testId,
  onAdded,
}: {
  category: string;
  unit?: string;
  label: string;
  /** When set, save this typed name instead of opening a second name field. */
  typedName?: string;
  existingNames?: string[];
  testId?: string;
  onAdded: (item: InventoryItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const save = (raw: string) => {
    try {
      const item = ensureInventoryItem({ name: raw, category, unit });
      onAdded(item);
      setName('');
      setError('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that ingredient.');
    }
  };

  if (typedName !== undefined) {
    const trimmed = typedName.trim();
    if (!trimmed || inventoryNameExists(existingNames ?? [], trimmed)) {
      return null;
    }
    return (
      <div className="quick-add-ingredient">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          data-testid={testId ? `quick-add-${testId}` : undefined}
          onClick={() => save(trimmed)}
        >
          + Add &quot;{trimmed}&quot; to inventory
        </button>
        {error ? <p className="quick-add-error">{error}</p> : null}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-ghost quick-add-ingredient"
        data-testid={testId ? `quick-add-${testId}` : undefined}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        + Add new {label}
      </button>
    );
  }

  return (
    <div className="quick-add-ingredient" data-testid={testId ? `quick-add-form-${testId}` : undefined}>
      <div className="inline-field-row">
        <input
          value={name}
          data-testid={testId ? `quick-add-name-${testId}` : undefined}
          aria-label={`New ${label} name`}
          placeholder={`New ${label} name`}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save(name);
            }
          }}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          data-testid={testId ? `quick-add-save-${testId}` : undefined}
          onClick={() => save(name)}
        >
          Add
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => {
            setOpen(false);
            setName('');
            setError('');
          }}
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="quick-add-error">{error}</p>
      ) : (
        <p className="field-hint">Starts at 0 on hand. Set the quantity on Inventory when it arrives.</p>
      )}
    </div>
  );
}
