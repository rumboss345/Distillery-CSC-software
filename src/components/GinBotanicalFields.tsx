import { IngredientSelect } from './IngredientSelect';
import { getInventoryByCategory } from '../db/queries';
import {
  emptyGinBotanical,
  normalizeBotanicalPlace,
  normalizeBotanicalWeightUnit,
} from '../lib/gin-botanicals';
import type { BotanicalPlace } from '../types';
import { NUTRIENT_UNITS } from '../lib/wash-recipe-nutrients';
import type { GinBotanicalInput } from '../types';

const WEIGHT_UNITS = NUTRIENT_UNITS.filter((unit) => unit.kind === 'weight');

export function GinBotanicalFields({
  lines,
  onChange,
}: {
  lines: GinBotanicalInput[];
  onChange: (lines: GinBotanicalInput[]) => void;
}) {
  const botanicalInventory = getInventoryByCategory('botanicals');
  const inventoryOptions = botanicalInventory.map((item) => ({
    value: item.name,
    label: item.name,
  }));
  const update = (index: number, patch: Partial<GinBotanicalInput>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  return (
    <>
      {lines.map((line, index) => (
        <div key={index} className="form-group full-width wash-nutrient-row" data-testid={`gin-botanical-row-${index}`}>
          <div className="form-grid" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label>{index === 0 ? 'Botanical' : `Botanical ${index + 1}`}</label>
              <IngredientSelect
                testId={`gin-botanical-name-${index}`}
                value={line.name}
                emptyLabel="— Select botanical from inventory —"
                noun="botanical"
                category="botanicals"
                unit={normalizeBotanicalWeightUnit(line.weight_unit)}
                options={inventoryOptions}
                orphanLabel={line.name || undefined}
                onSelect={(name) => {
                  const item = botanicalInventory.find((row) => row.name === name);
                  update(index, { name, inventory_item_id: item?.id ?? null });
                }}
                onAdded={(item) => update(index, { name: item.name, inventory_item_id: item.id })}
              />
            </div>
            <div className="form-group">
              <label>Weight</label>
              <input
                type="number"
                min="0"
                step="any"
                data-testid={`gin-botanical-weight-${index}`}
                value={line.weight || ''}
                onChange={(e) => update(index, { weight: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Unit</label>
              <select
                data-testid={`gin-botanical-unit-${index}`}
                value={normalizeBotanicalWeightUnit(line.weight_unit)}
                onChange={(e) => update(index, { weight_unit: e.target.value })}
              >
                {WEIGHT_UNITS.map((unit) => (
                  <option key={unit.value} value={unit.value}>{unit.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group full-width">
              <span className="measure-mode-label">Pot or basket</span>
              <div className="measure-mode-buttons">
                {(['pot', 'basket'] as BotanicalPlace[]).map((place) => (
                  <button
                    key={place}
                    type="button"
                    data-testid={`gin-botanical-place-${place}-${index}`}
                    className={`btn btn-sm ${normalizeBotanicalPlace(line.place) === place ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => update(index, { place })}
                  >
                    {place === 'pot' ? 'In the pot' : 'In the basket'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
          >
            Remove botanical
          </button>
        </div>
      ))}
      <div className="form-group full-width" data-testid="gin-botanicals">
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => onChange([...lines, emptyGinBotanical()])}
        >
          + Add botanical
        </button>
        <p className="field-hint">
          Choose each botanical from inventory, enter its weight, and say whether it goes in the pot or in the basket.
          A gin run uses this recipe to deduct stock.
        </p>
      </div>
    </>
  );
}
