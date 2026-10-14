import { useEffect, useRef, useState } from 'react';
import { ensureInventoryItem } from '../db/queries';
import { ADD_NEW_INGREDIENT_VALUE, addNewIngredientLabel } from '../lib/quick-ingredient';
import type { InventoryItem } from '../types';

export type IngredientOption = {
  value: string;
  label: string;
};

/** Ingredient menu whose last choice adds a new inventory item. */
export function IngredientSelect({
  value,
  options,
  category,
  unit = 'lbs',
  noun,
  testId,
  emptyLabel,
  orphanLabel,
  onSelect,
  onAdded,
}: {
  value: string;
  options: IngredientOption[];
  category: string;
  unit?: string;
  noun: string;
  testId?: string;
  emptyLabel: string;
  /** Shown when the current value is not in the list. */
  orphanLabel?: string;
  onSelect: (value: string) => void;
  onAdded: (item: InventoryItem) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const known = options.some((option) => option.value === value);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const close = () => {
    setAdding(false);
    setName('');
    setError('');
  };

  const save = (raw: string) => {
    try {
      const item = ensureInventoryItem({ name: raw, category, unit });
      onAdded(item);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that ingredient.');
    }
  };

  return (
    <div className="ingredient-select">
      <select
        data-testid={testId}
        value={adding ? ADD_NEW_INGREDIENT_VALUE : value}
        onChange={(e) => {
          const next = e.target.value;
          if (next === ADD_NEW_INGREDIENT_VALUE) {
            setError('');
            setName('');
            setAdding(true);
            return;
          }
          close();
          onSelect(next);
        }}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
        {value && !known && orphanLabel ? (
          <option value={value}>{orphanLabel}</option>
        ) : null}
        <option value={ADD_NEW_INGREDIENT_VALUE}>{addNewIngredientLabel(noun)}</option>
      </select>
      {adding ? (
        <div data-testid={testId ? `quick-add-form-${testId}` : undefined}>
          <input
            ref={inputRef}
            value={name}
            data-testid={testId ? `quick-add-name-${testId}` : undefined}
            aria-label={`New ${noun} name`}
            placeholder={`New ${noun} name`}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save(name);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
          />
          {error ? (
            <p className="quick-add-error">{error}</p>
          ) : (
            <p className="field-hint">Press Enter to add. Starts at 0 on hand. Set the quantity on Inventory when it arrives.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
