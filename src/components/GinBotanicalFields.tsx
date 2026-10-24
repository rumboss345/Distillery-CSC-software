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
  const inventoryOptions = getInventoryByCategory('botanicals').map((item) => ({
    value: item.name,
    label: `${item.name} (${item.quantity} ${item.unit} on hand)`,
  }));
  const update = (index: number, patch: Partial<GinBotanicalInput>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  return (
    <div className="form-group full-width" data-testid="gin-botanicals">
      <div className="bottling-lines-header">
        <label>Botanicals</label>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => onChange([...lines, emptyGinBotanical()])}
        >
          + Add botanical
        </button>
      </div>
      <p className="field-hint">
        Choose each botanical from inventory, enter its weight, and say whether it goes in the pot or in the basket. Saving a gin run takes those weights out of inventory.
      </p>
      {lines.map((line, index) => (
        <div key={index} className="form-grid" style={{ marginBottom: '0.75rem' }}>
          <div className="form-group">
            <label>Botanical</label>
            <IngredientSelect
              testId={`gin-botanical-name-${index}`}
              value={line.name}
              emptyLabel="— Select botanical —"
              noun="botanical"
              category="botanicals"
              unit={normalizeBotanicalWeightUnit(line.weight_unit)}
              options={inventoryOptions}
              orphanLabel={line.name || undefined}
              onSelect={(name) => update(index, { name })}
              onAdded={(item) => update(index, { name: item.name })}
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
            <label>Weight unit</label>
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
            <span className="measure-mode-label">Where will this botanical go?</span>
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
          {lines.length > 1 && (
            <div className="form-group">
              <label>&nbsp;</label>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => onChange(lines.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
